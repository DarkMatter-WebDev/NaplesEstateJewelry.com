import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getVerifiedUser } from '@/lib/auth-claims';
import { savedCertificateForUser, savedCertificateView } from '@/lib/tax-exempt-server';

/**
 * The signed-in customer's saved tax-exempt certificate (owner, 2026-10-27:
 * "allow customers to save tax ID status in their account for future
 * purchases and make sure they can see that in their account").
 *
 * GET → `{ signedIn, certificate }` — checkout uses it to apply the saved
 *   certificate and to offer the "Save to my account" box.
 * DELETE → "Remove from my account": unlinks every certificate saved to this
 *   account. The store keeps its own record (the law expects it to); the
 *   customer simply stops getting it applied at checkout.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getVerifiedUser(await createClient()).catch(() => null);
  if (!user) return NextResponse.json({ signedIn: false, certificate: null });
  const row = await savedCertificateForUser(createServiceClient(), user.id);
  return NextResponse.json({ signedIn: true, certificate: row ? savedCertificateView(row) : null });
}

export async function DELETE() {
  const user = await getVerifiedUser(await createClient()).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  const { error } = await createServiceClient()
    .from('tax_exempt_certificates')
    .update({ user_id: null })
    .eq('user_id', user.id);
  if (error) {
    console.error('[tax-exempt] unlink failed', error.message);
    return NextResponse.json({ error: 'Could not remove it. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
