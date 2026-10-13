'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { ErrorText } from '@/components/ui';
import { api } from '@/lib/api';

interface Pass {
  number: string;
  token: string;
  visitorName: string | null;
  hostName: string;
  date: string;
  purpose: string;
}

export default function PassPage() {
  return (
    <Shell need={['visit:checkin', 'visit:view_all']}>
      <PassView />
    </Shell>
  );
}

function PassView() {
  const { id } = useParams<{ id: string }>();
  const [pass, setPass] = useState<Pass | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Pass>(`/visits/${id}/pass`).then(setPass).catch((e) => setError(e.message));
  }, [id]);

  return (
    <>
      <div className="no-print">
        <h1>Visitor pass</h1>
        <ErrorText message={error} />
        <button className="primary" onClick={() => window.print()} disabled={!pass}>
          Print pass
        </button>
      </div>
      {pass && (
        <div className="pass" data-testid="pass">
          <div className="pass-title">VISITOR</div>
          <div className="pass-number" data-testid="pass-number">{pass.number}</div>
          <QRCodeSVG value={pass.token} size={160} />
          <div className="pass-name">{pass.visitorName}</div>
          <div>Visiting: {pass.hostName}</div>
          <div>{pass.date}</div>
          <div className="muted small">Return this pass at the gate when you leave.</div>
        </div>
      )}
    </>
  );
}
