'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useConnection } from '@/lib/hooks';
import { notify } from '@/lib/notify';

/** Wraps every signed-in page: redirects to login and shows only the navigation the user may use. */
export function Shell({ children, need }: { children: React.ReactNode; need?: string[] }) {
  const { user, loading, can, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const connection = useConnection();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Session expired mid-use (spec section 5): leave the page instead of showing stale visitor data
  useEffect(() => {
    if (connection !== 'signed-out' || !user) return;
    notify.info('Your session has ended. Please sign in again.', { id: 'session-ended' });
    void logout();
  }, [connection, user, logout]);

  if (loading || !user) return <p className="muted pad">Loading…</p>;

  const links = [
    can('visit:preregister', 'visit:host') && { href: '/employee', label: 'My visitors' },
    can('visit:checkin') && { href: '/frontdesk', label: 'Front desk' },
    can('visit:view_all', 'audit:view', 'user:manage', 'role:manage', 'messages:view') && {
      href: '/admin',
      label: 'Admin',
    },
  ].filter(Boolean) as { href: string; label: string }[];

  const allowed = !need || can(...need);

  return (
    <>
      <header className="topbar no-print">
        <strong>School Visitor Management</strong>
        <nav>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? 'active' : ''}>
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted" data-testid="whoami">
          {user.name} · {user.role}
        </span>
        <button className="link" onClick={() => logout().then(() => router.replace('/login'))}>
          Sign out
        </button>
      </header>
      {connection === 'offline' && (
        <div className="banner no-print" role="status" data-testid="offline">
          <span className="spinner" aria-hidden="true" /> Cannot reach the server. Showing the last known
          information; retrying every few seconds.
        </div>
      )}
      <main className="page">
        {allowed ? children : <p className="error" role="alert" data-testid="error">You do not have access to this page.</p>}
      </main>
    </>
  );
}
