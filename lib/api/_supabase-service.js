const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export async function supabaseRequest(path, options = {}) {
  if (!supabaseReady()) {
    return { ok: false, status: 500, data: null, text: "", error: "Supabase server credentials chưa được cấu hình." };
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
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
