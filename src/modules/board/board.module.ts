import { Module } from '@nestjs/common';

/**
 * Board module — directors, shareholders, share transactions, board meetings,
 * meeting agenda/attendees, resolutions, AGMs, dividends, related parties.
 *
 * Schema: `brd` (13 tables)
 * Core domain: Corporate governance — director register → shareholder register →
 *   share transfer → board meeting scheduling → agenda publishing →
 *   attendance tracking → resolution voting → AGM management →
 *   dividend declaration → related-party transaction disclosure.
 *
 * Controllers (Sprint 15+): directors, shareholders, share-transactions,
 *   board-meetings, meeting-agenda, meeting-attendees, resolutions, agms,
 *   dividends, related-parties
 * Services (Sprint 15+): directors, shareholders, share-transactions,
 *   board-meetings, resolutions, agms, dividends, related-parties
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class BoardModule {}
