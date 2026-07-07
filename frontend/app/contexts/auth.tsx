'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const AUTH_BASE = 'https://api.butterbase.ai/auth/app_agz6hkqam42m';
export const API_BASE = 'https://api.butterbase.ai/v1/app_agz6hkqam42m';

export type User = {
  id: string;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

type AuthContextType = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function saveTokens(access: string, refresh: string) {
  localStorage.setItem('bb_access', access);
  localStorage.setItem('bb_refresh', refresh);
}

function clearTokens() {
  localStorage.removeItem('bb_access');
  localStorage.removeItem('bb_refresh');
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyTokens = useCallback(async (access: string, refresh: string) => {
    saveTokens(access, refresh);
    setAccessToken(access);
    const res = await fetch(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    async function restore() {
      const access = localStorage.getItem('bb_access');
      const refresh = localStorage.getItem('bb_refresh');
      if (!access || !refresh) { setLoading(false); return; }

      // Try existing access token
      const meRes = await fetch(`${AUTH_BASE}/me`, {
        headers: { Authorization: `Bearer ${access}` },
      });

      if (meRes.ok) {
        setUser(await meRes.json());
        setAccessToken(access);
        setLoading(false);
        return;
      }

      // Try refresh
      const refreshRes = await fetch(`${AUTH_BASE}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        await applyTokens(data.access_token, data.refresh_token);
      } else {
        clearTokens();
      }
      setLoading(false);
    }
    restore();
  }, [applyTokens]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? data.error ?? 'Login failed');
    await applyTokens(data.access_token, data.refresh_token);
  }, [applyTokens]);

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await fetch(`${AUTH_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? data.error ?? 'Signup failed');
    // Auto-login after signup
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    const access = localStorage.getItem('bb_access');
    if (access) {
      await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => {});
    }
    clearTokens();
    setUser(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
