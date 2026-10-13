'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, User } from './api';
import { resetConnection } from './hooks';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api<User>('/auth/login', { body: { email, password } }));
    resetConnection();
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
  }, []);

  const can = useCallback(
    (...permissions: string[]) => !!user && permissions.some((p) => user.permissions.includes(p)),
    [user],
  );

  return <Ctx.Provider value={{ user, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export function homeFor(can: (...p: string[]) => boolean): string {
  if (can('visit:checkin')) return '/frontdesk';
  if (can('visit:preregister', 'visit:host')) return '/employee';
  if (can('visit:view_all', 'audit:view', 'user:manage', 'role:manage')) return '/admin';
  return '/employee';
}
