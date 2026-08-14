import type { Env } from './env';

export const corsHeaders = (request: Request, env: Env): Record<string, string> => {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

export const json = (
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });

export const error = (
  request: Request,
  env: Env,
  status: number,
  code: string,
  message: string,
): Response => json(request, env, { error: { code, message } }, status);
