import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { buildMarketingAudience, countByLanguage, type AudienceScope } from '@/lib/marketing';

function normalizeScope(value: unknown): AudienceScope {
  return value === 'subscribers' || value === 'accounts' || value === 'buyers' || value === 'all' ? value : 'all';
}

export async function POST(req: Request) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const scope = normalizeScope(body?.scope);

  try {
    const recipients = await buildMarketingAudience(scope, supabase);
    // "38 English · 3 Español" (2026-11-22).
    const split = countByLanguage(recipients);
    return NextResponse.json({ count: recipients.length, scope, english: split.en, spanish: split.es });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build marketing audience.' },
      { status: 500 }
    );
  }
}
