import { TestApp, USERS, startTestApp, BASE_TIME } from './helpers';

describe('visit flows', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.stop());
  beforeEach(() => t.clock.set(BASE_TIME));

  describe('walk-in flow (AC-3, AC-4, AC-5)', () => {
    it('registers, notifies the host, confirms, issues a pass, then checks out', async () => {
      const guard = await t.as(USERS.guard);
      const teacher = await t.as(USERS.teacher1);

      // AC-3.1: walk-in is awaiting the host and has no pass
      const walkIn = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'Walter Walker', purpose: 'Deliver a package', hostId: t.ids[USERS.teacher1] })
        .expect(201);
      expect(walkIn.body.state).toBe('AWAITING_HOST');
      expect(walkIn.body.pass).toBeNull();

      // AC-4.1: in-app notification plus simulated email record
      const inbox = await teacher.get('/api/notifications').expect(200);
      expect(inbox.body.find((n: any) => n.visitId === walkIn.body.id)?.kind).toBe('WALK_IN_REQUEST');
      const admin = await t.as(USERS.admin);
      const messages = await admin.get('/api/messages').expect(200);
      expect(messages.body.some((m: any) => m.channel === 'EMAIL' && m.status === 'SENT')).toBe(true);

      // not on campus until confirmed
      const before = await guard.get('/api/visits/on-campus').expect(200);
      expect(before.body.visits.map((v: any) => v.id)).not.toContain(walkIn.body.id);

      // AC-4.2: host confirms, pass issued
      const confirmed = await teacher
        .post(`/api/visits/${walkIn.body.id}/respond`)
        .send({ decision: 'confirm' })
        .expect(200);
      expect(confirmed.body.state).toBe('CHECKED_IN');
      expect(confirmed.body.pass.number).toMatch(/^V-\d{4}$/);

      const onCampus = await guard.get('/api/visits/on-campus').expect(200);
      expect(onCampus.body.visits.map((v: any) => v.id)).toContain(walkIn.body.id);

      // AC-5.1: check out with the pass number; pass is no longer valid
      const out = await guard.post('/api/visits/check-out').send({ code: confirmed.body.pass.number }).expect(200);
      expect(out.body.state).toBe('CHECKED_OUT');
      expect(out.body.departureVerified).toBe(true);

      // AC-5.2: the same pass is rejected and the attempt is audited
      const again = await guard.post('/api/visits/check-out').send({ code: confirmed.body.pass.number }).expect(409);
      expect(again.body.code).toBe('PASS_NOT_VALID');
      const audit = await admin.get('/api/audit').query({ targetId: walkIn.body.id }).expect(200);
      const actions = audit.body.map((e: any) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'VISIT_WALKIN_REGISTERED',
          'VISIT_HOST_CONFIRMED',
          'VISIT_CHECKED_OUT',
          'PASS_REJECTED',
        ]),
      );
    });

    it('the guard cannot check in a walk-in: only the host can confirm (AC-4.2)', async () => {
      const guard = await t.as(USERS.guard);
      const v = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'Gus Guard', purpose: 'Visit', hostId: t.ids[USERS.teacher1] })
        .expect(201);
      const res = await guard.post(`/api/visits/${v.body.id}/check-in`).expect(409);
      expect(res.body.code).toBe('VISIT_ALREADY_CHANGED');
    });

    it('declines: no pass, reason visible to the guard, decision is final (AC-4.3, AC-4.5)', async () => {
      const guard = await t.as(USERS.guard);
      const teacher = await t.as(USERS.teacher1);
      const v = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'Dana Decline', purpose: 'Sales call', hostId: t.ids[USERS.teacher1] })
        .expect(201);
      const res = await teacher
        .post(`/api/visits/${v.body.id}/respond`)
        .send({ decision: 'decline', reason: 'Not expecting anyone' })
        .expect(200);
      expect(res.body.state).toBe('DECLINED');
      expect(res.body.pass).toBeNull();

      const outcomes = await guard.get('/api/visits/outcomes').expect(200);
      expect(outcomes.body.find((o: any) => o.id === v.body.id).declineReason).toBe('Not expecting anyone');

      const late = await teacher.post(`/api/visits/${v.body.id}/respond`).send({ decision: 'confirm' }).expect(409);
      expect(late.body.code).toBe('VISIT_ALREADY_CHANGED');
    });

    it('warns about a duplicate open visit and lets the guard continue (AC-3.2)', async () => {
      const guard = await t.as(USERS.guard);
      const body = { visitorName: 'Maria Santos', purpose: 'Meeting', hostId: t.ids[USERS.teacher2] };
      await guard.post('/api/visits/walk-in').send(body).expect(201);
      const dup = await guard.post('/api/visits/walk-in').send(body).expect(409);
      expect(dup.body.code).toBe('DUPLICATE_WARNING');
      await guard.post('/api/visits/walk-in').send({ ...body, confirmDuplicate: true }).expect(201);
    });

    it('rejects a host who cannot host visitors (AC-3.3)', async () => {
      const guard = await t.as(USERS.guard);
      const res = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'Hal Host', purpose: 'Visit', hostId: t.ids[USERS.admin] })
        .expect(400);
      expect(res.body.code).toBe('INVALID_HOST');
    });
  });

  describe('pre-registered flow (AC-1, AC-2, AC-5)', () => {
    it('pre-registers, is found at the gate, checked in with a pass, and checked out by QR token', async () => {
      const teacher = await t.as(USERS.teacher1);
      const guard = await t.as(USERS.guard);

      const created = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Paula Parent', purpose: 'Parent-teacher meeting', date: '2026-03-10', durationMinutes: 60 })
        .expect(201);
      expect(created.body.state).toBe('PRE_REGISTERED');
      expect(created.body.hostId).toBe(t.ids[USERS.teacher1]);

      // AC-2.1: search by visitor name and by host name
      const byVisitor = await guard.get('/api/visits/expected').query({ q: 'paula' }).expect(200);
      expect(byVisitor.body.map((v: any) => v.id)).toContain(created.body.id);
      const byHost = await guard.get('/api/visits/expected').query({ q: 'teresa' }).expect(200);
      expect(byHost.body.map((v: any) => v.id)).toContain(created.body.id);

      // AC-2.2
      const checkedIn = await guard.post(`/api/visits/${created.body.id}/check-in`).expect(200);
      expect(checkedIn.body.state).toBe('CHECKED_IN');
      expect(checkedIn.body.pass.token.length).toBeGreaterThan(20);
      expect(new Date(checkedIn.body.expectedEndAt).getTime()).toBe(BASE_TIME.getTime() + 60 * 60_000);

      // AC-11.1 printable pass data excludes the contact number
      const pass = await guard.get(`/api/visits/${created.body.id}/pass`).expect(200);
      expect(pass.body).toMatchObject({ visitorName: 'Paula Parent', hostName: 'Teresa Reyes' });
      expect(pass.body.visitorContact).toBeUndefined();

      // AC-2.3: cannot check in twice
      await guard.post(`/api/visits/${created.body.id}/check-in`).expect(409);

      // AC-5.1: QR token works for check-out
      const out = await guard.post('/api/visits/check-out').send({ code: checkedIn.body.pass.token }).expect(200);
      expect(out.body.state).toBe('CHECKED_OUT');
    });

    it('rejects an arrival window that ends before it starts, on create and on edit (found in exploratory testing)', async () => {
      const teacher = await t.as(USERS.teacher1);
      const base = { visitorName: 'Wendy Window', purpose: 'Visit', date: '2026-03-10' };
      const bad = await teacher.post('/api/visits').send({ ...base, windowStart: '15:00', windowEnd: '09:00' }).expect(400);
      expect(bad.body.code).toBe('INVALID_WINDOW');
      const ok = await teacher.post('/api/visits').send({ ...base, windowStart: '09:00', windowEnd: '15:00' }).expect(201);
      await teacher.patch(`/api/visits/${ok.body.id}`).send({ windowEnd: '08:00' }).expect(400);
    });

    it('rejects bad dates (AC-1.2)', async () => {
      const teacher = await t.as(USERS.teacher1);
      const base = { visitorName: 'Dan Date', purpose: 'Visit' };
      await teacher.post('/api/visits').send({ ...base, date: '2026-03-09' }).expect(400);
      await teacher.post('/api/visits').send({ ...base, date: '2026-04-10' }).expect(400);
      await teacher.post('/api/visits').send({ ...base, date: '2026-04-09' }).expect(201);
    });

    it('lets the host edit and cancel until check-in, and only the host (AC-1.3, AC-1.4)', async () => {
      const teacher = await t.as(USERS.teacher1);
      const other = await t.as(USERS.teacher2);
      const guard = await t.as(USERS.guard);
      const v = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Eddie Edit', purpose: 'Visit', date: '2026-03-10' })
        .expect(201);

      await other.patch(`/api/visits/${v.body.id}`).send({ purpose: 'Hijack' }).expect(404);
      await other.post(`/api/visits/${v.body.id}/cancel`).expect(404);

      const edited = await teacher.patch(`/api/visits/${v.body.id}`).send({ purpose: 'Updated purpose' }).expect(200);
      expect(edited.body.purpose).toBe('Updated purpose');

      await guard.post(`/api/visits/${v.body.id}/check-in`).expect(200);
      await teacher.patch(`/api/visits/${v.body.id}`).send({ purpose: 'Too late' }).expect(409);
      await teacher.post(`/api/visits/${v.body.id}/cancel`).expect(409);

      const c = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Cathy Cancel', purpose: 'Visit', date: '2026-03-10' })
        .expect(201);
      const cancelled = await teacher.post(`/api/visits/${c.body.id}/cancel`).expect(200);
      expect(cancelled.body.state).toBe('CANCELLED');
      await guard.post(`/api/visits/${c.body.id}/check-in`).expect(409);
    });

    it('refuses to check in a visit expected on another day (wrong-day arrival is a walk-in)', async () => {
      const teacher = await t.as(USERS.teacher1);
      const guard = await t.as(USERS.guard);
      const v = await teacher
        .post('/api/visits')
        .send({ visitorName: 'Fred Future', purpose: 'Visit', date: '2026-03-12' })
        .expect(201);
      const res = await guard.post(`/api/visits/${v.body.id}/check-in`).expect(409);
      expect(res.body.code).toBe('NOT_TODAY');
      const today = await guard.get('/api/visits/expected').expect(200);
      expect(today.body.map((x: any) => x.id)).not.toContain(v.body.id);
    });
  });
});
