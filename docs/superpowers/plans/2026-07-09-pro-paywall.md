# Pro Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate session creation behind a Pro plan — free users get 1 session, then a paywall modal with a Stripe upgrade link and trust-based Butterbase activation.

**Architecture:** A new `user_plans` Butterbase table stores `is_pro` per user. Auth context exposes `isPro` / `checkPlan()`. Explore page gates `handleSearch` when `sessions.length >= 1 && !isPro`, showing `ProPaywallModal`. After upgrade, `POST /fn/activate-pro` (new Butterbase function) flips the flag, `checkPlan()` refreshes state, and the pending analysis resumes.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS v4, Butterbase REST + functions, `authFetch` (auto-refresh wrapper in `contexts/auth.tsx`), Stripe payment link (external URL via env var).

## Global Constraints

- All user-visible text must be in English
- No new npm packages
- Butterbase app ID: `app_agz6hkqam42m`
- API base: `https://api.butterbase.ai/v1/app_agz6hkqam42m`
- Auth base: `https://api.butterbase.ai/auth/app_agz6hkqam42m`
- Free tier limit: 1 session (gate fires when `sessions.length >= 1`)
- `NEXT_PUBLIC_STRIPE_PRO_LINK` env var provides the Stripe payment link URL

---

## File Map

| File | Change |
|------|--------|
| `frontend/app/contexts/auth.tsx` | Add `isPro: boolean`, `checkPlan()` to context; call on login/signup/restore; reset on logout |
| `frontend/app/explore/page.tsx` | Add `ProPaywallModal` component; add `showPaywall` + `pendingProblem` state; gate in `handleSearch`; wire modal into JSX |
| `frontend/.env.local` | Add `NEXT_PUBLIC_STRIPE_PRO_LINK` |
| Butterbase `user_plans` table | New table via `manage_schema` + `create_user_isolation` RLS |
| Butterbase `activate-pro` function | New function via `deploy_function` |

---

### Task 1: Create `user_plans` table + RLS + deploy `activate-pro` function

**Files:**
- Butterbase schema (no local file — applied via MCP tool)
- Butterbase function (no local file — deployed via MCP tool)

**Interfaces:**
- Produces: `GET /user_plans?user_id=eq.{id}&limit=1` → `[{ user_id, is_pro, activated_at, updated_at }]`
- Produces: `POST /fn/activate-pro` (auth required) → `{ success: true }`

- [ ] **Step 1: Create `user_plans` table**

Call `mcp__butterbase__manage_schema` with:
```json
{
  "app_id": "app_agz6hkqam42m",
  "action": "apply",
  "name": "add_user_plans",
  "schema": {
    "tables": {
      "user_plans": {
        "columns": {
          "user_id":      { "type": "text", "primaryKey": true, "nullable": false },
          "is_pro":       { "type": "boolean", "nullable": false, "default": "false" },
          "activated_at": { "type": "timestamptz", "nullable": true },
          "updated_at":   { "type": "timestamptz", "nullable": false, "default": "now()" }
        }
      }
    }
  }
}
```

Expected: `{ "applied": true }` or `"Schema is up to date"`.

- [ ] **Step 2: Enable RLS with user isolation on `user_plans`**

Call `mcp__butterbase__manage_rls` with:
```json
{
  "app_id": "app_agz6hkqam42m",
  "action": "create_user_isolation",
  "table_name": "user_plans",
  "user_column": "user_id"
}
```

Expected: success response confirming RLS enabled + policy created.

- [ ] **Step 3: Deploy `activate-pro` Butterbase function**

Call `mcp__butterbase__deploy_function` with:
```json
{
  "app_id": "app_agz6hkqam42m",
  "name": "activate-pro",
  "description": "Set is_pro = true for the authenticated user in user_plans",
  "triggers": [{
    "type": "http",
    "config": { "method": "POST", "path": "/activate-pro", "auth": "required" }
  }],
  "code": "export async function handler(request, context) {\n  const cors = {\n    'Access-Control-Allow-Origin': '*',\n    'Access-Control-Allow-Headers': 'Authorization, Content-Type',\n    'Content-Type': 'application/json',\n  };\n  if (request.method === 'OPTIONS') {\n    return new Response(null, { status: 204, headers: cors });\n  }\n  if (!context.user) {\n    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });\n  }\n  await context.db.query(\n    `INSERT INTO user_plans (user_id, is_pro, activated_at, updated_at)\n     VALUES ($1, true, now(), now())\n     ON CONFLICT (user_id) DO UPDATE\n     SET is_pro = true, activated_at = now(), updated_at = now()`,\n    [context.user.id]\n  );\n  return new Response(JSON.stringify({ success: true }), { status: 200, headers: cors });\n}"
}
```

