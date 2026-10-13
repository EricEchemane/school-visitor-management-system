'use client';
import { FormEvent, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ErrorText, StateBadge } from '@/components/ui';
import { api, Visit } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePolling } from '@/lib/hooks';
import { fmtDateTime, fmtTime, visitorLabel } from '@/lib/util';

export default function AdminPage() {
  return (
    <Shell need={['visit:view_all', 'audit:view', 'user:manage', 'role:manage', 'messages:view']}>
      <Admin />
    </Shell>
  );
}

const TABS = [
  { id: 'live', label: 'On campus', perm: 'visit:view_all' },
  { id: 'history', label: 'All visits', perm: 'audit:view' },
  { id: 'audit', label: 'Audit trail', perm: 'audit:view' },
  { id: 'messages', label: 'Sent messages', perm: 'messages:view' },
  { id: 'users', label: 'Users', perm: 'user:manage' },
  { id: 'roles', label: 'Roles & permissions', perm: 'role:manage' },
] as const;

function Admin() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.perm));
  const [tab, setTab] = useState<string>(tabs[0]?.id ?? 'live');
  return (
    <>
      <h1>Administration</h1>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'live' && <Live />}
      {tab === 'history' && <History />}
      {tab === 'audit' && <Audit />}
      {tab === 'messages' && <Messages />}
      {tab === 'users' && <Users />}
      {tab === 'roles' && <Roles />}
    </>
  );
}

