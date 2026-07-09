import { requireAuth } from '../_auth';

const BUTTERBASE = 'https://api.butterbase.ai/v1/app_agz6hkqam42m';

export async function POST(request: Request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const { problem } = await request.json();
  if (!problem?.trim()) {
    return Response.json({ error: 'problem is required' }, { status: 400 });
  }

  const res = await fetch(`${BUTTERBASE}/fn/transform-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
