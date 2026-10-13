'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useAuth } from '@/lib/auth';

export default function Home() {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? homeFor(can) : '/login');
  }, [loading, user, can, router]);
  return <p className="muted pad">Loading…</p>;
}
