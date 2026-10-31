const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''
).trim();
const serviceRoleKey = (
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''
).trim();

export function getSupabaseAdminConfig() {
  return { supabaseUrl, serviceRoleKey };
}

export function adminHeaders() {
  const opaqueSecretKey = serviceRoleKey.startsWith('sb_secret_');

  return {
    apikey: opaqueSecretKey ? serviceRoleKey : publishableKey || serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'visabd-admin/1.0',
  };
}

export async function supabaseErrorMessage(response: Response, fallback: string) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as {
      message?: string;
      msg?: string;
      error_description?: string;
      error?: string;
      hint?: string;
      details?: string;
      code?: string;
    };
    const message = body.message || body.msg || body.error_description || body.error || text || fallback;

    if (/could not find the table|schema cache|does not exist|PGRST205|42P01/i.test(message + text)) {
      return 'The admin_users table is missing. Run supabase/schema.sql in the Supabase SQL editor, then try again.';
    }
    if (/invalid api key/i.test(message + text)) {
      return 'Supabase rejected the configured server key. Copy the current secret key from Supabase Dashboard > Project Settings > API Keys, then restart the admin server.';
    }
    if (/unauthorized|401/i.test(message + text) || response.status === 401) {
      return 'Supabase rejected the server secret key. Confirm SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY and restart the admin server.';
    }
    return [message, body.hint, body.details].filter(Boolean).join(' ');
  } catch {
    return text || fallback;
  }
}
