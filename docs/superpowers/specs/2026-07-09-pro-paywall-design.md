# Pro Paywall + Butterbase Billing Integration

**Date:** 2026-07-09  
**Status:** Approved

## Overview

Gate session creation behind a Pro plan. Free users get 1 session. Attempting to create a second triggers a paywall modal. Pro status is stored in a Butterbase `user_plans` table. Upgrade is handled via a Stripe payment link; activation is trust-based via a Butterbase function.

---

## Architecture

```
User submits a new problem
         ↓
sessions.length >= 1?
    ↓ yes
isPro? (from user_plans table)
    ↓ no
ProPaywallModal appears
    ├── "Upgrade to Pro →" → opens Stripe payment link in new tab
    └── "I've paid, activate my account" → POST /fn/activate-pro
              ↓
        user_plans.is_pro = true
              ↓
        modal closes, analysis resumes
```

The gate runs before any API calls (decompose, transform, search). No LLM or Semantic Scholar calls happen until the check passes.

---

## Butterbase Schema

### New table: `user_plans`

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | text PK | matches Butterbase auth user id |
| `is_pro` | boolean | default `false` |
| `activated_at` | timestamptz | set when `is_pro` flips to `true` |
| `updated_at` | timestamptz | `now()` on upsert |

**RLS:** users can only SELECT/UPDATE their own row (`user_id = auth.uid()`).  
**Row creation:** lazily on first plan check — if no row exists, treat as free.

---

## Butterbase Function: `activate-pro`

**Endpoint:** `POST /fn/activate-pro`  
**Auth:** requires valid Butterbase access token (reads user_id from token server-side)  
**Body:** none  
**Logic:** upserts `user_plans` row with `{ is_pro: true, activated_at: now() }`  
**Response:** `{ success: true }`  
**Verification:** trust-based (no Stripe webhook) — appropriate for hackathon scope

---

## Frontend Changes

### `contexts/auth.tsx`

- Add `isPro: boolean` to `AuthContextType` (default `false`)
- Add `checkPlan(): Promise<void>` — fetches `GET /user_plans?user_id=eq.{user.id}&limit=1`, sets `isPro` from result
- Call `checkPlan()` automatically after login, signup, and session restore
- Export `isPro` and `checkPlan` from context

### `explore/page.tsx` — Gate logic

In `handleSearch` (currently line 937), add before any API calls:

```ts
if (sessions.length >= 1 && !isPro) {
  setShowPaywall(true);
  setPendingProblem(problem); // store so we can resume after upgrade
  return;
}
```

Add state: `showPaywall: boolean`, `pendingProblem: string | null`.

After successful Pro activation: close modal, call `handleSearch(pendingProblem)`.

### `explore/page.tsx` — `ProPaywallModal` component

Props: `{ onClose, onActivated }`

Layout:
- Header: "Unlock Pro" with close button
- Plan comparison table: Free (1 session) vs Pro (unlimited sessions)
- Price badge: **$9 / month**
- Primary button: "Upgrade to Pro →" — `window.open(process.env.NEXT_PUBLIC_STRIPE_PRO_LINK, '_blank')`
- Secondary button: "I've paid, activate my account" — calls `POST /fn/activate-pro` via `authFetch`, then calls `checkPlan()`, then `onActivated()`
- Loading state on the activation button while the request is in flight
- Error display if activation fails

### Environment variable

```
NEXT_PUBLIC_STRIPE_PRO_LINK=<Stripe payment link URL>
```

Add to `.env.local` and Vercel environment variables.

---

## Data Flow (full sequence)

1. User fills textarea and submits a new problem
2. `handleSearch` checks `sessions.length >= 1 && !isPro`
3. If blocked: show `ProPaywallModal`, store `pendingProblem`, return early
4. User clicks "Upgrade to Pro" → Stripe payment link opens in new tab
5. User completes payment on Stripe
6. User returns to app, clicks "I've paid, activate my account"
7. Frontend calls `POST /fn/activate-pro` with auth token
8. Butterbase function upserts `user_plans.is_pro = true`
9. Frontend calls `checkPlan()` → `isPro` becomes `true`
10. `onActivated()` fires: modal closes, `handleSearch(pendingProblem)` runs
11. Analysis proceeds normally

---

## Out of Scope

- Stripe webhook handler (no server-side payment verification)
- Subscription cancellation / downgrade flow
- Trial periods or session count resets
- Per-user billing portal (manage subscription from within the app)
- Storing Stripe customer ID in Butterbase
