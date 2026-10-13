'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Shell } from '@/components/Shell';
import { Button, ErrorText, Loading, StateBadge } from '@/components/ui';
import { api, ApiError, Visit } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePending, usePolling } from '@/lib/hooks';
import { message, notify } from '@/lib/notify';
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
  const [checkOutCode, setCheckOutCode] = useState('');
  const [checkOutError, setCheckOutError] = useState<string | null>(null);
  // keys: `in:<visitId>`, `out:<pass>:box` or `out:<pass>:row`, so each button knows if it is the busy one
  const busy = usePending<string>();
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    label: string;
    run: () => Promise<void>;
  } | null>(null);

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

  useHostDecisionToasts(awaiting.data, outcomes.data, campus.data);

  const checkIn = (v: Visit) =>
    setConfirm({
      title: 'Check in this visitor?',
      message: `Check in ${visitorLabel(v)} to see ${v.hostName}. A visitor pass will be issued.`,
      label: 'Check in',
      run: () => runCheckIn(v),
    });

  // from: 'box' when typed into the check-out form (its error stays next to the form), else a row button
  const checkOut = (code: string, who?: string, from: 'box' | 'row' = 'row') =>
    setConfirm({
      title: 'Check out this visitor?',
      message: `${who ? `Check out ${who} (pass ${code})` : `Check out pass ${code}`}. The pass will stop working.`,
      label: 'Check out',
      run: () => runCheckOut(code, from),
    });

  const runCheckIn = (v: Visit) =>
    busy.run(`in:${v.id}`, async () => {
      const id = notify.loading(`Checking in ${visitorLabel(v)}…`);
      try {
        const res = await api<Visit>(`/visits/${v.id}/check-in`, { method: 'POST' });
        notify.success(`${visitorLabel(res)} checked in`, {
          id,
          description: `Pass ${res.pass?.number} issued.`,
          duration: 10000,
          action: { label: 'Print pass', onClick: () => window.open(`/pass/${res.id}`, '_blank') },
        });
      } catch (e) {
        notify.error(`Could not check in ${visitorLabel(v)}`, { id, description: message(e) });
      }
      refresh();
    });

  const runCheckOut = (code: string, from: 'box' | 'row') =>
    busy.run(`out:${code}:${from}`, async () => {
      setCheckOutError(null);
      const id = notify.loading(`Checking out pass ${code}…`);
      try {
        const res = await api<Visit>('/visits/check-out', { body: { code } });
        notify.success(`${visitorLabel(res)} checked out`, { id, description: 'The pass is no longer valid.' });
        if (from === 'box') setCheckOutCode('');
      } catch (e) {
        if (from === 'box') {
          notify.dismiss(id);
          setCheckOutError(message(e));
        } else {
          notify.error(`Could not check out pass ${code}`, { id, description: message(e) });
        }
      }
      refresh();
    });

  return (
    <>
      <h1>Front desk</h1>

      <div className="cols">
        <div>
          <WalkIn onRegistered={refresh} />
          <section className="card" data-testid="awaiting">
            <h2>Waiting for the host</h2>
            {awaiting.data === null ? (
              <Loading what="requests" />
            ) : (
              awaiting.data.length === 0 && (outcomes.data ?? []).length === 0 && <p className="muted">Nobody is waiting.</p>
            )}
            {(awaiting.data ?? []).map((v) => (
              <div className="row enter" key={v.id} data-testid="awaiting-row">
                <span>
                  <strong>{visitorLabel(v)}</strong> → {v.hostName}
                  <span className="muted"> · since {fmtTime(v.registeredAt)}</span>
                </span>
                <span className="badge s-AWAITING_HOST waiting">
                  <span className="pulse-dot" aria-hidden="true" /> Waiting for host
                </span>
              </div>
            ))}
            {(outcomes.data ?? []).map((v) => (
              <div className="row enter" key={v.id} data-testid="outcome-row">
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
              {expected.data === null ? (
                <Loading what="expected visitors" />
              ) : (
                expected.data.length === 0 && (
                  <p className="muted">{query ? 'No expected visitors match.' : 'No more visitors expected today.'}</p>
                )
              )}
              {(expected.data ?? []).map((v) => (
                <div className="row enter" key={v.id} data-testid="expected-row">
                  <span>
                    <strong>{visitorLabel(v)}</strong> → {v.hostName}
                    <span className="muted">
                      {' '}
                      · {v.purpose}
                      {v.windowStart ? ` · ${v.windowStart}${v.windowEnd ? '–' + v.windowEnd : ''}` : ''}
                    </span>
                  </span>
                  <Button className="primary" onClick={() => checkIn(v)} pending={busy.pending === `in:${v.id}`} disabled={!!busy.pending}>
                    Check in
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Check out</h2>
            <CheckOutBox
              code={checkOutCode}
              onChange={(c) => {
                setCheckOutCode(c);
                setCheckOutError(null);
              }}
              onCheckOut={(code) => checkOut(code, undefined, 'box')}
              pending={!!busy.pending?.endsWith(':box')}
            />
            <ErrorText message={checkOutError} />
          </section>
        </div>
      </div>

      {can('visit:view_all') && !campus.data && (
        <section className="card">
          <h2>On campus now</h2>
          <Loading what="visitors on campus" />
        </section>
      )}
      {campus.data && (
        <section className="card" data-testid="on-campus">
          <h2>
            On campus now: <span data-testid="campus-count">{campus.data.count}</span>
            {campus.data.overstayedCount > 0 && (
              <span className="badge overstay">{campus.data.overstayedCount} overstayed</span>
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
                  <tr key={v.id} className="enter" data-testid="campus-row">
                    <td>{v.pass?.number}</td>
                    <td>
                      {visitorLabel(v)} {v.overstayed && <StateBadge state={v.state} overstayed />}
                    </td>
                    <td>{v.hostName}</td>
                    <td>{fmtTime(v.checkedInAt)}</td>
                    <td>{fmtTime(v.expectedEndAt)}</td>
                    <td>
                      <div className="cell-actions">
                        <Link href={`/pass/${v.id}`} target="_blank" className="link">
                          Pass
                        </Link>
                        {can('visit:checkout') && v.pass && (
                          <Button
                            onClick={() => checkOut(v.pass!.number, visitorLabel(v))}
                            pending={busy.pending === `out:${v.pass.number}:row`}
                            disabled={!!busy.pending}
                          >
                            Check out
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label ?? 'Confirm'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null); // close first so a double click cannot run it twice
          void action?.run();
        }}
      />
    </>
  );
}

function CheckOutBox({
  code,
  onChange,
  onCheckOut,
  pending,
}: {
  code: string;
  onChange: (code: string) => void;
  onCheckOut: (code: string) => void;
  pending: boolean;
}) {
  return (
    <form
      className="inline"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onCheckOut(code.trim());
      }}
    >
      <input
        placeholder="Pass number (e.g. V-0001) or scanned code"
        value={code}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pass number"
        data-testid="checkout-code"
      />
      <Button className="primary" data-testid="checkout-submit" pending={pending}>
        Check out
      </Button>
    </form>
  );
}

function WalkIn({ onRegistered }: { onRegistered: () => void }) {
  const hosts = usePolling(() => api<{ id: string; name: string }[]>('/hosts'), 60_000);
  const empty = { visitorName: '', visitorContact: '', purpose: '', hostId: '' };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const sending = usePending();

  const submit = (e: FormEvent, confirmDuplicate = false) => {
    e.preventDefault();
    return sending.run(true, () => send(confirmDuplicate));
  };

  async function send(confirmDuplicate: boolean) {
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
      const host = (hosts.data ?? []).find((h) => h.id === f.hostId)?.name ?? 'the host';
      notify.success(`Request sent to ${host}`, {
        description: `Ask ${f.visitorName.trim()} to wait. You will be told here when ${host} answers.`,
      });
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
          <Button className="primary" data-testid="walkin-submit" pending={sending.pending !== null} pendingLabel="Notifying…">
            Notify host
          </Button>
          {duplicate && (
            <Button
              type="button"
              onClick={(e) => submit(e as unknown as FormEvent, true)}
              disabled={sending.pending !== null}
              data-testid="walkin-confirm-duplicate"
            >
              Different person: register anyway
            </Button>
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

/**
 * Tells the guard, without them watching the list, when a host answers a walk-in or the request
 * times out. Polls run independently, so a visit that left "awaiting" is remembered until it
 * shows up on campus or among the outcomes.
 */
function useHostDecisionToasts(awaiting: Visit[] | null, outcomes: Visit[] | null, campus: OnCampus | null) {
  const watched = useRef(new Map<string, Visit>());
  useEffect(() => {
    if (!awaiting) return;
    for (const v of awaiting) watched.current.set(v.id, v);
    const stillWaiting = new Set(awaiting.map((v) => v.id));
    for (const [id, v] of watched.current) {
      if (stillWaiting.has(id)) continue;
      const admitted = campus?.visits.find((c) => c.id === id);
      const outcome = outcomes?.find((o) => o.id === id);
      if (admitted) {
        notify.success(`${v.hostName} confirmed ${visitorLabel(v)}`, {
          id: `decision-${id}`,
          description: `Pass ${admitted.pass?.number ?? ''} issued. The visitor may enter.`,
          duration: 10000,
          action: { label: 'Print pass', onClick: () => window.open(`/pass/${id}`, '_blank') },
        });
      } else if (outcome?.state === 'DECLINED') {
        notify.warning(`${v.hostName} declined ${visitorLabel(v)}. Do not admit.`, {
          id: `decision-${id}`,
          description: outcome.declineReason ? `Reason: “${outcome.declineReason}”` : undefined,
        });
      } else if (outcome?.state === 'EXPIRED') {
        notify.warning(`No answer from ${v.hostName} for ${visitorLabel(v)}`, {
          id: `decision-${id}`,
          description: 'Do not admit. Register again to retry, or choose another host.',
        });
      } else {
        continue; // not visible in the other lists yet: check again on the next poll
      }
      watched.current.delete(id);
    }
  }, [awaiting, outcomes, campus]);
}
