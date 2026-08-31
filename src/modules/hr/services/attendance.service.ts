import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  AttendanceQueryDto,
  BiometricSyncDto,
  LopQueryDto,
  ManualCorrectionDto,
} from '../dto/attendance.dto';

export interface AttendanceRow {
  id: string;
  employee_id: string;
  check_date: Date;
  clock_in: Date | null;
  clock_out: Date | null;
  source: string;
  status: string;
  late_minutes: number;
  overtime_hrs: number | string;
  lop_days: number | string;
  created_at: Date;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async biometricSync(dto: BiometricSyncDto) {
    const log = await this.prisma.biometricSyncLog.create({
      data: {
        deviceId: dto.deviceId,
        status: 'running',
      },
    });

    let upserted = 0;
    try {
      for (const rec of dto.records) {
        await this.upsertAttendance({
          employeeId: rec.employeeId,
          checkDate: rec.checkDate,
          clockIn: rec.clockIn,
          clockOut: rec.clockOut,
          status: rec.status ?? 'present',
          source: 'biometric',
        });
        upserted++;
      }

      await this.prisma.biometricSyncLog.update({
        where: { id: log.id },
        data: {
          status: 'completed',
          syncCompletedAt: new Date(),
          recordsUpserted: upserted,
        },
      });
    } catch (err) {
      await this.prisma.biometricSyncLog.update({
        where: { id: log.id },
        data: {
          status: 'failed',
          syncCompletedAt: new Date(),
          recordsUpserted: upserted,
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }

    return { syncLogId: log.id, recordsUpserted: upserted };
  }

  async manualCorrection(dto: ManualCorrectionDto, userId: string) {
    const existing = await this.findOneRaw(dto.employeeId, dto.checkDate);

    const row = await this.upsertAttendance({
      employeeId: dto.employeeId,
      checkDate: dto.checkDate,
      clockIn: dto.clockIn,
      clockOut: dto.clockOut,
      status: 'present',
      source: 'manual',
      correctedBy: userId,
      correctionReason: dto.reason,
    });

    await this.prisma.manualCorrection.create({
      data: {
        employeeId: dto.employeeId,
        checkDate: new Date(dto.checkDate),
        attendanceId: row.id,
        oldClockIn: existing?.clock_in ?? null,
        oldClockOut: existing?.clock_out ?? null,
        newClockIn: dto.clockIn ? new Date(dto.clockIn) : null,
        newClockOut: dto.clockOut ? new Date(dto.clockOut) : null,
        reason: dto.reason,
        correctedBy: userId,
      },
    });

    return this.toDto(row);
  }

  async findByEmployee(query: AttendanceQueryDto) {
    const rows = await this.prisma.$queryRaw<AttendanceRow[]>`
      SELECT id, employee_id, check_date, clock_in, clock_out, source, status,
             late_minutes, overtime_hrs, lop_days, created_at
      FROM hr.attendance_records
      WHERE employee_id = ${query.employeeId}::uuid
        AND check_date >= ${query.fromDate}::date
        AND check_date <= ${query.toDate}::date
      ORDER BY check_date ASC
    `;
    return rows.map((r) => this.toDto(r));
  }

  async calculateLop(employeeId: string, month: number, year: number) {
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    let workingDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (dow !== 0 && dow !== 6) workingDays++;
    }

    const rows = await this.prisma.$queryRaw<{ lop_sum: number | string; absent_count: bigint }[]>`
      SELECT
        COALESCE(SUM(lop_days), 0)::numeric AS lop_sum,
        COUNT(*) FILTER (WHERE status = 'absent')::bigint AS absent_count
      FROM hr.attendance_records
      WHERE employee_id = ${employeeId}::uuid
        AND check_date >= ${fromDate}::date
        AND check_date <= ${toDate}::date
    `;

    const lopFromRecords = Number(rows[0]?.lop_sum ?? 0);
    const absentCount = Number(rows[0]?.absent_count ?? 0);
    const lopDays = lopFromRecords + absentCount;

    return { employeeId, month, year, workingDays, lopDays };
  }

  private async upsertAttendance(input: {
    employeeId: string;
    checkDate: string;
    clockIn?: string;
    clockOut?: string;
    status: string;
    source: string;
    correctedBy?: string;
    correctionReason?: string;
  }): Promise<AttendanceRow> {
    const rows = await this.prisma.$queryRaw<AttendanceRow[]>`
      INSERT INTO hr.attendance_records (
        employee_id, check_date, clock_in, clock_out, source, status,
        corrected_by, correction_reason
      ) VALUES (
        ${input.employeeId}::uuid,
        ${input.checkDate}::date,
        ${input.clockIn ? new Date(input.clockIn) : null},
        ${input.clockOut ? new Date(input.clockOut) : null},
        ${input.source},
        ${input.status},
        ${input.correctedBy ?? null}::uuid,
        ${input.correctionReason ?? null}
      )
      ON CONFLICT (employee_id, check_date)
      DO UPDATE SET
        clock_in = EXCLUDED.clock_in,
        clock_out = EXCLUDED.clock_out,
        source = EXCLUDED.source,
        status = EXCLUDED.status,
        corrected_by = EXCLUDED.corrected_by,
        correction_reason = EXCLUDED.correction_reason
      RETURNING id, employee_id, check_date, clock_in, clock_out, source, status,
                late_minutes, overtime_hrs, lop_days, created_at
    `;
    return rows[0]!;
  }

  private async findOneRaw(employeeId: string, checkDate: string): Promise<AttendanceRow | null> {
    const rows = await this.prisma.$queryRaw<AttendanceRow[]>`
      SELECT id, employee_id, check_date, clock_in, clock_out, source, status,
             late_minutes, overtime_hrs, lop_days, created_at
      FROM hr.attendance_records
      WHERE employee_id = ${employeeId}::uuid AND check_date = ${checkDate}::date
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private toDto(row: AttendanceRow) {
    return {
      id: row.id,
      employeeId: row.employee_id,
      checkDate: row.check_date,
      clockIn: row.clock_in,
      clockOut: row.clock_out,
      source: row.source,
      status: row.status,
      lateMinutes: row.late_minutes,
      overtimeHrs: Number(row.overtime_hrs),
      lopDays: Number(row.lop_days),
      createdAt: row.created_at,
    };
  }
}