Expected: `{ "status": "deployed", "url": "https://api.butterbase.ai/v1/app_agz6hkqam42m/fn/activate-pro" }`

- [ ] **Step 4: Smoke-test via curl (optional verification)**

```bash
# Should return 401 without auth token
curl -s -X POST https://api.butterbase.ai/v1/app_agz6hkqam42m/fn/activate-pro | cat
```
Expected: `{"error":"Unauthorized"}` or 401 response.

- [ ] **Step 5: Commit**
```bash
git add docs/superpowers/plans/2026-07-09-pro-paywall.md docs/superpowers/specs/2026-07-09-pro-paywall-design.md
git commit -m "feat: add user_plans table and activate-pro function"
```

---

### Task 2: Add `isPro` + `checkPlan()` to auth context

**Files:**
- Modify: `frontend/app/contexts/auth.tsx`

**Interfaces:**
- Consumes: `GET /user_plans?user_id=eq.{id}&limit=1` from Task 1
- Produces: `isPro: boolean`, `checkPlan: () => Promise<void>` on `AuthContextType`

- [ ] **Step 1: Add `isPro` and `checkPlan` to `AuthContextType`**

In `frontend/app/contexts/auth.tsx`, replace the `AuthContextType` definition:

```typescript
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
```

- [ ] **Step 2: Add `isPro` state inside `AuthProvider`**

After the existing `const [loading, setLoading] = useState(true);` line (line 46), add:

```typescript
const [isPro, setIsPro] = useState(false);
```

- [ ] **Step 3: Add `checkPlan` function inside `AuthProvider`**

After the `authFetch` useCallback (after line 160), add:

```typescript
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
```

- [ ] **Step 4: Persist user ID to localStorage so `checkPlan` can read it**

In `applyTokens` (line 48), after `setAccessToken(access);` and before the `/me` fetch, and then after the `setUser(data)` call, add the user ID save. Replace the full `applyTokens` implementation:

```typescript
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
```

- [ ] **Step 5: Call `checkPlan` after session restore**

In the `restore()` function inside `useEffect` (around line 61), call `checkPlan()` after `setUser`. Add it in both success branches:

After `setAccessToken(access); setLoading(false); return;` in the first branch, add `await checkPlan();` before the `return`. And after `await applyTokens(...)` in the refresh branch, add `await checkPlan();`.

Full updated `restore` function:
```typescript
async function restore() {
  const access = localStorage.getItem('bb_access');
  const refresh = localStorage.getItem('bb_refresh');
  if (!access || !refresh) { setLoading(false); return; }

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
```

- [ ] **Step 6: Call `checkPlan` after login**

In the `login` callback (line 97), after `await applyTokens(...)`:
```typescript
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
```

- [ ] **Step 7: Reset `isPro` on logout**

In the `logout` callback (line 162), add `setIsPro(false);` after `setAccessToken(null);` and also clear `bb_user_id`:
```typescript
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
```

- [ ] **Step 8: Expose `isPro` and `checkPlan` in the context value**

Replace the `AuthContext.Provider` value spread (line 176):
```typescript
return (
  <AuthContext.Provider value={{ user, accessToken, loading, isPro, login, signup, logout, authFetch, checkPlan }}>
    {children}
  </AuthContext.Provider>
);
```

- [ ] **Step 9: Verify TypeScript compiles**
```bash
cd /Users/inseon-hwang/Dev/hack-with-bay-3.0/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing errors unrelated to auth.tsx).

- [ ] **Step 10: Commit**
```bash
git add frontend/app/contexts/auth.tsx
git commit -m "feat: add isPro and checkPlan to auth context"
```

---

### Task 3: Add `ProPaywallModal`, gate, and env var to explore page

**Files:**
- Modify: `frontend/app/explore/page.tsx`
- Create: `frontend/.env.local` (if it does not already exist)

**Interfaces:**
- Consumes: `isPro: boolean`, `checkPlan: () => Promise<void>` from Task 2
- Consumes: `POST /fn/activate-pro` from Task 1 (via `authFetch`)

- [ ] **Step 1: Add `NEXT_PUBLIC_STRIPE_PRO_LINK` to `.env.local`**

Check if `frontend/.env.local` exists. If not, create it. Add the line:
```
NEXT_PUBLIC_STRIPE_PRO_LINK=https://buy.stripe.com/your_link_here
```
(Replace with the real Stripe payment link when available. The `#` fallback in the component handles missing values gracefully.)

- [ ] **Step 2: Add `ProPaywallModal` component to `explore/page.tsx`**

