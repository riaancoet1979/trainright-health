import type { Env } from './env';
import { corsHeaders, json, error } from './http';
import {
  authenticate,
  handleBootstrap,
  handleListDevices,
  handleRevokeDevice,
} from './auth';
import { handleSyncPush } from './sync';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // ── Public routes ──
    if (route === 'GET /health') return json(request, env, { ok: true });
    if (route === 'POST /v1/auth/bootstrap') return handleBootstrap(request, env);

    // ── Protected routes: resolve the handler first, authenticate second, so an
    //    unknown path returns 404 rather than a misleading 401. ──
    const revokeMatch = url.pathname.match(/^\/v1\/devices\/([0-9a-f-]{36})$/);
    let handler: (() => Promise<Response>) | null = null;

    if (route === 'GET /v1/devices') {
      handler = () => handleListDevices(request, env);
    } else if (request.method === 'DELETE' && revokeMatch) {
      handler = () => handleRevokeDevice(request, env, revokeMatch[1]);
    } else if (route === 'POST /v1/sync/push') {
      handler = () => handleSyncPush(request, env);
    }

    if (!handler) return error(request, env, 404, 'not_found', `No route for ${route}`);

    const device = await authenticate(request, env);
    if (!device) {
      return error(request, env, 401, 'unauthorized', 'Valid device token required.');
    }

    return handler();
  },
} satisfies ExportedHandler<Env>;
