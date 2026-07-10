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
  isPro: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  checkPlan: () => Promise<void>;
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
  const [isPro, setIsPro] = useState(false);

  const applyTokens = useCallback(async (access: string, refresh: string) => {
    saveTokens(access, refresh);
    setAccessToken(access);
    const res = await fetch(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUser(data);
      localStorage.setItem('bb_user_id', data.id);
    }
  }, []);

  const checkPlan = useCallback(async () => {
    const access = localStorage.getItem('bb_access');
    const stored = localStorage.getItem('bb_user_id');
    if (!access || !stored) { setIsPro(false); return; }
    const res = await fetch(`${API_BASE}/user_plans?user_id=eq.${stored}&limit=1`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (res.ok) {
      const rows: { is_pro: boolean }[] = await res.json();
      setIsPro(rows[0]?.is_pro === true);
    } else {
      setIsPro(false);
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
        const data = await meRes.json();
        setUser(data);
        localStorage.setItem('bb_user_id', data.id);
        setAccessToken(access);
        await checkPlan();
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
        await checkPlan();
      } else {
        clearTokens();
      }
      setLoading(false);
    }
    restore();
  }, [applyTokens, checkPlan]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? data.error ?? 'Login failed');
    await applyTokens(data.access_token, data.refresh_token);
    await checkPlan();
  }, [applyTokens, checkPlan]);

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

  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const makeRequest = (token: string) => fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });

    const access = localStorage.getItem('bb_access') ?? '';
    let res = await makeRequest(access);

    if (res.status !== 401) return res;

    // Token expired — try refresh
    const refresh = localStorage.getItem('bb_refresh');
    if (!refresh) {
      clearTokens();
      setUser(null);
      setIsPro(false);
      setAccessToken(null);
      return res;
    }

    const refreshRes = await fetch(`${AUTH_BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });

    if (!refreshRes.ok) {
      clearTokens();
      setUser(null);
      setIsPro(false);
      setAccessToken(null);
      return res;
    }

    const data = await refreshRes.json();
    saveTokens(data.access_token, data.refresh_token);
    setAccessToken(data.access_token);

    // Retry with new token
    res = await makeRequest(data.access_token);
    return res;
  }, []);

  const logout = useCallback(async () => {
    const access = localStorage.getItem('bb_access');
    if (access) {
      await fetch(`${AUTH_BASE}/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}` },
      }).catch(() => {});
    }
    clearTokens();
    localStorage.removeItem('bb_user_id');
    setUser(null);
    setAccessToken(null);
    setIsPro(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, isPro, login, signup, logout, authFetch, checkPlan }}>
      {children}
    </AuthContext.Provider>
  );
}
