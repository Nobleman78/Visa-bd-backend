const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''
).trim();

export const hasSupabaseConfig = Boolean(url && key);

function apiHeaders(accessToken?: string) {
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  };
  if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
  return headers;
}

export type AdminSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  };
};

export async function signInAdmin(email: string, password: string): Promise<AdminSession> {
  if (!url || !key) throw new Error('Supabase is not configured.');
  const response = await fetch(url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const message = await apiError(response);
    if (/invalid jwt/i.test(message)) {
      throw new Error('Supabase rejected the API key. Use the publishable key (sb_publishable_...) in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, not a JWT, and restart the admin server.');
    }
    if (/invalid login|invalid credentials/i.test(message)) {
      throw new Error('Invalid email or password. If you registered recently, confirm the email first and ensure email/password sign-in is enabled in Supabase.');
    }
    throw new Error(message);
  }
  const session = await response.json() as AdminSession;
  const userResponse = await fetch(url + '/auth/v1/user', {
    headers: apiHeaders(session.access_token),
  });
  if (!userResponse.ok) throw new Error('Unable to verify the signed-in account.');
  const user = await userResponse.json() as { id: string; email?: string; user_metadata?: { full_name?: string } };
  await fetch(url + '/rest/v1/rpc/bootstrap_first_admin', {
    method: 'POST',
    headers: apiHeaders(session.access_token),
    body: '{}',
  });
  const membership = await fetch(
    url + '/rest/v1/admin_users?select=user_id,email,full_name,role&user_id=eq.' + encodeURIComponent(user.id) + '&is_active=eq.true',
    { headers: apiHeaders(session.access_token) },
  );
  const memberships = await membership.json() as Array<{ user_id: string; email?: string; full_name?: string; role?: string }>;
  if (!membership.ok || !memberships.length) {
    throw new Error('This account is not authorized to access the admin dashboard.');
  }
  const admin = memberships[0];
  session.user = {
    id: user.id,
    email: admin.email || user.email || email,
    full_name: admin.full_name || user.user_metadata?.full_name || 'Administrator',
    role: admin.role || 'admin',
  };
  return session;
}

export async function createAdminAccount(fullName: string, email: string, password: string) {
  const response = await fetch('/api/admin/create-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName, email, password }),
  });
  const result = await response.json() as { message?: string; error?: string; created?: boolean; linkedExistingAuthUser?: boolean };
  if (!response.ok) {
    throw new Error(result.error || result.message || 'Unable to create the admin account.');
  }
  return {
    created: Boolean(result.created),
    linkedExistingAuthUser: Boolean(result.linkedExistingAuthUser),
    session: null,
    needsConfirmation: false,
  };
}

export function authenticatedHeaders(accessToken: string) {
  return apiHeaders(accessToken);
}

async function apiError(response: Response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { message?: string; msg?: string; error_description?: string; error?: string };
    return body.message || body.msg || body.error_description || body.error || text || 'Supabase request failed.';
  } catch {
    return text || 'Supabase request failed.';
  }
}

export async function fetchFromSupabase<T>(table: string, query = '', accessToken?: string): Promise<T[]> {
  if (!url || !key) return [];
  const response = await fetch(url + '/rest/v1/' + table + query, {
    headers: apiHeaders(accessToken),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await apiError(response));
  return response.json();
}

export async function saveToSupabase(table: string, data: unknown, accessToken?: string): Promise<Record<string, unknown>> {
  if (!url || !key) throw new Error('Supabase is not configured.');
  const response = await fetch(url + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...apiHeaders(accessToken), Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await apiError(response));
  const rows = await response.json() as Record<string, unknown>[];
  return rows[0] ?? {};
}

export async function updateSupabase(table: string, id: string | number, data: unknown, accessToken?: string) {
  if (!url || !key) throw new Error('Supabase is not configured.');
  const response = await fetch(url + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(String(id)), {
    method: 'PATCH',
    headers: { ...apiHeaders(accessToken), Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(await apiError(response));
}

export async function deleteFromSupabase(table: string, id: string | number, accessToken?: string) {
  if (!url || !key) throw new Error('Supabase is not configured.');
  const response = await fetch(url + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(String(id)), {
    method: 'DELETE',
    headers: apiHeaders(accessToken),
  });
  if (!response.ok) throw new Error(await apiError(response));
}
