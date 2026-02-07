/**
 * Cloudflare Pages Function — Gemini API Proxy
 *
 * Keeps the API key server-side. Uses Cloudflare KV for persistent rate limiting.
 * Falls back to in-memory if KV is not bound.
 */

interface Env {
  GEMINI_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace; // Optional: bind a KV namespace for persistent rate limiting
}

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 3600;

// In-memory fallback (resets on worker restart, but Workers are long-lived on edge)
const memoryRateLimit = new Map<string, { count: number; resetTime: number }>();

async function checkRateLimit(ip: string, kv?: KVNamespace): Promise<{ allowed: boolean; remaining: number }> {
  const now = Math.floor(Date.now() / 1000);

  if (kv) {
    // Persistent KV-based rate limiting
    const key = `rl:${ip}`;
    const raw = await kv.get(key);
    let record = raw ? JSON.parse(raw) : { count: 0, resetTime: now + RATE_WINDOW_SECONDS };

    if (now > record.resetTime) {
      record = { count: 0, resetTime: now + RATE_WINDOW_SECONDS };
    }

    record.count++;
    const ttl = Math.max(record.resetTime - now, 60);
    await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });

    return { allowed: record.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - record.count) };
  }

  // In-memory fallback
  const nowMs = Date.now();
  let record = memoryRateLimit.get(ip);
  if (!record || nowMs > record.resetTime) {
    record = { count: 0, resetTime: nowMs + RATE_WINDOW_SECONDS * 1000 };
  }
  record.count++;
  memoryRateLimit.set(ip, record);
  return { allowed: record.count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - record.count) };
}

// Reject non-POST methods explicitly (prevents SPA fallback for GET, PUT, etc.)
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return Response.json(
      { error: `Method ${context.request.method} not allowed. Use POST.` },
      { status: 405, headers: { 'Allow': 'POST' } }
    );
  }
  return handlePost(context);
};

const handlePost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'Server API key not configured' }, { status: 500 });
  }

  // Rate limit by IP
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const { allowed, remaining } = await checkRateLimit(ip, env.RATE_LIMIT_KV);

  if (!allowed) {
    return Response.json(
      { error: `Rate limit exceeded (${RATE_LIMIT}/hour). Please use your own API key.` },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  // Parse request
  let body: { image?: string; prompt?: string; model?: string; config?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { image, prompt, model, config } = body;
  if (!image || !prompt || !model) {
    return Response.json({ error: 'Missing required fields: image, prompt, model' }, { status: 400 });
  }

  if (typeof image === 'string' && image.length > 2_000_000) {
    return Response.json({ error: 'Image too large (max ~1.5MB)' }, { status: 400 });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const reqBody: Record<string, unknown> = {
      contents: [{
        parts: [
          { inlineData: { mimeType: 'image/png', data: image } },
          { text: prompt },
        ],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        ...(config?.temperature !== undefined && { temperature: config.temperature }),
      },
    };

    if (config?.thinkingConfig) {
      (reqBody.generationConfig as Record<string, unknown>).thinkingConfig = config.thinkingConfig;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: `Gemini API error: ${errorText}` }, { status: response.status });
    }

    const data: Record<string, unknown> = await response.json();
    const candidates = data?.candidates as Array<{ content: { parts: Array<{ text: string }> } }> | undefined;
    const text = candidates?.[0]?.content?.parts?.[0]?.text || '';

    return Response.json({ text }, {
      headers: { 'X-RateLimit-Remaining': String(remaining) }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
};
