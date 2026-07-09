const AUTH_BASE = 'https://api.butterbase.ai/auth/app_agz6hkqam42m';

export async function requireAuth(request: Request): Promise<Response | null> {
  const token = request.headers.get('Authorization');
  if (!token?.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${AUTH_BASE}/me`, {
    headers: { Authorization: token },
  });

  if (!res.ok) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null; // authenticated
}
