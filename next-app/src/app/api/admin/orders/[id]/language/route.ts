import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { isOrderId } from '@/lib/order-pickup';
import { ORDER_LANGUAGES, type OrderLanguage } from '@/lib/order-language';
import { saveOrderLanguage } from '@/lib/order-language-server';

type Context = { params: Promise<{ id: string }> };

/**
 * The order page's Language switch (2026-11-21, Spanish receipts): sets which
 * language the customer's emails and printouts use from now on. Emails
 * already sent stay as they were sent.
 */
export async function POST(req: Request, context: Context) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { id } = await context.params;
  if (!isOrderId(id)) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { language?: unknown };
  if (!ORDER_LANGUAGES.includes(body.language as OrderLanguage)) {
    return NextResponse.json({ error: 'Pick English or Español.' }, { status: 400 });
  }
  const language = body.language as OrderLanguage;
  const saved = await saveOrderLanguage(admin.supabase, id, language);
  if (!saved) {
    return NextResponse.json(
      { error: 'Could not save the language. Has supabase/order-customer-language-2026-11.sql been run?' },
      { status: 500 },
    );
  }
  return NextResponse.json({ language });
}
