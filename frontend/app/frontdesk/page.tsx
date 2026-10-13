'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ErrorText, StateBadge } from '@/components/ui';
import { api, ApiError, Visit } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePolling } from '@/lib/hooks';
import { fmtTime, visitorLabel } from '@/lib/util';

export default function FrontDeskPage() {
  return (
    <Shell need={['visit:checkin']}>
      <FrontDesk />
    </Shell>
  );
}

interface OnCampus {
  count: number;
  overstayedCount: number;
  visits: Visit[];
}

function FrontDesk() {
  const { can } = useAuth();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ text: string; visitId?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expected = usePolling(() => api<Visit[]>(`/visits/expected?q=${encodeURIComponent(query)}`));
  const awaiting = usePolling(() => api<Visit[]>('/visits/awaiting'));
  const outcomes = usePolling(() => api<Visit[]>('/visits/outcomes'));
  const campus = usePolling(() =>
    can('visit:view_all') ? api<OnCampus>('/visits/on-campus') : Promise.resolve(null),
  );

  const refresh = () => {
    expected.reload();
    awaiting.reload();
    outcomes.reload();
    campus.reload();
  };

  async function checkIn(v: Visit) {
    setError(null);
    try {
      const res = await api<Visit>(`/visits/${v.id}/check-in`, { method: 'POST' });
      setNotice({ text: `${visitorLabel(res)} checked in. Pass ${res.pass?.number} issued.`, visitId: res.id });
    } catch (e) {
      setError((e as Error).message);
    }
    refresh();
  }

  async function checkOut(code: string) {
    setError(null);
    try {
      const res = await api<Visit>('/visits/check-out', { body: { code } });
      setNotice({ text: `${visitorLabel(res)} checked out. Pass is no longer valid.` });
    } catch (e) {
      setError((e as Error).message);
    }
    refresh();
  }

  return (
    <>
      <h1>Front desk</h1>
      {notice && (
        <p className="ok" role="status" data-testid="notice">
          {notice.text}{' '}
          {notice.visitId && (
            <Link href={`/pass/${notice.visitId}`} target="_blank">
              Print pass
            </Link>
          )}
        </p>
      )}
      <ErrorText message={error} />

      <div className="cols">
        <div>
          <WalkIn onRegistered={refresh} setNotice={setNotice} />
          <section className="card" data-testid="awaiting">
            <h2>Waiting for the host</h2>
            {(awaiting.data ?? []).length === 0 && <p className="muted">Nobody is waiting.</p>}
            {(awaiting.data ?? []).map((v) => (
              <div className="row" key={v.id} data-testid="awaiting-row">
                <span>
                  <strong>{visitorLabel(v)}</strong> → {v.hostName}
                  <span className="muted"> · since {fmtTime(v.registeredAt)}</span>
                </span>
                <StateBadge state={v.state} />
              </div>
            ))}
            {(outcomes.data ?? []).map((v) => (
              <div className="row" key={v.id} data-testid="outcome-row">
                <span>
                  <strong>{visitorLabel(v)}</strong> → {v.hostName}
                  <span className="muted">
                    {' '}
                    ·{' '}
                    {v.state === 'DECLINED'
                      ? `declined${v.declineReason ? `: “${v.declineReason}”` : ''}. Do not admit.`
                      : 'no response. Do not admit; register again to retry.'}
                  </span>
                </span>
                <StateBadge state={v.state} />
              </div>
            ))}
          </section>
        </div>

        <div>
          <section className="card">
            <h2>Expected today</h2>
            <input
              placeholder="Search visitor or host name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search expected visitors"
              data-testid="search"
            />
            <div data-testid="expected">
              {(expected.data ?? []).length === 0 && <p className="muted">No expected visitors match.</p>}
              {(expected.data ?? []).map((v) => (
                <div className="row" key={v.id} data-testid="expected-row">
                  <span>
                    <strong>{visitorLabel(v)}</strong> → {v.hostName}
                    <span className="muted">
                      {' '}
                      · {v.purpose}
                      {v.windowStart ? ` · ${v.windowStart}${v.windowEnd ? '–' + v.windowEnd : ''}` : ''}
                    </span>
                  </span>
                  <button className="primary" onClick={() => checkIn(v)}>
                    Check in
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Check out</h2>
            <CheckOutBox onCheckOut={checkOut} />
          </section>
        </div>
      </div>

      {campus.data && (
        <section className="card" data-testid="on-campus">
          <h2>
            On campus now: <span data-testid="campus-count">{campus.data.count}</span>
            {campus.data.overstayedCount > 0 && (
              <span className="badge overstay"> {campus.data.overstayedCount} overstayed</span>
            )}
          </h2>
          {campus.data.visits.length === 0 ? (
            <p className="muted">No visitors on campus.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Pass</th>
                  <th>Visitor</th>
                  <th>Host</th>
                  <th>In</th>
                  <th>Expected out</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campus.data.visits.map((v) => (
                  <tr key={v.id} data-testid="campus-row">
                    <td>{v.pass?.number}</td>
                    <td>
                      {visitorLabel(v)} {v.overstayed && <StateBadge state={v.state} overstayed />}
                    </td>
                    <td>{v.hostName}</td>
                    <td>{fmtTime(v.checkedInAt)}</td>
                    <td>{fmtTime(v.expectedEndAt)}</td>
                    <td className="actions">
                      <Link href={`/pass/${v.id}`} target="_blank" className="link">
                        Pass
                      </Link>
                      {can('visit:checkout') && v.pass && (
                        <button onClick={() => checkOut(v.pass!.number)}>Check out</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}

function CheckOutBox({ onCheckOut }: { onCheckOut: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onCheckOut(code.trim());
        setCode('');
      }}
    >
      <input
        placeholder="Pass number (e.g. V-0001) or scanned code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        aria-label="Pass number"
        data-testid="checkout-code"
      />
      <button className="primary" data-testid="checkout-submit">
        Check out
      </button>
    </form>
  );
}

function WalkIn({
  onRegistered,
  setNotice,
}: {
  onRegistered: () => void;
  setNotice: (n: { text: string } | null) => void;
}) {
  const hosts = usePolling(() => api<{ id: string; name: string }[]>('/hosts'), 60_000);
  const empty = { visitorName: '', visitorContact: '', purpose: '', hostId: '' };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  async function submit(e: FormEvent, confirmDuplicate = false) {
    e.preventDefault();
    setError(null);
    try {
      await api('/visits/walk-in', {
        body: {
          visitorName: f.visitorName,
          visitorContact: f.visitorContact || null,
          purpose: f.purpose,
          hostId: f.hostId,
          confirmDuplicate,
        },
      });
      setNotice({ text: `Request sent to the host for ${f.visitorName}. Ask the visitor to wait.` });
      setF(empty);
      setDuplicate(false);
      onRegistered();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_WARNING') setDuplicate(true);
      setError((err as Error).message);
    }
  }

  return (
    <section className="card">
      <h2>Walk-in visitor</h2>
      <form onSubmit={(e) => submit(e)} className="grid" data-testid="walkin-form">
        <label>
          Visitor name
          <input
            value={f.visitorName}
            onChange={(e) => {
              setF({ ...f, visitorName: e.target.value });
              setDuplicate(false);
            }}
            required
          />
        </label>
        <label>
          Who are they here to see?
          <select value={f.hostId} onChange={(e) => setF({ ...f, hostId: e.target.value })} required>
            <option value="">Choose employee…</option>
            {(hosts.data ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Purpose of visit
          <input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} required maxLength={200} />
        </label>
        <label>
          Mobile (optional)
          <input value={f.visitorContact} onChange={(e) => setF({ ...f, visitorContact: e.target.value })} placeholder="0917 000 0000" />
        </label>
        <div className="actions">
          <button className="primary" data-testid="walkin-submit">
            Notify host
          </button>
          {duplicate && (
            <button type="button" onClick={(e) => submit(e as unknown as FormEvent, true)} data-testid="walkin-confirm-duplicate">
              Different person: register anyway
            </button>
          )}
        </div>
      </form>
      <p className="muted small">
        Tell the visitor: their name and contact are used only for this visit and are anonymised after one year.
      </p>
      <ErrorText message={error} />
    </section>
  );
}
