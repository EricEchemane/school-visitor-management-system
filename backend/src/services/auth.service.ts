import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { Clock } from '../domain/clock';
import { Db } from '../db/pool';
import { AuditService } from './audit.service';
import { AuthUser } from '../common/auth';
import { tooMany, unauthorized } from '../common/errors';
import { CLOCK } from '../tokens';

export const SESSION_HOURS = 8;
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

@Injectable()
export class AuthService {
  private failures = new Map<string, number[]>();

  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string): Promise<{ sessionId: string; user: AuthUser }> {
    const key = email.toLowerCase();
    const nowMs = this.clock.now().getTime();
    const recent = (this.failures.get(key) ?? []).filter((t) => nowMs - t < WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      throw tooMany('Too many failed sign-in attempts. Try again in 15 minutes.');
    }

    const { rows } = await this.db.query(
      'SELECT id, name, password_hash, active FROM users WHERE lower(email) = $1',
      [key],
    );
    const row = rows[0];
    // Compare even for unknown users so response time does not reveal which emails exist.
    const ok = await bcrypt.compare(password, row?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!row || !ok || !row.active) {
      this.failures.set(key, [...recent, nowMs]);
      await this.audit.record(null, { id: null, label: key }, 'LOGIN_FAILED', 'user', row?.id ?? null);
      throw unauthorized('Invalid email or password');
    }
    this.failures.delete(key);

    const sessionId = randomBytes(32).toString('hex');
    const expires = new Date(nowMs + SESSION_HOURS * 3_600_000);
    await this.db.query('INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)', [
      sessionId,
      row.id,
      this.clock.now(),
      expires,
    ]);
    const user = (await this.authenticate(sessionId))!;
    await this.audit.record(null, { id: user.id, label: user.email }, 'LOGIN', 'user', user.id);
    return { sessionId, user };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    await this.db.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL', [
      sessionId,
      this.clock.now(),
    ]);
  }

  /** Permissions are read fresh on every request, so role changes apply immediately. */
  async authenticate(sessionId: string | undefined): Promise<AuthUser | null> {
    if (!sessionId) return null;
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.name, r.name AS role,
              COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.active
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2
       GROUP BY u.id, r.name`,
      [sessionId, this.clock.now()],
    );
    return rows[0] ?? null;
  }

  revokeUserSessions(userId: string) {
    return this.db.query('UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL', [
      userId,
      this.clock.now(),
    ]);
  }
}
