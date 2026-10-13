import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Clock } from '../domain/clock';
import { Db, Queryable } from '../db/pool';
import { AuditService, Actor, SYSTEM_ACTOR } from './audit.service';
import { NotificationService, Recipient } from './notification.service';
import { SettingsService } from './settings.service';
import { AuthUser } from '../common/auth';
import { conflict, forbidden, notFound, badRequest } from '../common/errors';
import { InvalidTransitionError, VisitEvent, nextState, statesAllowing } from '../domain/visit-state';
import {
  addMinutes,
  isOverstayed,
  isReminderDue,
  schoolDay,
  schoolInstant,
  validatePreRegistrationDate,
  isValidPhMobile,
  validateArrivalWindow,
} from '../domain/rules';
import { CLOCK } from '../tokens';

export interface PreRegistrationInput {
  visitorName: string;
  visitorContact?: string | null;
  purpose: string;
  date: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  durationMinutes?: number;
  hostId?: string;
}

const VISIT_SELECT = `
  SELECT v.*, h.name AS host_name,
         p.number AS pass_number, p.token AS pass_token, p.invalidated_at AS pass_invalidated_at
  FROM visits v
  JOIN users h ON h.id = v.host_id
  LEFT JOIN passes p ON p.visit_id = v.id`;

const actorOf = (u: AuthUser): Actor => ({ id: u.id, label: u.email });

