'use client';
import { FormEvent, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ErrorText, StateBadge } from '@/components/ui';
import { api, Visit } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePolling } from '@/lib/hooks';
import { addDaysISO, fmtTime, todayInSchool, visitorLabel } from '@/lib/util';

export default function EmployeePage() {
  return (
    <Shell need={['visit:preregister', 'visit:host']}>
      <Employee />
    </Shell>
  );
}

function Employee() {
  const { user, can } = useAuth();
  const mine = usePolling(() => api<Visit[]>('/visits/mine'));
  const requests = (mine.data ?? []).filter((v) => v.state === 'AWAITING_HOST' && v.hostId === user?.id);
  const others = (mine.data ?? []).filter((v) => !requests.includes(v));

  return (
    <>
      <h1>My visitors</h1>
      {can('visit:host') && <Requests requests={requests} onChange={mine.reload} />}
      {can('visit:preregister') && <PreRegister onCreated={mine.reload} />}
      <section className="card">
        <h2>Upcoming and recent</h2>
        <ErrorText message={mine.error} />
        {others.length === 0 ? (
          <p className="muted">No visitors yet.</p>
        ) : (
          <table data-testid="my-visits">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Purpose</th>
                <th>Date</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {others.map((v) => (
                <MyVisitRow key={v.id} v={v} onChange={mine.reload} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Requests({ requests, onChange }: { requests: Visit[]; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  async function respond(id: string, decision: 'confirm' | 'decline') {
    setError(null);
    try {
      await api(`/visits/${id}/respond`, { body: { decision, reason: reasons[id] || undefined } });
    } catch (e) {
      setError((e as Error).message);
    }
    onChange();
  }

  if (requests.length === 0) return null;
  return (
    <section className="card attention" data-testid="requests">
      <h2>Someone is at the gate for you</h2>
      <ErrorText message={error} />
      {requests.map((v) => (
        <div className="request" key={v.id} data-testid="request">
          <div>
            <strong>{visitorLabel(v)}</strong> — {v.purpose}
            <div className="muted">Waiting since {fmtTime(v.registeredAt)}. Is this visitor expected?</div>
          </div>
          <input
            placeholder="Reason if declining (optional)"
            value={reasons[v.id] ?? ''}
            onChange={(e) => setReasons({ ...reasons, [v.id]: e.target.value })}
            aria-label="Decline reason"
          />
          <button className="primary" onClick={() => respond(v.id, 'confirm')}>
            Confirm
          </button>
          <button className="danger" onClick={() => respond(v.id, 'decline')}>
            Decline
          </button>
        </div>
      ))}
    </section>
  );
}

function PreRegister({ onCreated }: { onCreated: () => void }) {
  const today = todayInSchool();
  const empty = { visitorName: '', visitorContact: '', purpose: '', date: today, windowStart: '', windowEnd: '', durationMinutes: 120 };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    try {
      await api('/visits', {
        body: {
          visitorName: f.visitorName,
          visitorContact: f.visitorContact || null,
          purpose: f.purpose,
          date: f.date,
          windowStart: f.windowStart || null,
          windowEnd: f.windowEnd || null,
          durationMinutes: Number(f.durationMinutes),
        },
      });
      setDone(`${f.visitorName} is on the list for ${f.date}.`);
      setF(empty);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card">
      <h2>Expect a visitor</h2>
      <form onSubmit={submit} className="grid" data-testid="prereg-form">
        <label>
          Visitor name
          <input value={f.visitorName} onChange={(e) => setF({ ...f, visitorName: e.target.value })} required />
        </label>
        <label>
          Purpose of visit
          <input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} required maxLength={200} />
        </label>
        <label>
          Visitor mobile (optional)
          <input value={f.visitorContact} onChange={(e) => setF({ ...f, visitorContact: e.target.value })} placeholder="0917 000 0000" />
        </label>
        <label>
          Date
          <input type="date" value={f.date} min={today} max={addDaysISO(today, 30)} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        </label>
        <label>
          Arrives from
          <input type="time" value={f.windowStart} onChange={(e) => setF({ ...f, windowStart: e.target.value })} />
        </label>
        <label>
          Arrives until
          <input type="time" value={f.windowEnd} onChange={(e) => setF({ ...f, windowEnd: e.target.value })} />
        </label>
        <label>
          Expected stay
          <select value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: Number(e.target.value) })}>
            {[30, 60, 120, 180, 240].map((m) => (
              <option key={m} value={m}>
                {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button className="primary">Add to expected visitors</button>
        </div>
      </form>
      <p className="muted small">
        Visitor details are used only to manage this visit and are anonymised after one year.
      </p>
      <ErrorText message={error} />
      {done && <p className="ok" role="status">{done}</p>}
    </section>
  );
}

function MyVisitRow({ v, onChange }: { v: Visit; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  async function cancel() {
    try {
      await api(`/visits/${v.id}/cancel`, { method: 'POST' });
    } catch (e) {
      setError((e as Error).message);
    }
    onChange();
  }
  return (
    <tr>
      <td>{visitorLabel(v)}</td>
      <td>{v.purpose}</td>
      <td>{v.expectedDate}</td>
      <td>
        <StateBadge state={v.state} overstayed={v.overstayed} />
        {v.declineReason && <div className="muted small">“{v.declineReason}”</div>}
      </td>
      <td>
        {v.state === 'PRE_REGISTERED' && (
          <button className="link" onClick={cancel}>
            Cancel
          </button>
        )}
        <ErrorText message={error} />
      </td>
    </tr>
  );
}
