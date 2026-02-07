/**
 * Vercel Serverless Function — Gemini API Proxy
 *
 * Keeps the API key server-side (never exposed to the browser).
 * Includes IP-based rate limiting to prevent abuse.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// --- Rate Limiting ---
// In-memory store (resets on cold start, which is fine for demo-level protection)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30;           // max requests per window
const RATE_WINDOW_MS = 3600000;  // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_WINDOW_MS };
  }

  record.count++;
  rateLimitMap.set(ip, record);

  return {
    allowed: record.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - record.count),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get API key from environment
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key not configured' });
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const { allowed, remaining } = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (!allowed) {
    return res.status(429).json({
      error: `Rate limit exceeded (${RATE_LIMIT}/hour). Please use your own API key.`,
    });
  }

  // Validate request body
  const { image, prompt, model, config } = req.body || {};

  if (!image || !prompt || !model) {
    return res.status(400).json({ error: 'Missing required fields: image, prompt, model' });
  }

  // Limit image size (base64 string, ~1.3x raw size)
  if (typeof image === 'string' && image.length > 2_000_000) {
    return res.status(400).json({ error: 'Image too large (max ~1.5MB)' });
  }

  try {
    // Call Gemini API directly via REST (avoids bundling the SDK in the serverless function)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: Record<string, unknown> = {
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

    // Handle thinking config
    if (config?.thinkingConfig) {
      (body.generationConfig as Record<string, unknown>).thinkingConfig = config.thinkingConfig;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `Gemini API error: ${errorText}` });
    }

    const data = await response.json();

    // Extract text from response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
