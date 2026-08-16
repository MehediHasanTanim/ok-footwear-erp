/** System CoA codes seeded in sprint7_fin_schema migration. */
export const SYSTEM_COA = {
  TRADE_RECEIVABLES: '1200',
  NET_SALARY_PAYABLE: '2100',
  SALES_REVENUE: '4100',
  SALARY_EXPENSE: '5100',
} as const;

export interface PostJournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  currency?: string;
  fxRate?: number;
  departmentId?: string;
  costCenter?: string;
  narration?: string;
}

export interface PostJournalInput {
  periodId: string;
  entryDate: string; // YYYY-MM-DD
  narration: string;
  entryType?: 'manual' | 'system' | 'reversal';
  sourceModule?: string;
  sourceId?: string;
  reversalOf?: string;
  lines: PostJournalLineInput[];
  postedBy: string;
}

export type UpdateJournalInput = Partial<
  Omit<PostJournalInput, 'postedBy' | 'reversalOf'>
>;

export interface GlEntryLineRow {
  id: string;
  gl_entry_id: string;
  account_id: string;
  debit: number | string;
  credit: number | string;
  currency: string;
  fx_rate: number | string;
  base_debit: number | string;
  base_credit: number | string;
  department_id: string | null;
  cost_center: string | null;
  entry_date: Date;
  narration: string | null;
}
