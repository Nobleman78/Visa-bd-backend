import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminConfig, adminHeaders } from '../../../../lib/supabase-admin';

export async function GET(request: NextRequest) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseAdminConfig();
  const path = request.nextUrl.searchParams.get('path');
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Admin Supabase credentials are not configured.' }, { status: 500 });
  }
  const normalizedPath = path?.replace(/^\/+/, '') || '';
  if (!normalizedPath || normalizedPath.includes('..') || normalizedPath.includes('\\')) {
    return NextResponse.json({ error: 'Invalid document path.' }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/submission-documents`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ expiresIn: 3600, paths: [normalizedPath] }),
  });
  const result = await response.json() as {
    signedURL?: string;
    signedUrl?: string;
    signedURLs?: string[];
    signedUrls?: string[];
    signed_urls?: string[];
    error?: string;
    message?: string;
  } | Array<{ signedURL?: string | null; error?: string | null }>;
  const payload = Array.isArray(result) ? result[0] : result;
  if (!response.ok) return NextResponse.json({ error: payload?.message || payload?.error || 'Could not open document.' }, { status: response.status });
  const signedPath = Array.isArray(result)
    ? result[0]?.signedURL
    : result.signedURL || result.signedUrl || result.signedURLs?.[0] || result.signedUrls?.[0] || result.signed_urls?.[0];
  if (!signedPath) return NextResponse.json({ error: 'Signed document URL was not returned.' }, { status: 502 });
  return NextResponse.json({ url: signedPath.startsWith('http') ? signedPath : `${supabaseUrl}/storage/v1${signedPath}` });
}
