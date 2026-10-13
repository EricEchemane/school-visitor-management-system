import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../domain/clock';
import { Db, Queryable } from '../db/pool';
import { CLOCK } from '../tokens';

export interface Actor {
  id: string | null;
  label: string;
}
export const SYSTEM_ACTOR: Actor = { id: null, label: 'system' };

@Injectable()
export class AuditService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Pass a transaction client as `q` to make the audit event part of the same commit. */
  async record(
    q: Queryable | null,
    actor: Actor,
    action: string,
    targetType: string | null,
    targetId: string | null,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await (q ?? this.db.pool).query(
      `INSERT INTO audit_events(at, actor_id, actor_label, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [this.clock.now(), actor.id, actor.label, action, targetType, targetId, JSON.stringify(details)],
    );
  }

  async list(filter: { action?: string; targetId?: string; limit?: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.action) {
      params.push(filter.action);
      where.push(`action = $${params.length}`);
    }
    if (filter.targetId) {
      params.push(filter.targetId);
      where.push(`target_id = $${params.length}`);
    }
    params.push(Math.min(filter.limit ?? 100, 500));
    const { rows } = await this.db.query(
      `SELECT id::text, at, actor_id, actor_label, action, target_type, target_id, details
       FROM audit_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    return rows;
  }
}
