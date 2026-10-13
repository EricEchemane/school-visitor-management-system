import { TestApp, USERS, startTestApp, BASE_TIME } from './helpers';

describe('access control, audit integrity and admin rules', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.stop());
  beforeEach(() => t.clock.set(BASE_TIME));

  describe('server-side RBAC (AC-10.2)', () => {
    it('requires sign-in for everything except health and login', async () => {
      await t.http().get('/api/health').expect(200);
      await t.http().get('/api/visits/on-campus').expect(401);
      await t.http().post('/api/visits/walk-in').send({}).expect(401);
      await t.http().get('/api/audit').expect(401);
    });

    it('denies each role what its permissions do not include', async () => {
      const teacher = await t.as(USERS.teacher1);
      const guard = await t.as(USERS.guard);
      const admin = await t.as(USERS.admin);
      const host = t.ids[USERS.teacher1];

      // employee cannot work the gate or see admin data
      await teacher.post('/api/visits/walk-in').send({ visitorName: 'X', purpose: 'Y', hostId: host }).expect(403);
      await teacher.get('/api/visits/on-campus').expect(403);
      await teacher.get('/api/visits/expected').expect(403);
      await teacher.get('/api/audit').expect(403);
      await teacher.get('/api/admin/users').expect(403);
      await teacher.post('/api/visits/check-out').send({ code: 'V-0001' }).expect(403);

      // guard cannot pre-register, answer for a host, or see admin data
      await guard.post('/api/visits').send({ visitorName: 'X', purpose: 'Y', date: '2026-03-10' }).expect(403);
      await guard
        .post('/api/visits/00000000-0000-4000-8000-000000000000/respond')
        .send({ decision: 'confirm' })
        .expect(403);
      await guard.get('/api/audit').expect(403);
      await guard.get('/api/admin/roles').expect(403);

      // admin is read-only for visits
      await admin.post('/api/visits/walk-in').send({ visitorName: 'X', purpose: 'Y', hostId: host }).expect(403);
      await admin.post('/api/visits/check-out').send({ code: 'V-0001' }).expect(403);
      await admin.get('/api/visits/on-campus').expect(200);
      await admin.get('/api/audit').expect(200);
    });

    it('only the named host can answer, even with the host permission (AC-4.4)', async () => {
      const guard = await t.as(USERS.guard);
      const other = await t.as(USERS.teacher2);
      const v = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'Hank Host', purpose: 'Visit', hostId: t.ids[USERS.teacher1] })
        .expect(201);
      await other.post(`/api/visits/${v.body.id}/respond`).send({ decision: 'confirm' }).expect(403);
    });

    it('does not leak visits to other employees', async () => {
      const teacher1 = await t.as(USERS.teacher1);
      const teacher2 = await t.as(USERS.teacher2);
      const v = await teacher1
        .post('/api/visits')
        .send({ visitorName: 'Private Pete', purpose: 'Visit', date: '2026-03-10' })
        .expect(201);
      const theirs = await teacher2.get('/api/visits/mine').expect(200);
      expect(theirs.body.map((x: any) => x.id)).not.toContain(v.body.id);
    });

    it('validates input and never echoes server errors', async () => {
      const guard = await t.as(USERS.guard);
      const res = await guard.post('/api/visits/walk-in').send({ visitorName: '', purpose: 'x' }).expect(400);
      expect(res.body.code).toBe('VALIDATION');
      await guard.post('/api/visits/not-a-uuid/check-in').expect(400);
      const bad = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'A', purpose: 'B', hostId: t.ids[USERS.teacher1], visitorContact: '12345' })
        .expect(400);
      expect(bad.body.message).toMatch(/Philippine mobile/);
    });
  });

  describe('sessions and login', () => {
    it('rate-limits repeated failed logins (AC-10.4)', async () => {
      for (let i = 0; i < 5; i++) {
        await t.http().post('/api/auth/login').send({ email: USERS.teacher2, password: 'wrong' }).expect(401);
      }
      await t.http().post('/api/auth/login').send({ email: USERS.teacher2, password: 'wrong' }).expect(429);
      t.clock.advanceMinutes(16);
      await t.as(USERS.teacher2); // window passed, the real password works again
    });

    it('logout ends the session on the server', async () => {
      const agent = await t.as(USERS.guard);
      await agent.get('/api/auth/me').expect(200);
      await agent.post('/api/auth/logout').expect(204);
      await agent.get('/api/auth/me').expect(401);
    });
  });

  describe('audit trail (AC-9)', () => {
    it('records logins and cannot be altered by the application database user', async () => {
      const admin = await t.as(USERS.admin);
      const events = (await admin.get('/api/audit').expect(200)).body;
      expect(events.some((e: any) => e.action === 'LOGIN')).toBe(true);
      await expect(t.db.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(/permission denied/);
      await expect(t.db.query('DELETE FROM audit_events')).rejects.toThrow(/permission denied/);
      await expect(t.db.query('TRUNCATE audit_events')).rejects.toThrow(/permission denied/);
    });
  });

  describe('users, roles and permissions (AC-10)', () => {
    it('a custom role takes effect on the very next request, and permissions are what is checked', async () => {
      const admin = await t.as(USERS.admin);
      const guard = await t.as(USERS.guard);
      const roles = (await admin.get('/api/admin/roles').expect(200)).body;
      const frontDesk = roles.find((r: any) => r.name === 'Front Desk');

      await guard.get('/api/visits/on-campus').expect(200);
      const without = frontDesk.permissions.filter((p: string) => p !== 'visit:view_all');
      await admin.put(`/api/admin/roles/${frontDesk.id}/permissions`).send({ permissions: without }).expect(204);
      await guard.get('/api/visits/on-campus').expect(403);
      await admin
        .put(`/api/admin/roles/${frontDesk.id}/permissions`)
        .send({ permissions: frontDesk.permissions })
        .expect(204);
      await guard.get('/api/visits/on-campus').expect(200);

      // new role + new user
      const created = await admin
        .post('/api/admin/roles')
        .send({ name: 'Security Supervisor', permissions: ['visit:view_all', 'audit:view'] })
        .expect(201);
      await admin
        .post('/api/admin/users')
        .send({
          email: 'supervisor@school.test',
          name: 'Sam Supervisor',
          password: 'Passw0rd!demo',
          roleId: created.body.id,
        })
        .expect(201);
      const sup = await t.as('supervisor@school.test');
      await sup.get('/api/audit').expect(200);
      await sup
        .post('/api/visits/walk-in')
        .send({ visitorName: 'X', purpose: 'Y', hostId: t.ids[USERS.teacher1] })
        .expect(403);
    });

    it('protects the Admin role and the last admin from lock-out (AC-10.3)', async () => {
      const admin = await t.as(USERS.admin);
      const roles = (await admin.get('/api/admin/roles').expect(200)).body;
      const adminRole = roles.find((r: any) => r.name === 'Admin');

      const stripped = adminRole.permissions.filter((p: string) => p !== 'role:manage');
      const res = await admin
        .put(`/api/admin/roles/${adminRole.id}/permissions`)
        .send({ permissions: stripped })
        .expect(409);
      expect(res.body.code).toBe('ADMIN_PROTECTED');

      await admin.delete(`/api/admin/roles/${adminRole.id}`).expect(409);

      const users = (await admin.get('/api/admin/users').expect(200)).body;
      const me = users.find((u: any) => u.email === USERS.admin);
      const deactivate = await admin.patch(`/api/admin/users/${me.id}`).send({ active: false }).expect(409);
      expect(deactivate.body.code).toBe('LAST_ADMIN');
      const demote = await admin
        .patch(`/api/admin/users/${me.id}`)
        .send({ roleId: roles.find((r: any) => r.name === 'Employee').id })
        .expect(409);
      expect(demote.body.code).toBe('LAST_ADMIN');
    });

    it('a deactivated user loses access immediately and cannot be chosen as host', async () => {
      const admin = await t.as(USERS.admin);
      const guard = await t.as(USERS.guard);
      const users = (await admin.get('/api/admin/users').expect(200)).body;
      const victim = users.find((u: any) => u.email === 'registrar@school.test');
      const victimSession = await t.as('registrar@school.test');
      await victimSession.get('/api/auth/me').expect(200);

      await admin.patch(`/api/admin/users/${victim.id}`).send({ active: false }).expect(204);
      await victimSession.get('/api/auth/me').expect(401);
      await t
        .http()
        .post('/api/auth/login')
        .send({ email: 'registrar@school.test', password: 'Passw0rd!demo' })
        .expect(401);
      const res = await guard
        .post('/api/visits/walk-in')
        .send({ visitorName: 'X', purpose: 'Y', hostId: victim.id })
        .expect(400);
      expect(res.body.code).toBe('INVALID_HOST');
    });
  });
});