function Live() {
  const { data, error } = usePolling(() =>
    api<{ count: number; overstayedCount: number; visits: Visit[] }>('/visits/on-campus'),
  );
  return (
    <section className="card" data-testid="admin-live">
      <h2>
        On campus now: {data?.count ?? '…'}
        {!!data?.overstayedCount && <span className="badge overstay"> {data.overstayedCount} overstayed</span>}
      </h2>
      <ErrorText message={error} />
      <table>
        <thead>
          <tr>
            <th>Pass</th>
            <th>Visitor</th>
            <th>Host</th>
            <th>Purpose</th>
            <th>In</th>
            <th>Expected out</th>
          </tr>
        </thead>
        <tbody>
          {(data?.visits ?? []).map((v) => (
            <tr key={v.id}>
              <td>{v.pass?.number}</td>
              <td>
                {visitorLabel(v)} {v.overstayed && <StateBadge state={v.state} overstayed />}
              </td>
              <td>{v.hostName}</td>
              <td>{v.purpose}</td>
              <td>{fmtTime(v.checkedInAt)}</td>
              <td>{fmtTime(v.expectedEndAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function History() {
  const { data, error } = usePolling(() => api<Visit[]>('/visits/history'), 15000);
  return (
    <section className="card">
      <h2>Recent visits</h2>
      <ErrorText message={error} />
      <table>
        <thead>
          <tr>
            <th>Visitor</th>
            <th>Host</th>
            <th>Date</th>
            <th>In</th>
            <th>Out</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((v) => (
            <tr key={v.id}>
              <td>{visitorLabel(v)}</td>
              <td>{v.hostName}</td>
              <td>{v.expectedDate}</td>
              <td>{fmtTime(v.checkedInAt)}</td>
              <td>
                {fmtTime(v.checkedOutAt)}
                {v.state === 'CHECKED_OUT' && v.departureVerified === false && (
                  <span className="muted small" title="Closed automatically at closing time"> (unverified)</span>
                )}
              </td>
              <td>
                <StateBadge state={v.state} overstayed={v.overstayed} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Audit() {
  const [action, setAction] = useState('');
  const { data, error } = usePolling(() => api<any[]>(`/audit${action ? `?action=${encodeURIComponent(action)}` : ''}`), 10000);
  return (
    <section className="card" data-testid="audit">
      <h2>Audit trail</h2>
      <input placeholder="Filter by action, e.g. VISIT_CHECKED_IN" value={action} onChange={(e) => setAction(e.target.value.trim())} aria-label="Filter by action" />
      <ErrorText message={error} />
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Action</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id}>
              <td>{fmtDateTime(e.at)}</td>
              <td>{e.actor_label}</td>
              <td>{e.action}</td>
              <td className="small muted">{Object.keys(e.details).length ? JSON.stringify(e.details) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Messages() {
  const { data, error } = usePolling(() => api<any[]>('/messages'), 10000);
  return (
    <section className="card">
      <h2>Sent messages (simulated email and SMS)</h2>
      <ErrorText message={error} />
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>To</th>
            <th>Channel</th>
            <th>Message</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((m) => (
            <tr key={m.id}>
              <td>{fmtDateTime(m.createdAt)}</td>
              <td>{m.recipientName}</td>
              <td>{m.channel}</td>
              <td>{m.message}</td>
              <td>
                <span className={`badge ${m.status === 'FAILED' ? 's-DECLINED' : 's-CHECKED_IN'}`}>{m.status}</span>
                {m.error && <div className="muted small">{m.error}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface Role {
  id: number;
  name: string;
  system: boolean;
  permissions: string[];
  userCount: number;
}

function Users() {
  const users = usePolling(() => api<any[]>('/admin/users'), 15000);
  const roles = usePolling(() => api<Role[]>('/admin/roles'), 30000);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '', roleId: 0 });

  async function patch(id: string, body: object) {
    setError(null);
    try {
      await api(`/admin/users/${id}`, { method: 'PATCH', body });
    } catch (e) {
      setError((e as Error).message);
    }
    users.reload();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/users', { body: { ...f, roleId: Number(f.roleId) } });
      setF({ name: '', email: '', password: '', roleId: 0 });
    } catch (err) {
      setError((err as Error).message);
    }
    users.reload();
  }

  return (
    <>
      <section className="card">
        <h2>Users</h2>
        <ErrorText message={error} />
        <table data-testid="users">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.roleId} onChange={(e) => patch(u.id, { roleId: Number(e.target.value) })} aria-label={`Role for ${u.name}`}>
                    {(roles.data ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={u.active} onChange={(e) => patch(u.id, { active: e.target.checked })} aria-label={`Active: ${u.name}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Add a user</h2>
        <form className="grid" onSubmit={create}>
          <label>
            Name
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label>
            Email
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
          <label>
            Temporary password
            <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
          </label>
          <label>
            Role
            <select value={f.roleId} onChange={(e) => setF({ ...f, roleId: Number(e.target.value) })} required>
              <option value={0} disabled>
                Choose role…
              </option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="actions">
            <button className="primary">Create user</button>
          </div>
        </form>
      </section>
    </>
  );
}

function Roles() {
  const roles = usePolling(() => api<Role[]>('/admin/roles'), 30000);
  const perms = usePolling(() => api<string[]>('/admin/permissions'), 600000);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  async function toggle(role: Role, perm: string) {
    setError(null);
    const next = role.permissions.includes(perm) ? role.permissions.filter((p) => p !== perm) : [...role.permissions, perm];
    try {
      await api(`/admin/roles/${role.id}/permissions`, { method: 'PUT', body: { permissions: next } });
    } catch (e) {
      setError((e as Error).message);
    }
    roles.reload();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/admin/roles', { body: { name, permissions: [] } });
      setName('');
    } catch (err) {
      setError((err as Error).message);
    }
    roles.reload();
  }

  async function remove(role: Role) {
    setError(null);
    try {
      await api(`/admin/roles/${role.id}`, { method: 'DELETE' });
    } catch (e) {
      setError((e as Error).message);
    }
    roles.reload();
  }

  return (
    <section className="card" data-testid="roles">
      <h2>Roles and permissions</h2>
      <p className="muted small">Changes apply on the person&apos;s next request. The Admin role always keeps user and role management.</p>
      <ErrorText message={error} />
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Permission</th>
              {(roles.data ?? []).map((r) => (
                <th key={r.id}>
                  {r.name}
                  <div className="muted small">{r.userCount} user(s)</div>
                  {!r.system && (
                    <button className="link" onClick={() => remove(r)}>
                      Delete
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(perms.data ?? []).map((p) => (
              <tr key={p}>
                <td>
                  <code>{p}</code>
                </td>
                {(roles.data ?? []).map((r) => (
                  <td key={r.id} className="center">
                    <input type="checkbox" checked={r.permissions.includes(p)} onChange={() => toggle(r, p)} aria-label={`${r.name} ${p}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="inline" onSubmit={create}>
        <input placeholder="New role name" value={name} onChange={(e) => setName(e.target.value)} required aria-label="New role name" />
        <button className="primary">Create role</button>
      </form>
    </section>
  );
}
