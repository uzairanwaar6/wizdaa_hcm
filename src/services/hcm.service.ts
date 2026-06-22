import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LeaveType } from '../common/enums/leave-type.enum';
import {
  HcmBalanceSnapshot,
  HcmClient,
  HcmRejectionError,
  HcmTimeOffCommand,
  HcmUnavailableError,
} from '../common/hcm/hcm-client.interface';

@Injectable()
export class HttpHcmClient implements HcmClient {
  private readonly logger = new Logger(HttpHcmClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const hcm = config.get<AppConfig['hcm']>('hcm');
    this.baseUrl = (hcm?.baseUrl ?? 'http://localhost:4000').replace(/\/+$/, '');
    this.apiKey = hcm?.apiKey ?? '';
    this.timeoutMs = hcm?.timeoutMs ?? 5000;
  }

  async getBalance(
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): Promise<HcmBalanceSnapshot> {
    const path = `/balances/${encodeURIComponent(employeeId)}/${encodeURIComponent(
      locationId,
    )}/${encodeURIComponent(leaveType)}`;
    return this.request<HcmBalanceSnapshot>('GET', path);
  }

  async postTimeOff(command: HcmTimeOffCommand): Promise<void> {
    await this.request<void>('POST', '/time-off', command);
  }

  async cancelTimeOff(externalRef: string, command: HcmTimeOffCommand): Promise<void> {
    await this.request<void>(
      'POST',
      `/time-off/${encodeURIComponent(externalRef)}/cancel`,
      command,
    );
  }

  async fetchBatch(): Promise<HcmBalanceSnapshot[]> {
    return this.request<HcmBalanceSnapshot[]>('GET', '/balances/batch');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`HCM ${method} ${path} unreachable: ${reason}`);
      throw new HcmUnavailableError(`HCM unreachable: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      if (res.status === 204) {
        return undefined as T;
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const payload = await this.safeJson(res);
    if (res.status >= 500) {
      this.logger.warn(`HCM ${method} ${path} returned ${res.status}`);
      throw new HcmUnavailableError(`HCM returned ${res.status}`);
    }

    const reason = this.mapReason(payload);
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as Record<string, unknown>).message)
        : undefined) ?? `HCM rejected request (${res.status})`;
    throw new HcmRejectionError(message, reason);
  }

  private mapReason(payload: unknown): HcmRejectionError['reason'] {
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as Record<string, unknown>).error).toUpperCase()
        : '';
    if (code.includes('INSUFFICIENT')) return 'INSUFFICIENT_BALANCE';
    if (code.includes('DIMENSION') || code.includes('INVALID')) return 'INVALID_DIMENSIONS';
    return 'REJECTED';
  }

  private async safeJson(res: Response): Promise<unknown> {
    try {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}
