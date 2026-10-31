import { NextResponse } from 'next/server';
import { adminHeaders, getSupabaseAdminConfig, supabaseErrorMessage } from '../../../../lib/supabase-admin';

export async function POST(request: Request) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server authentication is not configured. Restart the admin server after setting SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 500 },
    );
  }

  const body = await request.json() as { fullName?: string; email?: string; password?: string };
  const fullName = body.fullName?.trim() ?? '';
  const email = body.email?.trim().toLowerCase() ?? '';
  const password = body.password ?? '';

  if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    return NextResponse.json({ error: 'Enter a valid name, email address, and password of at least 8 characters.' }, { status: 400 });
  }

  const restHeaders = adminHeaders();
  const authHeaders = adminHeaders();

  const adminResponse = await fetch(supabaseUrl + '/rest/v1/admin_users?select=user_id&limit=1', {
    headers: restHeaders,
    cache: 'no-store',
  });
  if (!adminResponse.ok) {
    return NextResponse.json(
      { error: await supabaseErrorMessage(adminResponse, 'Unable to inspect administrator accounts.') },
      { status: 500 },
    );
  }
  const admins = await adminResponse.json() as unknown[];
  if (admins.length) {
    return NextResponse.json({ error: 'An administrator already exists. Ask an existing administrator to approve additional accounts.' }, { status: 403 });
  }

  let userId = '';
  let linkedExistingAuthUser = false;

  const usersResponse = await fetch(supabaseUrl + '/auth/v1/admin/users?per_page=1000', {
    headers: authHeaders,
    cache: 'no-store',
  });
  if (usersResponse.ok) {
    const usersResult = await usersResponse.json() as {
      users?: Array<{ id?: string; email?: string }>;
    };
    userId = usersResult.users?.find((user) => user.email?.trim().toLowerCase() === email)?.id ?? '';
    linkedExistingAuthUser = Boolean(userId);
  }

  if (!userId) {
    const createResponse = await fetch(supabaseUrl + '/auth/v1/admin/users', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      }),
    });
    const result = await createResponse.json() as { id?: string; message?: string; msg?: string };
    if (!createResponse.ok) {
      return NextResponse.json(
        { error: result.message || result.msg || 'Supabase could not create the account.' },
        { status: createResponse.status },
      );
    }
    userId = result.id ?? '';
  }

  if (!userId) {
    return NextResponse.json({ error: 'Supabase returned an account without a user ID.' }, { status: 500 });
  }

  const authorizationResponse = await fetch(supabaseUrl + '/rest/v1/admin_users', {
    method: 'POST',
    headers: { ...restHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, email, full_name: fullName, role: 'admin', is_active: true }),
  });
  if (!authorizationResponse.ok) {
    return NextResponse.json(
      { error: await supabaseErrorMessage(authorizationResponse, 'The Auth account could not be authorized in admin_users.') },
      { status: 500 },
    );
  }

  return NextResponse.json({ created: true, linkedExistingAuthUser });
}
