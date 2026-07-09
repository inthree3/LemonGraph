import { requireAuth } from '../_auth';

const BUTTERBASE = 'https://api.butterbase.ai/v1/app_agz6hkqam42m';

export async function POST(request: Request) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  const body = await request.json();

  const res = await fetch(`${BUTTERBASE}/fn/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
