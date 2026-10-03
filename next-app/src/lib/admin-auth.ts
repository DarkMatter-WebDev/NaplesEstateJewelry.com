import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import { CUSTOMER_MODE_COOKIE } from '@/lib/customer-mode-lock';

/**
 * The gate every admin API route starts with.
 *
 * A browser in the buy receipt's customer input mode is refused even though it
 * is signed in as an admin (see `lib/customer-mode-lock.ts`): a seller holding
 * the tablet must not be able to read the back end by typing an API address.
 * `duringCustomerMode` is for the two calls that start and end that mode — no
 * other route may pass it.
 */
export async function requireAdmin(options: { duringCustomerMode?: boolean } = {}) {
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

  if (!options.duringCustomerMode && (await cookies()).has(CUSTOMER_MODE_COOKIE)) {
    return {
      error: NextResponse.json(
        { error: 'This device is in customer input mode. Open Buy Receipts and enter the staff code to unlock it.' },
        { status: 423 },
      ),
    };
  }

  return { supabase, user };
}
