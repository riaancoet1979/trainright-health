import type { Env } from './env';
import { corsHeaders, json, error } from './http';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, env, { ok: true });
    }

    return error(request, env, 404, 'not_found', `No route for ${request.method} ${url.pathname}`);
  },
} satisfies ExportedHandler<Env>;
