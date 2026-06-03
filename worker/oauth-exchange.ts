// oauth-exchange.ts — GitHub OAuth code->token exchange for rjayasin.github.io
//
// Deployed separately on Cloudflare Workers (NOT part of the GitHub Pages
// site). It holds the GitHub App's client secret and performs the one OAuth
// step that must not happen in the browser: trading the short-lived `code`
// from the authorize redirect for a user-to-server access token. The site
// (common.js -> Common.GH) POSTs `{ code }` here and stores the returned
// token in the visitor's own browser. See worker/README.md to deploy.

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

const ORIGIN = 'https://rjayasin.github.io';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors: Record<string, string> = {
      'Access-Control-Allow-Origin': ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    const body = (await request.json().catch(() => ({}))) as { code?: string };
    if (!body.code) return json({ error: 'missing code' }, 400, cors);

    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: body.code,
      }),
    });

    const data = (await r.json()) as GitHubTokenResponse;
    if (data.error || !data.access_token) {
      return json({ error: data.error_description || data.error || 'exchange failed' }, 400, cors);
    }

    return json({ access_token: data.access_token }, 200, cors);
  },
} satisfies ExportedHandler<Env>;

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
