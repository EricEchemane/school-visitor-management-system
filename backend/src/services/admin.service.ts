import { Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Db } from '../db/pool';
import { AuditService, Actor } from './audit.service';
import { AuthService } from './auth.service';
import { AuthUser } from '../common/auth';
import { badRequest, conflict, notFound } from '../common/errors';
import { ADMIN_PROTECTED, PERMISSIONS } from '../domain/permissions';

const actorOf = (u: AuthUser): Actor => ({ id: u.id, label: u.email });

@Injectable()
export class AdminService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  // ---------- users ----------

  async listUsers() {
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.name, u.mobile, u.active, u.role_id AS "roleId", r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.name`,
    );
    return rows;
  }

  async createUser(
    admin: AuthUser,
    input: { email: string; name: string; password: string; roleId: number; mobile?: string | null },
  ) {
    const exists = await this.db.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [input.email]);
    if (exists.rowCount) throw conflict('EMAIL_TAKEN', 'A user with that email already exists');
    const role = await this.db.query('SELECT id FROM roles WHERE id = $1', [input.roleId]);
    if (!role.rowCount) throw badRequest('Unknown role');
    const { rows } = await this.db.query(
      `INSERT INTO users(email, name, password_hash, role_id, mobile) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.email.trim(), input.name.trim(), bcrypt.hashSync(input.password, 10), input.roleId, input.mobile || null],
    );
    await this.audit.record(null, actorOf(admin), 'USER_CREATED', 'user', rows[0].id, {
      roleId: input.roleId,
    });
    return { id: rows[0].id };
  }

  async updateUser(
    admin: AuthUser,
    id: string,
    patch: { name?: string; roleId?: number; active?: boolean; mobile?: string | null; password?: string },
  ) {
    await this.db.tx(async (q) => {
      const cur = await q.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (!cur.rowCount) throw notFound('User');
      if (patch.roleId !== undefined) {
        const role = await q.query('SELECT id FROM roles WHERE id = $1', [patch.roleId]);
        if (!role.rowCount) throw badRequest('Unknown role');
      }
      const map: Record<string, unknown> = {
        name: patch.name?.trim(),
        role_id: patch.roleId,
        active: patch.active,
        mobile: patch.mobile === undefined ? undefined : patch.mobile || null,
        password_hash: patch.password ? bcrypt.hashSync(patch.password, 10) : undefined,
      };
      const cols = Object.keys(map).filter((c) => map[c] !== undefined);
      if (cols.length) {
        await q.query(`UPDATE users SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [
          id,
          ...cols.map((c) => map[c]),
        ]);
      }
      await this.assertSomeoneCanManageUsers(q);
      await this.audit.record(q, actorOf(admin), 'USER_UPDATED', 'user', id, {
        fields: cols.map((c) => (c === 'password_hash' ? 'password' : c)),
      });
    });
    if (patch.active === false || patch.roleId !== undefined || patch.password) {
      await this.auth.revokeUserSessions(id);
    }
  }

  /** Never let a change leave the school without an active user who can manage users and roles. */
  private async assertSomeoneCanManageUsers(q: { query: Db['query'] } | any) {
    const { rows } = await q.query(
      `SELECT count(*)::int AS n FROM users u
       WHERE u.active AND ${ADMIN_PROTECTED.map(
         (code) => `EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
                            WHERE rp.role_id = u.role_id AND p.code = '${code}')`,
       ).join(' AND ')}`,
    );
    if (rows[0].n < 1) {
      throw conflict('LAST_ADMIN', 'This change would leave nobody able to manage users and roles.');
    }
  }

  // ---------- roles and permissions ----------

  permissions() {
    return PERMISSIONS;
  }

  async listRoles() {
    const { rows } = await this.db.query(
      `SELECT r.id, r.name, r.system,
              COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions,
              (SELECT count(*)::int FROM users u WHERE u.role_id = r.id) AS "userCount"
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id ORDER BY r.system DESC, r.name`,
    );
    return rows;
  }

  async createRole(admin: AuthUser, name: string, permissions: string[]) {
    this.assertKnown(permissions);
    const dup = await this.db.query('SELECT 1 FROM roles WHERE lower(name) = lower($1)', [name]);
    if (dup.rowCount) throw conflict('ROLE_EXISTS', 'A role with that name already exists');
    const id = await this.db.tx(async (q) => {
      const { rows } = await q.query('INSERT INTO roles(name) VALUES ($1) RETURNING id', [name.trim()]);
      await this.writePermissions(q, rows[0].id, permissions);
      await this.audit.record(q, actorOf(admin), 'ROLE_CREATED', 'role', String(rows[0].id), { name, permissions });
      return rows[0].id as number;
    });
    return { id };
  }

  async setRolePermissions(admin: AuthUser, roleId: number, permissions: string[]) {
    this.assertKnown(permissions);
    await this.db.tx(async (q) => {
      const role = await q.query('SELECT id, name, system FROM roles WHERE id = $1 FOR UPDATE', [roleId]);
      if (!role.rowCount) throw notFound('Role');
      if (role.rows[0].name === 'Admin') {
        const missing = ADMIN_PROTECTED.filter((p) => !permissions.includes(p));
        if (missing.length) {
          throw conflict('ADMIN_PROTECTED', `The Admin role must keep: ${missing.join(', ')}`);
        }
      }
      await q.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      await this.writePermissions(q, roleId, permissions);
      await this.assertSomeoneCanManageUsers(q);
      await this.audit.record(q, actorOf(admin), 'ROLE_PERMISSIONS_CHANGED', 'role', String(roleId), { permissions });
    });
  }

  async deleteRole(admin: AuthUser, roleId: number) {
    await this.db.tx(async (q) => {
      const role = await q.query('SELECT id, name, system FROM roles WHERE id = $1 FOR UPDATE', [roleId]);
      if (!role.rowCount) throw notFound('Role');
      if (role.rows[0].system) throw conflict('SYSTEM_ROLE', 'Built-in roles cannot be deleted');
      const users = await q.query('SELECT count(*)::int AS n FROM users WHERE role_id = $1', [roleId]);
      if (users.rows[0].n > 0) throw conflict('ROLE_IN_USE', 'Reassign this role\'s users before deleting it');
      await q.query('DELETE FROM roles WHERE id = $1', [roleId]);
      await this.audit.record(q, actorOf(admin), 'ROLE_DELETED', 'role', String(roleId), { name: role.rows[0].name });
    });
  }

  private assertKnown(permissions: string[]) {
    const unknown = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (unknown.length) throw badRequest(`Unknown permission: ${unknown.join(', ')}`);
  }

  private async writePermissions(q: any, roleId: number, permissions: string[]) {
    for (const code of new Set(permissions)) {
      await q.query(
        'INSERT INTO role_permissions(role_id, permission_id) SELECT $1, id FROM permissions WHERE code = $2',
        [roleId, code],
      );
    }
  }
}
