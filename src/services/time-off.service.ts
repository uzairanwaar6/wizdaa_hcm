import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveType } from '../common/enums/leave-type.enum';
import { TimeOffStatus } from '../common/enums/time-off-status.enum';
import {
  HCM_CLIENT,
  HcmClient,
  HcmRejectionError,
  HcmTimeOffCommand,
  HcmUnavailableError,
} from '../common/hcm/hcm-client.interface';
import { TimeOffRequest } from '../database/entities/time-off-request.entity';
import { BalancesService, BalanceKey } from './balances.service';

export interface CreateTimeOffInput {
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;

  numberOfDays?: number;
  idempotencyKey?: string;
}

export interface ListTimeOffFilter {
  employeeId?: string;
  locationId?: string;
  leaveType?: LeaveType;
  status?: TimeOffStatus;
}

@Injectable()
export class TimeOffService {
  private readonly logger = new Logger(TimeOffService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requests: Repository<TimeOffRequest>,
    private readonly balances: BalancesService,
    @Inject(HCM_CLIENT)
    private readonly hcm: HcmClient,
  ) {}

  get(id: string): Promise<TimeOffRequest> {
    return this.getOrFail(id);
  }

  list(filter: ListTimeOffFilter = {}): Promise<TimeOffRequest[]> {
    return this.requests.find({ where: { ...filter }, order: { createdAt: 'DESC' } });
  }

  async create(input: CreateTimeOffInput): Promise<TimeOffRequest> {
    const days = this.resolveDays(input);
    const key: BalanceKey = {
      employeeId: input.employeeId,
      locationId: input.locationId,
      leaveType: input.leaveType,
    };

    if (input.idempotencyKey) {
      const prior = await this.requests.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (prior) {
        return prior;
      }
    }

    let balance;
    try {
      balance = await this.balances.getOrPull(key);
    } catch (err) {
      throw this.mapHcmError(err);
    }

    const free = BalancesService.freeDays(balance);
    if (days > free) {
      throw new UnprocessableEntityException(
        `Insufficient balance: requested ${days} day(s), ${free} available.`,
      );
    }

    const id = randomUUID();
    const command: HcmTimeOffCommand = {
      ...key,
      numberOfDays: days,
      startDate: input.startDate,
      endDate: input.endDate,
      externalRef: id,
    };

    try {
      await this.hcm.postTimeOff(command);
    } catch (err) {
      throw this.mapHcmError(err);
    }

    let reserved = false;
    try {
      await this.balances.reserve(key, days);
      reserved = true;
      const request = this.requests.create({
        id,
        ...key,
        startDate: input.startDate,
        endDate: input.endDate,
        numberOfDays: days,
        status: TimeOffStatus.PENDING,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      return await this.requests.save(request);
    } catch (err) {
      if (reserved) {
        await this.balances.release(key, days).catch(() => undefined);
      }
      await this.compensate(command);
      throw err;
    }
  }

  async approve(id: string, managerId: string): Promise<TimeOffRequest> {
    const request = await this.getOrFail(id);
    this.assertStatus(request, TimeOffStatus.PENDING, 'approved');

    await this.balances.commit(this.keyOf(request), request.numberOfDays);
    return this.decide(request, TimeOffStatus.APPROVED, managerId);
  }

  async reject(id: string, managerId: string, reason?: string): Promise<TimeOffRequest> {
    const request = await this.getOrFail(id);
    this.assertStatus(request, TimeOffStatus.PENDING, 'rejected');

    await this.releaseInHcm(request);
    await this.balances.release(this.keyOf(request), request.numberOfDays);
    return this.decide(request, TimeOffStatus.REJECTED, managerId, reason);
  }

  async cancel(id: string, reason?: string): Promise<TimeOffRequest> {
    const request = await this.getOrFail(id);
    if (request.status !== TimeOffStatus.PENDING && request.status !== TimeOffStatus.APPROVED) {
      throw new ConflictException(`Request ${id} is ${request.status} and cannot be cancelled.`);
    }

    await this.releaseInHcm(request);
    const key = this.keyOf(request);
    if (request.status === TimeOffStatus.APPROVED) {
      await this.balances.restore(key, request.numberOfDays);
    } else {
      await this.balances.release(key, request.numberOfDays);
    }

    request.status = TimeOffStatus.CANCELLED;
    request.reason = reason ?? request.reason;
    return this.requests.save(request);
  }

  private async getOrFail(id: string): Promise<TimeOffRequest> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Time-off request ${id} not found.`);
    }
    return request;
  }

  private keyOf(request: TimeOffRequest): BalanceKey {
    return {
      employeeId: request.employeeId,
      locationId: request.locationId,
      leaveType: request.leaveType,
    };
  }

  private assertStatus(request: TimeOffRequest, expected: TimeOffStatus, action: string): void {
    if (request.status !== expected) {
      throw new ConflictException(
        `Request ${request.id} is ${request.status}; only ${expected} requests can be ${action}.`,
      );
    }
  }

  private async decide(
    request: TimeOffRequest,
    status: TimeOffStatus,
    managerId: string,
    reason?: string,
  ): Promise<TimeOffRequest> {
    request.status = status;
    request.decidedBy = managerId;
    request.decidedAt = new Date();
    if (reason !== undefined) {
      request.reason = reason;
    }
    return this.requests.save(request);
  }

  private async releaseInHcm(request: TimeOffRequest): Promise<void> {
    const command: HcmTimeOffCommand = {
      ...this.keyOf(request),
      numberOfDays: request.numberOfDays,
      startDate: request.startDate,
      endDate: request.endDate,
      externalRef: request.id,
    };
    try {
      await this.hcm.cancelTimeOff(request.id, command);
    } catch (err) {
      throw this.mapHcmError(err);
    }
  }

  private async compensate(command: HcmTimeOffCommand): Promise<void> {
    try {
      await this.hcm.cancelTimeOff(command.externalRef, command);
    } catch (err) {
      this.logger.error(
        `Failed to compensate HCM reservation ${command.externalRef}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  private mapHcmError(err: unknown): Error {
    if (err instanceof HcmRejectionError) {
      return new UnprocessableEntityException(`HCM rejected: ${err.message}`);
    }
    if (err instanceof HcmUnavailableError) {
      return new ServiceUnavailableException(
        'HCM is unavailable; request cannot be confirmed right now.',
      );
    }
    return err instanceof Error ? err : new Error('Unknown error');
  }

  private resolveDays(input: CreateTimeOffInput): number {
    const start = new Date(`${input.startDate}T00:00:00Z`);
    const end = new Date(`${input.endDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('startDate and endDate must be valid ISO dates (YYYY-MM-DD).');
    }
    if (end.getTime() < start.getTime()) {
      throw new BadRequestException('endDate must be on or after startDate.');
    }
    if (input.numberOfDays !== undefined) {
      if (input.numberOfDays <= 0) {
        throw new BadRequestException('numberOfDays must be greater than zero.');
      }
      return input.numberOfDays;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  }
}
