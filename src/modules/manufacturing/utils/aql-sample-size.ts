/**
 * ISO 2859-1 Level II normal inspection — simplified sample size lookup.
 * Returns the sample size to inspect for a given lot (batch) size.
 */
const LEVEL_II_TABLE: ReadonlyArray<{ maxLot: number; sampleSize: number }> = [
  { maxLot: 8, sampleSize: 2 },
  { maxLot: 15, sampleSize: 3 },
  { maxLot: 25, sampleSize: 5 },
  { maxLot: 50, sampleSize: 8 },
  { maxLot: 90, sampleSize: 13 },
  { maxLot: 150, sampleSize: 20 },
  { maxLot: 280, sampleSize: 32 },
  { maxLot: 500, sampleSize: 50 },
  { maxLot: 1200, sampleSize: 80 },
  { maxLot: 3200, sampleSize: 125 },
  { maxLot: 10000, sampleSize: 200 },
  { maxLot: 35000, sampleSize: 315 },
  { maxLot: 150000, sampleSize: 500 },
  { maxLot: 500000, sampleSize: 800 },
  { maxLot: Number.MAX_SAFE_INTEGER, sampleSize: 1250 },
];

export function calcAqlSampleSize(lotSize: number): number {
  if (!Number.isFinite(lotSize) || lotSize < 1) {
    return 0;
  }
  const lot = Math.floor(lotSize);
  for (const row of LEVEL_II_TABLE) {
    if (lot <= row.maxLot) {
      return Math.min(row.sampleSize, lot);
    }
  }
  return Math.min(1250, lot);
}
