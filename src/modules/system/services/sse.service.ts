// =============================================================================
// SSEService — Server-Sent Events Push Layer
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Maintains a Map<userId, Subject<MessageEvent>> for per-user SSE channels.
// When a notification is created, the service emits to the user's Subject,
// which pushes the event to all active SSE connections for that user.
//
// Cleanup: when a client disconnects, the SSE endpoint's teardown logic
// calls removeConnection(), which completes the Subject if no connections
// remain. This prevents memory leaks from abandoned Subjects.
// =============================================================================

import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';

@Injectable()
export class SSEService {
  private readonly logger = new Logger(SSEService.name);

  /** Per-user Subjects. Keyed by userId. */
  private readonly subjects = new Map<string, Subject<MessageEvent>>();

  /** Per-Subject connection count to know when to clean up. */
  private readonly connectionCounts = new Map<string, number>();

  /**
   * Get or create a Subject for a user.
   * Called when a new SSE connection is established.
   */
  getOrCreateSubject(userId: string): Subject<MessageEvent> {
    let subject = this.subjects.get(userId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.subjects.set(userId, subject);
      this.connectionCounts.set(userId, 0);
    }
    this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);
    this.logger.debug(`SSE connection opened for user ${userId} (total: ${this.connectionCounts.get(userId)})`);
    return subject;
  }

  /**
   * Decrement connection count. If zero, complete and remove the Subject.
   * Called on SSE connection teardown (client disconnect or stream close).
   */
  removeConnection(userId: string): void {
    const count = (this.connectionCounts.get(userId) ?? 0) - 1;
    if (count <= 0) {
      const subject = this.subjects.get(userId);
      if (subject) {
        subject.complete();
        this.subjects.delete(userId);
        this.connectionCounts.delete(userId);
        this.logger.debug(`SSE Subject completed for user ${userId} (no connections)`);
      }
    } else {
      this.connectionCounts.set(userId, count);
      this.logger.debug(`SSE connection removed for user ${userId} (remaining: ${count})`);
    }
  }

  /**
   * Emit a notification event to a specific user's SSE stream.
   * No-op if the user has no active SSE connections.
   */
  emit(userId: string, data: Record<string, unknown>): void {
    const subject = this.subjects.get(userId);
    if (!subject || subject.closed) return;

    subject.next({ data } as MessageEvent);
  }

  /** Active SSE connection count across all users. */
  get totalConnections(): number {
    let total = 0;
    for (const count of this.connectionCounts.values()) {
      total += count;
    }
    return total;
  }
}