@Injectable()
export class VisitsService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  // ---------- mapping ----------

  private toDto(row: any, includePass = true) {
    const now = this.clock.now();
    const passValid = row.pass_number && !row.pass_invalidated_at && row.state === 'CHECKED_IN';
    return {
      id: row.id,
      kind: row.kind,
      state: row.state,
      visitorName: row.anonymised_at ? null : row.visitor_name,
      visitorContact: row.anonymised_at ? null : row.visitor_contact,
      anonymised: !!row.anonymised_at,
      purpose: row.purpose,
      hostId: row.host_id,
      hostName: row.host_name,
      expectedDate: row.expected_date,
      windowStart: row.window_start,
      windowEnd: row.window_end,
      durationMinutes: row.duration_minutes,
      expectedEndAt: row.expected_end_at,
      registeredAt: row.registered_at,
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at,
      departureVerified: row.departure_verified,
      declineReason: row.decline_reason,
      overstayed: isOverstayed({ state: row.state, expectedEndAt: row.expected_end_at }, now),
      pass:
        includePass && passValid
          ? { number: row.pass_number, token: row.pass_token }
          : null,
    };
  }

  // ---------- helpers ----------

  /**
   * The single way a visit changes state: the state machine decides what is legal and the
   * UPDATE only matches rows still in a legal state, so concurrent requests cannot both win.
   */
  private async transition(
    q: Queryable,
    id: string,
    event: VisitEvent,
    fields: Record<string, unknown> = {},
  ): Promise<any> {
    const from = statesAllowing(event);
    const to = nextState(from[0], event);
    const cols = Object.keys(fields);
    const sets = cols.map((c, i) => `${c} = $${i + 4}`).join(', ');
    const { rows } = await q.query(
      `UPDATE visits SET state = $3${sets ? ', ' + sets : ''}
       WHERE id = $1 AND state = ANY($2) RETURNING *`,
      [id, from, to, ...cols.map((c) => fields[c])],
    );
    if (rows[0]) return rows[0];

    const current = await q.query('SELECT state FROM visits WHERE id = $1', [id]);
    if (!current.rows[0]) throw notFound('Visit');
    const err = new InvalidTransitionError(current.rows[0].state, event);
    throw conflict('VISIT_ALREADY_CHANGED', `This visit is ${err.from} and can no longer be changed that way.`, {
      state: err.from,
    });
  }

  private async eligibleHost(hostId: string): Promise<Recipient> {
    const { rows } = await this.db.query(
      `SELECT u.id, u.name, u.email, u.mobile FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id AND p.code = 'visit:host'
       WHERE u.id = $1 AND u.active`,
      [hostId],
    );
    if (!rows[0]) throw badRequest('That employee cannot host visitors', 'INVALID_HOST');
    return rows[0];
  }

  private async loadVisit(id: string, q: Queryable = this.db.pool): Promise<any> {
    const { rows } = await q.query(`${VISIT_SELECT} WHERE v.id = $1`, [id]);
    if (!rows[0]) throw notFound('Visit');
    return rows[0];
  }

  private async issuePass(q: Queryable, visitId: string): Promise<void> {
    const seq = await q.query("SELECT nextval('pass_number_seq') AS n");
    const number = `V-${String(seq.rows[0].n).padStart(4, '0')}`;
    await q.query('INSERT INTO passes(visit_id, number, token, issued_at) VALUES ($1,$2,$3,$4)', [
      visitId,
      number,
      randomBytes(24).toString('base64url'),
      this.clock.now(),
    ]);
  }

  private validateContact(contact?: string | null) {
    if (contact && !isValidPhMobile(contact)) {
      throw badRequest('Contact number must be a Philippine mobile number, e.g. 0917 000 0000');
    }
  }

  // ---------- pre-registration ----------

  async preRegister(user: AuthUser, input: PreRegistrationInput) {
    const dateError = validatePreRegistrationDate(input.date, this.clock.now());
    if (dateError) throw badRequest(dateError, 'INVALID_DATE');
    this.validateContact(input.visitorContact);
    const windowError = validateArrivalWindow(input.windowStart, input.windowEnd);
    if (windowError) throw badRequest(windowError, 'INVALID_WINDOW');
    const s = await this.settings.get();
    const hostId = input.hostId ?? user.id;
    await this.eligibleHost(hostId);

    const id = await this.db.tx(async (q) => {
      const { rows } = await q.query(
        `INSERT INTO visits(visitor_name, visitor_contact, purpose, host_id, created_by, kind, state,
           expected_date, window_start, window_end, duration_minutes, registered_at)
         VALUES ($1,$2,$3,$4,$5,'PRE_REGISTERED','PRE_REGISTERED',$6,$7,$8,$9,$10) RETURNING id`,
        [
          input.visitorName.trim(),
          input.visitorContact || null,
          input.purpose.trim(),
          hostId,
          user.id,
          input.date,
          input.windowStart ?? null,
          input.windowEnd ?? null,
          input.durationMinutes ?? s.defaultDurationMinutes,
          this.clock.now(),
        ],
      );
      await this.audit.record(q, actorOf(user), 'VISIT_PREREGISTERED', 'visit', rows[0].id, {
        hostId,
        date: input.date,
      });
      return rows[0].id as string;
    });
    return this.toDto(await this.loadVisit(id));
  }

  async updatePreRegistration(user: AuthUser, id: string, patch: Partial<PreRegistrationInput>) {
    const visit = await this.loadVisit(id);
    if (visit.host_id !== user.id && visit.created_by !== user.id) throw notFound('Visit');
    if (patch.date !== undefined) {
      const err = validatePreRegistrationDate(patch.date, this.clock.now());
      if (err) throw badRequest(err, 'INVALID_DATE');
    }
    if (patch.visitorContact !== undefined) this.validateContact(patch.visitorContact);
    const windowError = validateArrivalWindow(
      patch.windowStart === undefined ? visit.window_start : patch.windowStart,
      patch.windowEnd === undefined ? visit.window_end : patch.windowEnd,
    );
    if (windowError) throw badRequest(windowError, 'INVALID_WINDOW');
    if (patch.hostId && patch.hostId !== visit.host_id) await this.eligibleHost(patch.hostId);

    const map: Record<string, unknown> = {
      visitor_name: patch.visitorName?.trim(),
      visitor_contact: patch.visitorContact === undefined ? undefined : patch.visitorContact || null,
      purpose: patch.purpose?.trim(),
      expected_date: patch.date,
      window_start: patch.windowStart,
      window_end: patch.windowEnd,
      duration_minutes: patch.durationMinutes,
      host_id: patch.hostId,
    };
    const cols = Object.keys(map).filter((c) => map[c] !== undefined);
    if (!cols.length) return this.toDto(visit);

    const { rowCount } = await this.db.query(
      `UPDATE visits SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')}
       WHERE id = $1 AND state = ANY($2)`,
      [id, ['PRE_REGISTERED'], ...cols.map((c) => map[c])],
    );
    if (!rowCount) {
      throw conflict('VISIT_ALREADY_CHANGED', `This visit is ${visit.state} and can no longer be edited.`, {
        state: visit.state,
      });
    }
    await this.audit.record(null, actorOf(user), 'VISIT_UPDATED', 'visit', id, { fields: cols });
    if (patch.hostId && patch.hostId !== visit.host_id) {
      const host = await this.eligibleHost(patch.hostId);
      await this.notifications.notify(
        id,
        host,
        'REMINDER',
        `${visit.visitor_name} was pre-registered with you as host for ${visit.expected_date}.`,
        [],
      );
    }
    return this.toDto(await this.loadVisit(id));
  }

  async cancel(user: AuthUser, id: string) {
    const visit = await this.loadVisit(id);
    if (visit.host_id !== user.id && visit.created_by !== user.id) throw notFound('Visit');
    await this.db.tx(async (q) => {
      await this.transition(q, id, 'CANCEL', { decided_at: this.clock.now() });
      await this.audit.record(q, actorOf(user), 'VISIT_CANCELLED', 'visit', id);
    });
    return this.toDto(await this.loadVisit(id));
  }

  // ---------- gate: check-in, walk-in ----------

  /** Today's expected visitors only: the guard never sees future visitors. */
  async expectedToday(query?: string) {
    const params: unknown[] = [schoolDay(this.clock.now())];
    let filter = '';
    if (query?.trim()) {
      params.push(`%${query.trim().toLowerCase()}%`);
      filter = ` AND (lower(v.visitor_name) LIKE $2 OR lower(h.name) LIKE $2)`;
    }
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE v.state = 'PRE_REGISTERED' AND v.expected_date = $1${filter}
       ORDER BY v.window_start NULLS LAST, v.visitor_name LIMIT 100`,
      params,
    );
    return rows.map((r) => this.toDto(r, false));
  }

  async checkIn(user: AuthUser, id: string) {
    const visit = await this.loadVisit(id);
    if (visit.state === 'PRE_REGISTERED' && visit.expected_date !== schoolDay(this.clock.now())) {
      throw conflict('NOT_TODAY', 'This visit is not expected today. Register the visitor as a walk-in.');
    }
    const now = this.clock.now();
    await this.db.tx(async (q) => {
      await this.transition(q, id, 'CHECK_IN', {
        checked_in_at: now,
        expected_end_at: addMinutes(now, visit.duration_minutes),
      });
      await this.issuePass(q, id);
      await this.audit.record(q, actorOf(user), 'VISIT_CHECKED_IN', 'visit', id);
    });
    return this.toDto(await this.loadVisit(id));
  }

  async registerWalkIn(
    user: AuthUser,
    input: { visitorName: string; visitorContact?: string | null; purpose: string; hostId: string; confirmDuplicate?: boolean },
  ) {
    this.validateContact(input.visitorContact);
    const host = await this.eligibleHost(input.hostId);
    const s = await this.settings.get();
    const now = this.clock.now();

    if (!input.confirmDuplicate) {
      const dup = await this.db.query(
        `SELECT id FROM visits
         WHERE lower(visitor_name) = lower($1) AND host_id = $2 AND expected_date = $3
           AND state IN ('AWAITING_HOST','CHECKED_IN') LIMIT 1`,
        [input.visitorName.trim(), host.id, schoolDay(now)],
      );
      if (dup.rows[0]) {
        throw conflict(
          'DUPLICATE_WARNING',
          'A visit for this visitor and host is already open today. Register again only if this is a different person.',
          { existingVisitId: dup.rows[0].id },
        );
      }
    }

    const id = await this.db.tx(async (q) => {
      const { rows } = await q.query(
        `INSERT INTO visits(visitor_name, visitor_contact, purpose, host_id, created_by, kind, state,
           expected_date, duration_minutes, registered_at)
         VALUES ($1,$2,$3,$4,$5,'WALK_IN','AWAITING_HOST',$6,$7,$8) RETURNING id`,
        [
          input.visitorName.trim(),
          input.visitorContact || null,
          input.purpose.trim(),
          host.id,
          user.id,
          schoolDay(now),
          s.defaultDurationMinutes,
          now,
        ],
      );
      await this.audit.record(q, actorOf(user), 'VISIT_WALKIN_REGISTERED', 'visit', rows[0].id, {
        hostId: host.id,
      });
      return rows[0].id as string;
    });

    await this.notifications.notify(
      id,
      host,
      'WALK_IN_REQUEST',
      `${input.visitorName.trim()} is at the gate to see you about ${input.purpose.trim()}. Confirm or decline within ${s.hostTimeoutMinutes} minutes.`,
      ['EMAIL'],
    );
    return this.toDto(await this.loadVisit(id));
  }

  // ---------- host response ----------

  async hostRespond(user: AuthUser, id: string, decision: 'confirm' | 'decline', reason?: string) {
    await this.expireOverdue(); // a late answer must lose to the timeout
    const visit = await this.loadVisit(id);
    if (visit.host_id !== user.id) throw forbidden('Only the named host can answer this request');

    const now = this.clock.now();
    await this.db.tx(async (q) => {
      if (decision === 'confirm') {
        await this.transition(q, id, 'HOST_CONFIRM', {
          decided_at: now,
          checked_in_at: now,
          expected_end_at: addMinutes(now, visit.duration_minutes),
        });
        await this.issuePass(q, id);
        await this.audit.record(q, actorOf(user), 'VISIT_HOST_CONFIRMED', 'visit', id);
      } else {
        await this.transition(q, id, 'HOST_DECLINE', {
          decided_at: now,
          decline_reason: reason?.trim() || null,
        });
        await this.audit.record(q, actorOf(user), 'VISIT_HOST_DECLINED', 'visit', id, {
          reason: reason?.trim() || null,
        });
      }
    });
    return this.toDto(await this.loadVisit(id));
  }

  // ---------- check-out ----------

  async checkOut(user: AuthUser, code: string) {
    const trimmed = code.trim();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE upper(p.number) = upper($1) OR p.token = $1`,
      [trimmed],
    );
    const visit = rows[0];
    if (!visit) {
      await this.audit.record(null, actorOf(user), 'PASS_REJECTED', 'pass', null, { reason: 'unknown' });
      throw notFound('Pass');
    }
    if (visit.state !== 'CHECKED_IN' || visit.pass_invalidated_at) {
      await this.audit.record(null, actorOf(user), 'PASS_REJECTED', 'visit', visit.id, {
        reason: 'not valid',
        state: visit.state,
      });
      throw conflict('PASS_NOT_VALID', `Pass ${visit.pass_number} is no longer valid (visit is ${visit.state}).`, {
        state: visit.state,
      });
    }
    const now = this.clock.now();
    await this.db.tx(async (q) => {
      await this.transition(q, visit.id, 'CHECK_OUT', {
        checked_out_at: now,
        departure_verified: true,
        checked_out_by: user.id,
      });
      await q.query('UPDATE passes SET invalidated_at = $2 WHERE visit_id = $1', [visit.id, now]);
      await this.audit.record(q, actorOf(user), 'VISIT_CHECKED_OUT', 'visit', visit.id);
    });
    return this.toDto(await this.loadVisit(visit.id), false);
  }

  async correctDeparture(user: AuthUser, id: string, time: Date) {
    const visit = await this.loadVisit(id);
    if (visit.state !== 'CHECKED_OUT' || visit.departure_verified !== false) {
      throw conflict('NOT_CORRECTABLE', 'Only a system-assumed departure can be corrected.');
    }
    const now = this.clock.now();
    if (time < visit.checked_in_at) throw badRequest('Departure cannot be before check-in');
    if (time > now) throw badRequest('Departure cannot be in the future');
    await this.db.tx(async (q) => {
      await q.query(
        `UPDATE visits SET checked_out_at = $2, departure_verified = TRUE,
           departure_corrected_by = $3, departure_corrected_at = $4 WHERE id = $1`,
        [id, time, user.id, now],
      );
      await this.audit.record(q, actorOf(user), 'DEPARTURE_CORRECTED', 'visit', id, {
        previous: visit.checked_out_at,
        corrected: time,
      });
    });
    return this.toDto(await this.loadVisit(id), false);
  }

  // ---------- views ----------

  async mine(user: AuthUser) {
    await this.expireOverdue();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE (v.host_id = $1 OR v.created_by = $1)
         AND (v.expected_date >= $2 OR v.state IN ('AWAITING_HOST','CHECKED_IN'))
       ORDER BY v.expected_date, v.registered_at DESC LIMIT 200`,
      [user.id, schoolDay(addMinutes(this.clock.now(), -7 * 24 * 60))],
    );
    return rows.map((r) => this.toDto(r, false));
  }

  async awaitingHost() {
    await this.expireOverdue();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE v.state = 'AWAITING_HOST' ORDER BY v.registered_at`,
    );
    return rows.map((r) => this.toDto(r, false));
  }

  /** Recently resolved walk-ins so the guard can see "declined" / "no response". */
  async recentWalkInOutcomes() {
    await this.expireOverdue();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE v.kind = 'WALK_IN' AND v.state IN ('DECLINED','EXPIRED')
         AND v.expected_date = $1 ORDER BY v.registered_at DESC LIMIT 20`,
      [schoolDay(this.clock.now())],
    );
    return rows.map((r) => this.toDto(r, false));
  }

  async onCampus() {
    await this.expireOverdue();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE v.state = 'CHECKED_IN' ORDER BY v.checked_in_at`,
    );
    const visits = rows.map((r) => this.toDto(r));
    return { count: visits.length, overstayedCount: visits.filter((v) => v.overstayed).length, visits };
  }

  async history(limit = 200) {
    const { rows } = await this.db.query(`${VISIT_SELECT} ORDER BY v.registered_at DESC LIMIT $1`, [
      Math.min(limit, 500),
    ]);
    return rows.map((r) => this.toDto(r, false));
  }

  async pass(id: string) {
    const visit = await this.loadVisit(id);
    const dto = this.toDto(visit);
    if (!dto.pass) throw conflict('NO_VALID_PASS', 'This visit has no valid pass.');
    return { ...dto.pass, visitorName: dto.visitorName, hostName: dto.hostName, date: dto.expectedDate, purpose: dto.purpose };
  }

  async hosts() {
    const { rows } = await this.db.query(
      `SELECT DISTINCT u.id, u.name FROM users u
       JOIN role_permissions rp ON rp.role_id = u.role_id
       JOIN permissions p ON p.id = rp.permission_id AND p.code = 'visit:host'
       WHERE u.active ORDER BY u.name`,
    );
    return rows;
  }

  // ---------- jobs (called by the scheduler; each is idempotent) ----------

  async expireOverdue(): Promise<number> {
    const s = await this.settings.get();
    const cutoff = addMinutes(this.clock.now(), -s.hostTimeoutMinutes);
    const { rows } = await this.db.query(
      "SELECT id FROM visits WHERE state = 'AWAITING_HOST' AND registered_at <= $1",
      [cutoff],
    );
    let expired = 0;
    for (const { id } of rows) {
      try {
        await this.db.tx(async (q) => {
          await this.transition(q, id, 'EXPIRE', { decided_at: this.clock.now() });
          await this.audit.record(q, SYSTEM_ACTOR, 'VISIT_EXPIRED', 'visit', id);
        });
        expired++;
      } catch (err: any) {
        if (err?.getStatus?.() !== 409) throw err; // someone else answered first
      }
    }
    return expired;
  }

  async sendReminders(): Promise<number> {
    const s = await this.settings.get();
    const now = this.clock.now();
    const { rows } = await this.db.query(
      `${VISIT_SELECT} WHERE v.state = 'AWAITING_HOST' AND v.reminder_sent_at IS NULL`,
    );
    let sent = 0;
    for (const v of rows) {
      if (!isReminderDue(v.registered_at, now, s.hostTimeoutMinutes)) continue;
      const claimed = await this.db.query(
        `UPDATE visits SET reminder_sent_at = $2
         WHERE id = $1 AND state = 'AWAITING_HOST' AND reminder_sent_at IS NULL`,
        [v.id, now],
      );
      if (!claimed.rowCount) continue;
      const host = await this.db.query('SELECT id, name, email, mobile FROM users WHERE id = $1', [v.host_id]);
      await this.notifications.notify(
        v.id,
        host.rows[0],
        'REMINDER',
        `Reminder: ${v.visitor_name} is still waiting at the gate.`,
        ['SMS'],
      );
      sent++;
    }
    return sent;
  }

  /** At closing time, everyone still checked in is closed out with an unverified departure. */
  async closingSweep(): Promise<{ checkedOut: number; noShows: number }> {
    const s = await this.settings.get();
    const now = this.clock.now();
    const open = await this.db.query("SELECT id, checked_in_at FROM visits WHERE state = 'CHECKED_IN'");
    let checkedOut = 0;
    for (const v of open.rows) {
      const closing = schoolInstant(schoolDay(v.checked_in_at), s.closingTime);
      if (now < closing) continue;
      try {
        await this.db.tx(async (q) => {
          await this.transition(q, v.id, 'CHECK_OUT', {
            checked_out_at: closing < v.checked_in_at ? v.checked_in_at : closing,
            departure_verified: false,
            checked_out_by: null,
          });
          await q.query('UPDATE passes SET invalidated_at = $2 WHERE visit_id = $1', [v.id, now]);
          await this.audit.record(q, SYSTEM_ACTOR, 'VISIT_AUTO_CHECKED_OUT', 'visit', v.id, {
            departure: 'closing time (unverified)',
          });
        });
        checkedOut++;
      } catch (err: any) {
        if (err?.getStatus?.() !== 409) throw err;
      }
    }

    const pre = await this.db.query("SELECT id, expected_date FROM visits WHERE state = 'PRE_REGISTERED'");
    let noShows = 0;
    for (const v of pre.rows) {
      if (now < schoolInstant(v.expected_date, s.closingTime)) continue;
      try {
        await this.db.tx(async (q) => {
          await this.transition(q, v.id, 'MARK_NO_SHOW', { decided_at: now });
          await this.audit.record(q, SYSTEM_ACTOR, 'VISIT_NO_SHOW', 'visit', v.id);
        });
        noShows++;
      } catch (err: any) {
        if (err?.getStatus?.() !== 409) throw err;
      }
    }
    return { checkedOut, noShows };
  }

  /** Clears personal data on old visits; keeps timestamps, host, purpose and status. */
  async anonymiseOld(): Promise<number> {
    const s = await this.settings.get();
    const cutoff = addMinutes(this.clock.now(), -s.retentionDays * 24 * 60);
    const { rows } = await this.db.query(
      `UPDATE visits SET visitor_name = NULL, visitor_contact = NULL, decline_reason = NULL, anonymised_at = $2
       WHERE registered_at < $1 AND anonymised_at IS NULL AND state NOT IN ('PRE_REGISTERED','AWAITING_HOST','CHECKED_IN')
       RETURNING id`,
      [cutoff, this.clock.now()],
    );
    if (rows.length) {
      await this.audit.record(null, SYSTEM_ACTOR, 'VISITS_ANONYMISED', 'visit', null, {
        count: rows.length,
        olderThanDays: s.retentionDays,
      });
    }
    return rows.length;
  }
}
