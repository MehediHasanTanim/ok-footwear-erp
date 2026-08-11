import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface ProcurementConfig {
  poThresholdLineMgr: number;
  poThresholdManager: number;
  poThresholdFinance: number;
  invoiceMatchTolerancePct: number;
  tdsRatePct: number;
  localUploadDir: string;
}

export const procurementConfig = registerAs(
  'procurement',
  (): ProcurementConfig => ({
    poThresholdLineMgr: Number(process.env['PRC_PO_THRESHOLD_LINE_MGR'] ?? 50_000),
    poThresholdManager: Number(process.env['PRC_PO_THRESHOLD_MANAGER'] ?? 500_000),
    poThresholdFinance: Number(process.env['PRC_PO_THRESHOLD_FINANCE'] ?? 5_000_000),
    invoiceMatchTolerancePct: Number(process.env['PRC_INVOICE_MATCH_TOLERANCE_PCT'] ?? 2),
    tdsRatePct: Number(process.env['PRC_TDS_RATE_PCT'] ?? 0),
    localUploadDir: process.env['PRC_LOCAL_UPLOAD_DIR'] ?? 'uploads',
  }),
);

export const procurementConfigSchema = Joi.object({
  PRC_PO_THRESHOLD_LINE_MGR: Joi.number().min(0).default(50_000),
  PRC_PO_THRESHOLD_MANAGER: Joi.number().min(0).default(500_000),
  PRC_PO_THRESHOLD_FINANCE: Joi.number().min(0).default(5_000_000),
  PRC_INVOICE_MATCH_TOLERANCE_PCT: Joi.number().min(0).max(100).default(2),
  PRC_TDS_RATE_PCT: Joi.number().min(0).max(100).default(0),
  PRC_LOCAL_UPLOAD_DIR: Joi.string().default('uploads'),
});
