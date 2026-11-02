import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { fullName?: string; email?: string; password?: string };
    const fullName = body.fullName?.trim() ?? '';
    const email = body.email?.trim().toLowerCase() ?? '';
    const password = body.password ?? '';

    if (fullName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return NextResponse.json({ error: 'Enter a valid name, email address, and password of at least 8 characters.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'admin' },
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? 'Supabase could not create the account.' }, { status: 400 });
    }

    const { error: adminUserError } = await admin
      .from('admin_users')
      .upsert({
        user_id: data.user.id,
        email,
        full_name: fullName,
        role: 'admin',
        is_active: true,
      });

    if (adminUserError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: adminUserError.message }, { status: 500 });
    }

    return NextResponse.json({ created: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
