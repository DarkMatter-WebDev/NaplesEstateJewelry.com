import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';

/**
 * The gate every admin API route starts with.
 *
 * (Until 2026-11-25 it also refused a browser in the buy receipt's "customer
 * input mode"; that mode and its lock cookie were removed — CHANGELOG.md.)
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) };
  }

  return { supabase, user };
}
