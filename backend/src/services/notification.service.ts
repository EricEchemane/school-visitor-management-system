import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../domain/clock';
import { Db } from '../db/pool';
import { AuditService, SYSTEM_ACTOR } from './audit.service';
import { CLOCK, NOTIFICATION_CHANNELS } from '../tokens';

export interface Recipient {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
}

/** Swap a simulator for a real provider by implementing this interface. */
export interface NotificationChannel {
  readonly name: 'EMAIL' | 'SMS';
  send(to: Recipient, message: string): Promise<void>;
}

export class SimulatedChannel implements NotificationChannel {
  constructor(
    readonly name: 'EMAIL' | 'SMS',
    private readonly failing = false,
  ) {}
  async send(): Promise<void> {
    if (this.failing) throw new Error(`Simulated ${this.name.toLowerCase()} provider unavailable`);
  }
}

export type NotificationKind = 'WALK_IN_REQUEST' | 'REMINDER';

@Injectable()
export class NotificationService {
  private readonly channels: Map<string, NotificationChannel>;

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NOTIFICATION_CHANNELS) channels: NotificationChannel[],
  ) {
    this.channels = new Map(channels.map((c) => [c.name, c]));
  }

  /**
   * Always writes the in-app notification. Extra channels are attempted once; a failure
   * is recorded and never affects the in-app notification or the visit.
   */
  async notify(
    visitId: string,
    to: Recipient,
    kind: NotificationKind,
    message: string,
    extra: Array<'EMAIL' | 'SMS'>,
  ): Promise<void> {
    await this.record(visitId, to, 'IN_APP', kind, message, 'SENT', null);
    for (const name of extra) {
      const channel = this.channels.get(name);
      if (!channel) continue;
      try {
        await channel.send(to, message);
        await this.record(visitId, to, name, kind, message, 'SENT', null);
      } catch (err) {
        await this.record(visitId, to, name, kind, message, 'FAILED', (err as Error).message);
      }
    }
  }

  private async record(
    visitId: string,
    to: Recipient,
    channel: string,
    kind: NotificationKind,
    message: string,
    status: 'SENT' | 'FAILED',
    error: string | null,
  ) {
    await this.db.query(
      `INSERT INTO notifications(visit_id, recipient_id, channel, kind, message, status, error, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [visitId, to.id, channel, kind, message, status, error, this.clock.now()],
    );
    await this.audit.record(
      null,
      SYSTEM_ACTOR,
      status === 'SENT' ? 'NOTIFICATION_SENT' : 'NOTIFICATION_FAILED',
      'visit',
      visitId,
      { channel, kind, recipient: to.id, error },
    );
  }

  inbox(userId: string) {
    return this.db
      .query(
        `SELECT n.id, n.visit_id AS "visitId", n.kind, n.message, n.created_at AS "createdAt",
                n.read_at AS "readAt", v.state AS "visitState"
         FROM notifications n LEFT JOIN visits v ON v.id = n.visit_id
         WHERE n.recipient_id = $1 AND n.channel = 'IN_APP'
         ORDER BY n.created_at DESC LIMIT 50`,
        [userId],
      )
      .then((r) => r.rows);
  }

  async markRead(userId: string, id: string) {
    await this.db.query(
      'UPDATE notifications SET read_at = $3 WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL',
      [id, userId, this.clock.now()],
    );
  }

  sentMessages(limit = 100) {
    return this.db
      .query(
        `SELECT n.id, n.channel, n.kind, n.message, n.status, n.error, n.created_at AS "createdAt",
                u.name AS "recipientName"
         FROM notifications n JOIN users u ON u.id = n.recipient_id
         WHERE n.channel IN ('EMAIL','SMS') ORDER BY n.created_at DESC LIMIT $1`,
        [Math.min(limit, 500)],
      )
      .then((r) => r.rows);
  }
}
