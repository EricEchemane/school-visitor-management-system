'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

/** Wraps every signed-in page: redirects to login and shows only the navigation the user may use. */
export function Shell({ children, need }: { children: React.ReactNode; need?: string[] }) {
  const { user, loading, can, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

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
      <main className="page">
        {allowed ? children : <p className="error" role="alert" data-testid="error">You do not have access to this page.</p>}
      </main>
    </>
  );
}
