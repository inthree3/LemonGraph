const BUTTERBASE = 'https://api.butterbase.ai/v1/app_agz6hkqam42m';

export async function POST(request: Request) {
  const { query } = await request.json();
  if (!query?.trim()) {
    return Response.json({ error: 'query is required' }, { status: 400 });
  }

  const res = await fetch(`${BUTTERBASE}/fn/search-papers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
