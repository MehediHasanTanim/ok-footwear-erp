/**
 * Minimal CSV / OFX parsers for bank statement import.
 * CSV columns: date,type,amount,description,reference (header row required)
 * OFX: extracts STMTTRN blocks (TRNTYPE, DTPOSTED, TRNAMT, MEMO, FITID)
 */

export interface ParsedBankTxn {
  txnDate: string; // YYYY-MM-DD
  valueDate?: string;
  txnType: 'debit' | 'credit';
  amount: number;
  description?: string;
  referenceNo?: string;
}

export function parseBankCsv(content: string): ParsedBankTxn[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim());
  const dateIdx = header.findIndex((h) => h === 'date' || h === 'txn_date');
  const typeIdx = header.findIndex((h) => h === 'type' || h === 'txn_type');
  const amountIdx = header.findIndex((h) => h === 'amount');
  const descIdx = header.findIndex((h) => h === 'description' || h === 'memo');
  const refIdx = header.findIndex((h) => h === 'reference' || h === 'reference_no' || h === 'fitid');

  if (dateIdx < 0 || amountIdx < 0) {
    throw new Error('CSV must include date and amount columns');
  }

  const rows: ParsedBankTxn[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const amountRaw = Number(cols[amountIdx]);
    if (!Number.isFinite(amountRaw) || amountRaw === 0) continue;

    let txnType: 'debit' | 'credit';
    if (typeIdx >= 0 && cols[typeIdx]) {
      const t = cols[typeIdx]!.toLowerCase();
      txnType = t.startsWith('d') ? 'debit' : 'credit';
    } else {
      txnType = amountRaw < 0 ? 'debit' : 'credit';
    }

    rows.push({
      txnDate: normalizeDate(cols[dateIdx]!),
      txnType,
      amount: Math.abs(amountRaw),
      description: descIdx >= 0 ? cols[descIdx] : undefined,
      referenceNo: refIdx >= 0 ? cols[refIdx] : undefined,
    });
  }
  return rows;
}

export function parseBankOfx(content: string): ParsedBankTxn[] {
  const blocks = content.split(/<STMTTRN>/i).slice(1);
  const rows: ParsedBankTxn[] = [];
  for (const block of blocks) {
    const chunk = block.split(/<\/STMTTRN>/i)[0] ?? block;
    const trnType = ofxTag(chunk, 'TRNTYPE')?.toUpperCase();
    const dt = ofxTag(chunk, 'DTPOSTED');
    const amt = Number(ofxTag(chunk, 'TRNAMT'));
    if (!dt || !Number.isFinite(amt) || amt === 0) continue;

    const isDebit =
      amt < 0 || trnType === 'DEBIT' || trnType === 'PAYMENT' || trnType === 'CHECK';

    rows.push({
      txnDate: ofxDate(dt),
      txnType: isDebit ? 'debit' : 'credit',
      amount: Math.abs(amt),
      description: ofxTag(chunk, 'MEMO') ?? ofxTag(chunk, 'NAME'),
      referenceNo: ofxTag(chunk, 'FITID'),
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
  }
  // YYYYMMDD
  if (/^\d{8}/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  throw new Error(`Unrecognized date format: ${raw}`);
}

function ofxTag(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
  const m = block.match(re);
  return m?.[1]?.trim();
}

function ofxDate(raw: string): string {
  const d = raw.replace(/\[.*$/, '').trim();
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}
