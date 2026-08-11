// =============================================================================
// DocNumberService — Reusable, concurrency-safe document number generation
// =============================================================================
// OK Footwear ERP — Sprint 4
//
// Extracted from OrdersService.create() in Sprint 3.
// Supports multiple prefixes: ORD, QUO, CMP, PO, GRN, PAY.
// Each prefix has its own counter row in sys.document_sequences.
//
// Design Decision A (resolved): Option 2 — separate sequence rows per prefix
// in sys.document_sequences. The table already uses `prefix` as PK, so adding
// new prefixes is a simple INSERT (no schema change needed).
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class DocNumberService {
  private readonly logger = new Logger(DocNumberService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate the next concurrency-safe document number for a given prefix.
   *
   * Calls sys.next_doc_number(prefix) inside the provided transaction.
   * Uses SELECT ... FOR UPDATE row-level locking — the number is assigned
   * atomically. If the transaction rolls back, the number is NOT consumed.
   *
   * @param tx      Active Prisma transaction client (or PrismaService for non-transactional use)
   * @param prefix  Document prefix (ORD, QUO, CMP, PO, GRN, PAY)
   * @returns       Formatted document number (e.g., "ORD-2026-000001")
   */
  async generate(
    tx: Prisma.TransactionClient | PrismaService,
    prefix: string,
  ): Promise<string> {
    // Use the 1-arg overload: sys.next_doc_number(p_prefix text).
    // Explicit ::text cast avoids ambiguous overload resolution when a
    // 3-arg variant (prefix, pad_length, separator) also exists in the DB.
    // Never pass JS numbers as pad/separator — node-pg sends them as bigint,
    // which does not match PostgreSQL integer and yields 42883.
    const result = await tx.$queryRawUnsafe<{ next_doc_number: string }[]>(
      `SELECT sys.next_doc_number($1::text) AS next_doc_number`,
      prefix,
    );

    const number = result[0]?.next_doc_number;

    if (!number) {
      throw new Error(
        `Failed to generate document number for prefix '${prefix}'. ` +
          `Ensure the prefix exists in sys.document_sequences.`,
      );
    }

    this.logger.debug(`Generated doc number: ${number}`);
    return number;
  }
}
