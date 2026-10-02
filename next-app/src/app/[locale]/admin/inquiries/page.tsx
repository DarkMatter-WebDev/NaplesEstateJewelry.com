import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getVerifiedUser } from '@/lib/auth-claims';
import InquiriesPanel from '@/components/admin/InquiriesPanel';
import AdminHeader from '@/components/admin/AdminHeader';
import type { Inquiry } from '@/components/admin/InquiriesPanel';

export const metadata: Metadata = { title: 'Admin — Inquiries' };

interface Props {
  params: Promise<{ locale: string }>;
}

const INQUIRY_LIST_COLUMNS = [
  'id',
  'item_title',
  'name',
  'phone',
  'email',
  'message',
  'status',
  'created_at',
];
const INQUIRY_LIST_SELECT = INQUIRY_LIST_COLUMNS.join(', ');
const INQUIRY_LIST_SELECT_WITH_IMAGES = [...INQUIRY_LIST_COLUMNS, 'uploaded_image_urls'].join(', ');
// 2026-09-08: location + preferred contact (supabase/inquiries-location-contact-2026-09.sql).
const INQUIRY_LIST_SELECT_FULL = [
  ...INQUIRY_LIST_COLUMNS,
  'uploaded_image_urls',
  'location_area',
  'location_detail',
  'preferred_contact',
].join(', ');
// 2026-10-02: the Google Ads click a lead arrived with (supabase/inquiries-ad-click-2026-10.sql).
const INQUIRY_LIST_SELECT_WITH_AD_CLICK = `${INQUIRY_LIST_SELECT_FULL}, gclid, gbraid, wbraid`;
// Newest columns first; each step drops the columns of one migration.
const INQUIRY_LIST_SELECTS = [
  INQUIRY_LIST_SELECT_WITH_AD_CLICK,
  INQUIRY_LIST_SELECT_FULL,
  INQUIRY_LIST_SELECT_WITH_IMAGES,
  INQUIRY_LIST_SELECT,
];

export default async function AdminInquiriesPage({ params }: Props) {
  const { locale } = await params;
  const adminBasePath = locale === 'es' ? '/es/admin' : '/admin';

  const supabase = await createClient();
  const user = await getVerifiedUser(supabase);

  if (!user) {
    redirect(locale === 'es' ? '/es/account/sign-in' : '/account/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    redirect(locale === 'es' ? '/es/account' : '/account');
  }

  // Prefer the newest select (photos, the 2026-09-08 preference columns, the
  // 2026-10 ad-click columns); fall back step by step if a migration has not
  // been applied yet (inquiries-ad-click-2026-10.sql, then
  // inquiries-location-contact-2026-09.sql, then sales-workflow.sql).
  const listInquiries = (select: string) =>
    supabase.from('inquiries').select(select).order('created_at', { ascending: false });
  const [newest, { count: unreadMessagesCount }] = await Promise.all([
    listInquiries(INQUIRY_LIST_SELECTS[0]),
    supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
  ]);
  let inquiries = newest.data;
  if (newest.error) {
    for (const select of INQUIRY_LIST_SELECTS.slice(1)) {
      const attempt = await listInquiries(select);
      inquiries = attempt.data;
      if (!attempt.error) break;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #fafaf8)' }}>
      <AdminHeader
        adminBasePath={adminBasePath}
        active="messages"
        unreadMessagesCount={unreadMessagesCount ?? 0}
        userEmail={user.email}
      />

      <InquiriesPanel inquiries={(inquiries ?? []) as unknown as Inquiry[]} />
    </div>
  );
}
