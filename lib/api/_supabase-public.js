const SUPABASE_URL = String(
  process.env.SUPABASE_URL || "https://mlqaeginqsgqacdqdzbm.supabase.co"
).trim();

// Publishable key is intentionally public and already used by the browser client.
// Never put SUPABASE_SERVICE_ROLE_KEY in this helper or any client-facing code.
const SUPABASE_KEY = String(
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_3YeUDTX-15GB95pP5d4M8g_ulPQczdi4M8g_ulPQczdi4M8g_ulPQczdi"
).trim();

export function supabasePublicReady() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export async function supabasePublicRequest(path, options = {}) {
  if (!supabasePublicReady()) {
    return { ok: false, status: 500, data: null, text: "", error: "Supabase public credentials chưa được cấu hình." };
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      signal: options.signal || AbortSignal.timeout(8000),
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, data, text, headers: r.headers };
  } catch {
    return { ok: false, status: 502, data: null, text: "", error: "Supabase request failed." };
  }
}