Insert the following component **after** the closing `}` of the `AuthModal` component (after line 102, before `// ── MetricPills`):

```typescript
// ── ProPaywallModal ───────────────────────────────────────────────────────────

function ProPaywallModal({ onClose, onActivated }: { onClose: () => void; onActivated: () => Promise<void> }) {
  const { authFetch } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setActivating(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/fn/activate-pro`, { method: 'POST' });
      if (!res.ok) throw new Error('Activation failed. Please try again.');
      await onActivated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md mx-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900">Unlock Pro</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 overflow-hidden mb-6">
          <div className="grid grid-cols-2">
            <div className="px-4 py-3 border-r border-b border-zinc-200 bg-zinc-50">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Free</p>
            </div>
            <div className="px-4 py-3 border-b border-zinc-200 bg-indigo-50">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Pro · $9 / mo</p>
            </div>
            <div className="px-4 py-3 border-r border-zinc-100 text-sm text-zinc-500">1 session</div>
            <div className="px-4 py-3 text-sm text-indigo-700 font-medium">Unlimited sessions</div>
          </div>
        </div>

        <div className="space-y-3">
          <a
            href={process.env.NEXT_PUBLIC_STRIPE_PRO_LINK ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-indigo-600 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Upgrade to Pro →
          </a>
          <button
            onClick={handleActivate}
            disabled={activating}
            className="w-full rounded-lg border border-zinc-200 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {activating ? 'Activating…' : "I've paid, activate my account"}
          </button>
          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add `isPro`, `checkPlan` to the `useAuth()` destructure in `ExploreInner` (line 878)**

Replace:
```typescript
const { user, accessToken, logout, loading, authFetch } = useAuth();
```
With:
```typescript
const { user, accessToken, logout, loading, authFetch, isPro, checkPlan } = useAuth();
```

- [ ] **Step 4: Add `showPaywall` and `pendingProblem` state**

After `const [activeSessionId, setActiveSessionId] = useState<string | null>(null);` (line 891), add:
```typescript
const [showPaywall, setShowPaywall] = useState(false);
const [pendingProblem, setPendingProblem] = useState<string | null>(null);
```

- [ ] **Step 5: Add the Pro gate inside `handleSearch`**

In `handleSearch` (line 937), after `if (!requireAuth()) return;` and before `setStarted(true)`, add:
```typescript
if (sessions.length >= 1 && !isPro) {
  setShowPaywall(true);
  setPendingProblem(problem);
  return;
}
```

Full top of `handleSearch` after change:
```typescript
async function handleSearch(problem: string) {
  if (!requireAuth()) return;
  if (sessions.length >= 1 && !isPro) {
    setShowPaywall(true);
    setPendingProblem(problem);
    return;
  }
  setStarted(true); setCurrentProblem(problem); setSelectedId(null);
  // ... rest unchanged
```

- [ ] **Step 6: Mount `ProPaywallModal` in both JSX return branches**

**Initial screen** (around line 1073): after `{showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}`, add:
```tsx
{showPaywall && (
  <ProPaywallModal
    onClose={() => setShowPaywall(false)}
    onActivated={async () => {
      await checkPlan();
      setShowPaywall(false);
      if (pendingProblem) { void handleSearch(pendingProblem); setPendingProblem(null); }
    }}
  />
)}
```

**Active screen** (around line 1139): after `{showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}`, add the same block:
```tsx
{showPaywall && (
  <ProPaywallModal
    onClose={() => setShowPaywall(false)}
    onActivated={async () => {
      await checkPlan();
      setShowPaywall(false);
      if (pendingProblem) { void handleSearch(pendingProblem); setPendingProblem(null); }
    }}
  />
)}
```

- [ ] **Step 7: Verify TypeScript compiles**
```bash
cd /Users/inseon-hwang/Dev/hack-with-bay-3.0/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 8: Start dev server and manually test the gate**
```bash
cd /Users/inseon-hwang/Dev/hack-with-bay-3.0/frontend && npm run dev
```
Test checklist:
1. Open http://localhost:3000/explore — log in
2. Submit a problem → completes and auto-saves to sessions sidebar
3. Submit a second problem → `ProPaywallModal` appears (not the analysis)
4. Close modal → nothing happens
5. Click "I've paid, activate my account" (while logged in as a test user who isn't pro yet) → should call `/fn/activate-pro` and return success
6. After activation, submit problem again → analysis runs normally
7. Log out → `isPro` resets → log back in → `checkPlan()` re-reads from DB → correct state

- [ ] **Step 9: Commit**
```bash
git add frontend/app/explore/page.tsx frontend/.env.local
git commit -m "feat: add ProPaywallModal and session gate for free tier"
```
