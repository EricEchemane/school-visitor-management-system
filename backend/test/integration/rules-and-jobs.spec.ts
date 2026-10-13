import { TestApp, USERS, startTestApp, BASE_TIME } from './helpers';

describe('time-based rules and failure paths', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.stop());
  beforeEach(() => {
    t.clock.set(BASE_TIME);
    t.email.failing = false;
    t.sms.failing = false;
  });

  const walkIn = async (name: string, host = USERS.teacher1) => {
    const guard = await t.as(USERS.guard);
    const res = await guard
      .post('/api/visits/walk-in')
      .send({ visitorName: name, purpose: 'Visit', hostId: t.ids[host] })
      .expect(201);
    return res.body.id as string;
  };

  describe('host does not respond (AC-6)', () => {
    it('reminds at half the timeout, expires at the full timeout, and rejects a late confirmation', async () => {
      const teacher = await t.as(USERS.teacher1);
      const guard = await t.as(USERS.guard);
      const id = await walkIn('Tina Timeout');

      t.clock.advanceMinutes(3); // past 2.5 min
      expect((await t.jobs.runAll()).reminders).toBe(1);
      expect((await t.jobs.runAll()).reminders).toBe(0); // only one reminder
      const inbox = await teacher.get('/api/notifications').expect(200);
      expect(
        inbox.body
          .filter((n: any) => n.visitId === id)
          .map((n: any) => n.kind)
          .sort(),
      ).toEqual(['REMINDER', 'WALK_IN_REQUEST']);
      const awaiting = await guard.get('/api/visits/awaiting').expect(200);
      expect(awaiting.body.map((v: any) => v.id)).toContain(id);

      t.clock.advanceMinutes(2); // 5 minutes total
      expect((await t.jobs.runAll()).expired).toBeGreaterThanOrEqual(1);

      const outcomes = await guard.get('/api/visits/outcomes').expect(200);
      expect(outcomes.body.find((v: any) => v.id === id).state).toBe('EXPIRED');

      const late = await teacher.post(`/api/visits/${id}/respond`).send({ decision: 'confirm' }).expect(409);
      expect(late.body.code).toBe('VISIT_ALREADY_CHANGED');
    });

    it('applies the timeout on read too, without waiting for the job (AC-6.3)', async () => {
      const teacher = await t.as(USERS.teacher1);
      const id = await walkIn('Rita Read');
      t.clock.advanceMinutes(6); // job has NOT run
      await teacher.post(`/api/visits/${id}/respond`).send({ decision: 'confirm' }).expect(409);
    });

    it('exactly one of two simultaneous answers wins', async () => {
      const teacher = await t.as(USERS.teacher1);
      const id = await walkIn('Cody Concurrent');
      const [a, b] = await Promise.all([
        teacher.post(`/api/visits/${id}/respond`).send({ decision: 'confirm' }),
        teacher.post(`/api/visits/${id}/respond`).send({ decision: 'decline' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });
  });

  describe('overstay is derived (AC-7)', () => {
    it('flags a checked-in visitor only after the expected end', async () => {
      const teacher = await t.as(USERS.teacher1);
      const guard = await t.as(USERS.guard);
      const v = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Olive Overstay', purpose: 'Visit', date: '2026-03-10', durationMinutes: 30 })
        .expect(201);
      await guard.post(`/api/visits/${v.body.id}/check-in`).expect(200);

      const find = async () => {
        const live = await guard.get('/api/visits/on-campus').expect(200);
        return live.body.visits.find((x: any) => x.id === v.body.id);
      };
      expect((await find()).overstayed).toBe(false);
      t.clock.advanceMinutes(31);
      expect((await find()).overstayed).toBe(true);
      const live = await guard.get('/api/visits/on-campus').expect(200);
      expect(live.body.overstayedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('closing-time sweep (AC-8)', () => {
    it('checks out forgotten visitors at closing time, marks them unverified, invalidates the pass, and allows correction', async () => {
      let teacher = await t.as(USERS.teacher1);
      let guard = await t.as(USERS.guard);
      let admin = await t.as(USERS.admin);

      const v = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Fiona Forgot', purpose: 'Visit', date: '2026-03-10' })
        .expect(201);
      const noShow = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Nico NoShow', purpose: 'Visit', date: '2026-03-10' })
        .expect(201);
      const checkedIn = await guard.post(`/api/visits/${v.body.id}/check-in`).expect(200);

      t.clock.set(new Date('2026-03-10T09:59:00Z')); // 17:59 Manila: before closing
      await t.jobs.runAll();
      expect((await guard.get('/api/visits/on-campus')).body.visits.map((x: any) => x.id)).toContain(v.body.id);

      t.clock.set(new Date('2026-03-10T10:05:00Z')); // 18:05 Manila: after closing
      const result = await t.jobs.runAll();
      // sessions last 8 hours, so sign in again after the clock jumps
      teacher = await t.as(USERS.teacher1);
      guard = await t.as(USERS.guard);
      admin = await t.as(USERS.admin);
      expect(result.checkedOut).toBeGreaterThanOrEqual(1);
      expect(result.noShows).toBeGreaterThanOrEqual(1);

      const history = (await admin.get('/api/visits/history').expect(200)).body;
      const closed = history.find((x: any) => x.id === v.body.id);
      expect(closed.state).toBe('CHECKED_OUT');
      expect(closed.departureVerified).toBe(false);
      expect(new Date(closed.checkedOutAt).toISOString()).toBe('2026-03-10T10:00:00.000Z');
      expect(history.find((x: any) => x.id === noShow.body.id).state).toBe('NO_SHOW');

      // the pass no longer works
      await guard.post('/api/visits/check-out').send({ code: checkedIn.body.pass.number }).expect(409);

      // AC-8.2: correction rules
      const departedAt = '2026-03-10T07:30:00.000Z';
      await guard
        .post(`/api/visits/${v.body.id}/correct-departure`)
        .send({ departedAt: '2026-03-10T01:00:00.000Z' }) // before check-in
        .expect(400);
      await guard
        .post(`/api/visits/${v.body.id}/correct-departure`)
        .send({ departedAt: '2026-03-10T12:00:00.000Z' }) // in the future
        .expect(400);
      const fixed = await guard.post(`/api/visits/${v.body.id}/correct-departure`).send({ departedAt }).expect(200);
      expect(fixed.body.departureVerified).toBe(true);
      expect(new Date(fixed.body.checkedOutAt).toISOString()).toBe(departedAt);
      await guard.post(`/api/visits/${v.body.id}/correct-departure`).send({ departedAt }).expect(409); // already verified

      const audit = (await admin.get('/api/audit').query({ targetId: v.body.id })).body;
      const correction = audit.find((e: any) => e.action === 'DEPARTURE_CORRECTED');
      expect(new Date(correction.details.previous).toISOString()).toBe('2026-03-10T10:00:00.000Z');
    });

    it('is idempotent: running it again changes nothing', async () => {
      t.clock.set(new Date('2026-03-10T10:30:00Z'));
      await t.jobs.runAll();
      const again = await t.jobs.runAll();
      expect(again.checkedOut).toBe(0);
      expect(again.noShows).toBe(0);
    });
  });

  describe('notification failures (AC-4.6)', () => {
    it('records the failed email, keeps the in-app notification, and still registers the walk-in', async () => {
      t.email.failing = true;
      const teacher = await t.as(USERS.teacher2);
      const admin = await t.as(USERS.admin);
      const id = await walkIn('Nora Notify', USERS.teacher2);

      const inbox = await teacher.get('/api/notifications').expect(200);
      expect(inbox.body.some((n: any) => n.visitId === id && n.kind === 'WALK_IN_REQUEST')).toBe(true);

      const messages = (await admin.get('/api/messages').expect(200)).body;
      const failed = messages.find((m: any) => m.status === 'FAILED' && m.channel === 'EMAIL');
      expect(failed.error).toMatch(/outage/);

      const audit = (await admin.get('/api/audit').query({ targetId: id })).body;
      expect(audit.map((e: any) => e.action)).toContain('NOTIFICATION_FAILED');

      // and the host can still confirm
      await teacher.post(`/api/visits/${id}/respond`).send({ decision: 'confirm' }).expect(200);
    });
  });

  describe('data retention (AC-12)', () => {
    it('clears personal data on old visits but keeps the facts', async () => {
      const teacher = await t.as(USERS.teacher1);
      const v = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Old Visitor', visitorContact: '0917 000 0099', purpose: 'Enrolment', date: '2026-03-10' })
        .expect(201);
      await teacher.post(`/api/visits/${v.body.id}/cancel`).expect(200);

      t.clock.set(new Date('2027-03-12T02:00:00Z')); // > 1 year later
      await t.jobs.runAll();
      const admin = await t.as(USERS.admin);
      const row = (await admin.get('/api/visits/history').expect(200)).body.find((x: any) => x.id === v.body.id);
      expect(row.anonymised).toBe(true);
      expect(row.visitorName).toBeNull();
      expect(row.visitorContact).toBeNull();
      expect(row.purpose).toBe('Enrolment');
      expect(row.state).toBe('CANCELLED');
    });
  });
});
