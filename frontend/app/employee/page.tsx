'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/Shell';
import { Button, ErrorText, Loading, StateBadge } from '@/components/ui';
import { api, Visit } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePending, usePolling } from '@/lib/hooks';
import { message, notify } from '@/lib/notify';
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
  useGateAlerts(mine.data === null ? null : requests);

  return (
    <>
      <h1>My visitors</h1>
      {can('visit:host') && <Requests requests={requests} onChange={mine.reload} />}
      {can('visit:preregister') && <PreRegister onCreated={mine.reload} />}
      <section className="card">
        <h2>Upcoming and recent</h2>
        <ErrorText message={mine.error} />
        {mine.data === null ? (
          <Loading what="your visitors" />
        ) : others.length === 0 ? (
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
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const answering = usePending<string>(); // `<visitId>:<decision>`

  const respond = (v: Visit, decision: 'confirm' | 'decline') =>
    answering.run(`${v.id}:${decision}`, async () => {
      try {
        await api(`/visits/${v.id}/respond`, { body: { decision, reason: reasons[v.id] || undefined } });
        if (decision === 'confirm') {
          notify.success(`${visitorLabel(v)} confirmed`, { description: 'The front desk is issuing a visitor pass.' });
        } else {
          notify.success(`${visitorLabel(v)} declined`, { description: 'The front desk has been told not to admit them.' });
        }
      } catch (e) {
        // usually "visit already changed": the request timed out or was answered elsewhere
        notify.error(`Could not ${decision} ${visitorLabel(v)}`, { description: message(e) });
      }
      onChange();
    });

  if (requests.length === 0) return null;
  return (
    <section className="card attention enter-card" data-testid="requests">
      <h2>
        <span className="pulse-dot" aria-hidden="true" /> Someone is at the gate for you
      </h2>
      {requests.map((v) => (
        <div className="request enter" key={v.id} data-testid="request">
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
          <Button
            className="primary"
            onClick={() => respond(v, 'confirm')}
            pending={answering.pending === `${v.id}:confirm`}
            disabled={answering.pending !== null}
          >
            Confirm
          </Button>
          <Button
            className="danger"
            onClick={() => respond(v, 'decline')}
            pending={answering.pending === `${v.id}:decline`}
            disabled={answering.pending !== null}
          >
            Decline
          </Button>
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
  const saving = usePending();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    return saving.run(true, save);
  };

  async function save() {
    setError(null);
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
      notify.success(`${f.visitorName.trim()} added to expected visitors`, {
        description: f.date === today ? 'The front desk can see them now.' : `Expected on ${f.date}.`,
      });
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
          <Button className="primary" pending={saving.pending !== null} pendingLabel="Adding…">
            Add to expected visitors
          </Button>
        </div>
      </form>
      <p className="muted small">
        Visitor details are used only to manage this visit and are anonymised after one year.
      </p>
      <ErrorText message={error} />
    </section>
  );
}

function MyVisitRow({ v, onChange }: { v: Visit; onChange: () => void }) {
  const cancelling = usePending();
  const cancel = () =>
    cancelling.run(true, async () => {
      try {
        await api(`/visits/${v.id}/cancel`, { method: 'POST' });
        notify.success(`Visit by ${visitorLabel(v)} cancelled`);
      } catch (e) {
        notify.error(`Could not cancel the visit by ${visitorLabel(v)}`, { description: message(e) });
      }
      onChange();
    });
  return (
    <tr className="enter">
      <td>{visitorLabel(v)}</td>
      <td>{v.purpose}</td>
      <td>{v.expectedDate}</td>
      <td>
        <StateBadge state={v.state} overstayed={v.overstayed} />
        {v.declineReason && <div className="muted small">“{v.declineReason}”</div>}
      </td>
      <td>
        {v.state === 'PRE_REGISTERED' && (
          <Button className="link" onClick={cancel} pending={cancelling.pending !== null} pendingLabel="Cancelling…">
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * A host may be on another tab or scrolled away: put the count in the tab title, and toast each
 * request that arrives after the page loaded (requests already waiting are shown by the card).
 */
function useGateAlerts(requests: Visit[] | null) {
  const seen = useRef<Set<string> | null>(null);
  const count = requests?.length ?? 0;
  useEffect(() => {
    const base = 'School Visitor Management';
    document.title = count ? `(${count}) Visitor at the gate · ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [count]);
  useEffect(() => {
    if (!requests) return;
    if (seen.current) {
      for (const v of requests) {
        if (seen.current.has(v.id)) continue;
        notify.info(`${visitorLabel(v)} is at the gate for you`, {
          id: `gate-${v.id}`,
          description: `${v.purpose}. Confirm or decline at the top of this page.`,
          duration: 10000,
          action: {
            label: 'Show',
            onClick: () =>
              window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
          },
        });
      }
    }
    seen.current = new Set(requests.map((r) => r.id));
  }, [requests]);
}
