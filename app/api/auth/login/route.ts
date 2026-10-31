import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json() as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (!data.user.email_confirmed_at && !data.user.confirmed_at) {
      return NextResponse.json({ error: 'Please verify your email address before signing in.' }, { status: 403 });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('user_id, role, is_active')
      .eq('user_id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (adminError || !adminUser) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: 'This account is not authorized to access the admin dashboard.' }, { status: 403 });
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        role: adminUser.role,
      },
      session: data.session,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
