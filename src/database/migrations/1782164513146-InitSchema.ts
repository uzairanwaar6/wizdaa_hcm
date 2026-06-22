import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1782164513146 implements MigrationInterface {
  name = 'InitSchema1782164513146';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "balance" ("id" varchar PRIMARY KEY NOT NULL, "employeeId" text NOT NULL, "locationId" text NOT NULL, "leaveType" text NOT NULL, "entitledDays" decimal(6,2) NOT NULL DEFAULT (0), "availableDays" decimal(6,2) NOT NULL DEFAULT (0), "pendingDays" decimal(6,2) NOT NULL DEFAULT (0), "version" integer NOT NULL, "sourceUpdatedAt" datetime, "lastSyncedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_balance_employee_location_leave_type" UNIQUE ("employeeId", "locationId", "leaveType"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_31cf735ec0cc684671baad043c" ON "balance" ("employeeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_75911408c7fcc2891cafef143e" ON "balance" ("locationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "time_off_request" ("id" varchar PRIMARY KEY NOT NULL, "employeeId" text NOT NULL, "locationId" text NOT NULL, "leaveType" text NOT NULL, "startDate" date NOT NULL, "endDate" date NOT NULL, "numberOfDays" decimal(5,2) NOT NULL, "status" text NOT NULL DEFAULT ('PENDING'), "idempotencyKey" text, "decidedBy" text, "decidedAt" datetime, "reason" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_9d0e8acd6083c0a12f99036bf17" UNIQUE ("idempotencyKey"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_17777d8fefb83badb119b21529" ON "time_off_request" ("employeeId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bcf0e9343397119cee07841069" ON "time_off_request" ("status") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bcf0e9343397119cee07841069"`);
    await queryRunner.query(`DROP INDEX "IDX_17777d8fefb83badb119b21529"`);
    await queryRunner.query(`DROP TABLE "time_off_request"`);
    await queryRunner.query(`DROP INDEX "IDX_75911408c7fcc2891cafef143e"`);
    await queryRunner.query(`DROP INDEX "IDX_31cf735ec0cc684671baad043c"`);
    await queryRunner.query(`DROP TABLE "balance"`);
  }
}
