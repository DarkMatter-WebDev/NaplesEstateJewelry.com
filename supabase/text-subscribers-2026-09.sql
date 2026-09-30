-- Text-alert sign-ups on the homepage "Join the List" window (2026-09-15).
-- Run in the Supabase SQL Editor BEFORE deploying the batch that ships the
-- window: the new /api/subscribe calls subscribe_homepage_v2 below, and the
-- Admin → Subscribers page reads the new columns.
--
-- What changes on public.homepage_subscribers:
--   * email becomes OPTIONAL — a visitor may join with a phone number only.
--     The unique index on email still holds for the rows that have one.
--   * phone_e164          the cell number as +1 and ten digits, unique.
--   * sms_status          'pending' until the visitor replies YES to the
--                         confirmation text (sent by a later batch), then
--                         'confirmed'; 'stopped' after a STOP reply.
--   * sms_consent_at      when the box was ticked.
--   * sms_consent_text    the exact statement shown when it was ticked — the
--                         record of consent; never rewrite it on old rows.
--   * sms_consent_version the wording version (lib/subscriber-phone.ts).
--   * sms_confirmed_at / sms_stopped_at   set by the texting batch.
-- Nothing here sends a text. Until the texting batch is live every phone row
-- simply sits at 'pending' and nobody is messaged.

alter table public.homepage_subscribers
  alter column email drop not null;

alter table public.homepage_subscribers
  add column if not exists phone_e164 text,
  add column if not exists sms_status text,
  add column if not exists sms_consent_at timestamptz,
  add column if not exists sms_consent_text text,
  add column if not exists sms_consent_version integer,
  add column if not exists sms_confirmed_at timestamptz,
  add column if not exists sms_stopped_at timestamptz;

-- A row must be reachable somehow: an email, a phone, or both.
alter table public.homepage_subscribers
  drop constraint if exists homepage_subscribers_contact_check;
alter table public.homepage_subscribers
  add constraint homepage_subscribers_contact_check
  check (email is not null or phone_e164 is not null);

alter table public.homepage_subscribers
  drop constraint if exists homepage_subscribers_phone_e164_check;
alter table public.homepage_subscribers
  add constraint homepage_subscribers_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');

alter table public.homepage_subscribers
  drop constraint if exists homepage_subscribers_sms_status_check;
alter table public.homepage_subscribers
  add constraint homepage_subscribers_sms_status_check
  check (sms_status is null or sms_status in ('pending', 'confirmed', 'stopped'));

create unique index if not exists homepage_subscribers_phone_e164_idx
  on public.homepage_subscribers (phone_e164)
  where phone_e164 is not null;

comment on column public.homepage_subscribers.sms_consent_text is
  'The consent statement the visitor saw when ticking the text box. The record of consent: never rewritten.';

-- One sign-up, any channel. Replaces subscribe_homepage for the website; the
-- old function is left in place for anything else that still calls it.
--
-- Matching: an existing row is found by email first, then by phone. A row that
-- was phone-only and now signs up with an email gains the email; a row that
-- was email-only gains the phone. If the phone already belongs to a DIFFERENT
-- row (a household number under another email), that row keeps it and this
-- one is saved without it — the number is on the list either way, and a
-- unique phone is what the texting batch relies on.
--
-- Text consent: a fresh tick always records consent_at / consent_text /
-- version. The status stays 'confirmed' only when the row was already
-- confirmed on the SAME number; any other case (new number, was pending, was
-- stopped) goes to 'pending' so the confirmation text is (re)sent later.
create or replace function public.subscribe_homepage_v2(
  subscriber_email text default null,
  subscriber_name text default null,
  subscriber_locale text default 'en',
  subscriber_phone text default null,
  subscriber_sms_consent boolean default false,
  subscriber_sms_consent_text text default null,
  subscriber_sms_consent_version integer default null,
  subscriber_source text default 'homepage_hero'
)
returns table (subscriber_id uuid, phone_saved boolean, sms_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_phone text;
  trimmed_name text;
  target public.homepage_subscribers%rowtype;
  phone_owner_id uuid;
  wants_phone boolean;
  next_status text;
  did_save_phone boolean := false;
begin
  normalized_email := nullif(lower(trim(coalesce(subscriber_email, ''))), '');
  normalized_phone := nullif(trim(coalesce(subscriber_phone, '')), '');
  trimmed_name := nullif(trim(coalesce(subscriber_name, '')), '');

  if normalized_email is not null and normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid email address is required.';
  end if;
  if normalized_phone is not null and normalized_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'A valid US mobile number is required.';
  end if;
  if normalized_email is null and normalized_phone is null then
    raise exception 'An email address or a mobile number is required.';
  end if;

  wants_phone := normalized_phone is not null and coalesce(subscriber_sms_consent, false);
  if normalized_phone is not null and not wants_phone then
    raise exception 'Text alerts need the consent box ticked.';
  end if;

  -- Find the row this sign-up belongs to: by email, else by phone.
  if normalized_email is not null then
    select * into target from public.homepage_subscribers where email = normalized_email;
  end if;
  if target.id is null and normalized_phone is not null then
    select * into target from public.homepage_subscribers where phone_e164 = normalized_phone;
  end if;

  -- Does some OTHER row already own this phone?
  if wants_phone then
    select id into phone_owner_id from public.homepage_subscribers
      where phone_e164 = normalized_phone and (target.id is null or id <> target.id);
    if phone_owner_id is not null then
      wants_phone := false;
    end if;
  end if;

  if wants_phone then
    if target.id is not null and target.phone_e164 = normalized_phone and target.sms_status = 'confirmed' then
      next_status := 'confirmed';
    else
      next_status := 'pending';
    end if;
    did_save_phone := true;
  end if;

  if target.id is null then
    insert into public.homepage_subscribers (
      email, full_name, source, locale, subscribed, subscribed_at, consent_at, unsubscribed_at, updated_at,
      phone_e164, sms_status, sms_consent_at, sms_consent_text, sms_consent_version, sms_stopped_at
    )
    values (
      normalized_email,
      trimmed_name,
      coalesce(nullif(trim(subscriber_source), ''), 'homepage_hero'),
      case when subscriber_locale = 'es' then 'es' else 'en' end,
      true,
      now(),
      case when normalized_email is not null then now() else null end,
      null,
      now(),
      case when wants_phone then normalized_phone else null end,
      case when wants_phone then next_status else null end,
      case when wants_phone then now() else null end,
      case when wants_phone then subscriber_sms_consent_text else null end,
      case when wants_phone then subscriber_sms_consent_version else null end,
      null
    )
    returning * into target;
  else
    update public.homepage_subscribers s
    set
      email = coalesce(s.email, normalized_email),
      full_name = coalesce(trimmed_name, s.full_name),
      locale = case when subscriber_locale = 'es' then 'es' else 'en' end,
      source = coalesce(nullif(trim(subscriber_source), ''), s.source),
      -- An email sign-up (re)activates the email list; a phone-only sign-up
      -- leaves an earlier email unsubscribe alone.
      subscribed = case when normalized_email is not null then true else s.subscribed end,
      consent_at = case when normalized_email is not null then coalesce(s.consent_at, now()) else s.consent_at end,
      unsubscribed_at = case when normalized_email is not null then null else s.unsubscribed_at end,
      phone_e164 = case when wants_phone then normalized_phone else s.phone_e164 end,
      sms_status = case when wants_phone then next_status else s.sms_status end,
      sms_consent_at = case when wants_phone then now() else s.sms_consent_at end,
      sms_consent_text = case when wants_phone then subscriber_sms_consent_text else s.sms_consent_text end,
      sms_consent_version = case when wants_phone then subscriber_sms_consent_version else s.sms_consent_version end,
      sms_stopped_at = case when wants_phone then null else s.sms_stopped_at end,
      updated_at = now()
    where s.id = target.id
    returning * into target;
  end if;

  return query select target.id, did_save_phone, target.sms_status;
end;
$$;

revoke execute on function public.subscribe_homepage_v2(text, text, text, text, boolean, text, integer, text) from public, anon, authenticated;
grant execute on function public.subscribe_homepage_v2(text, text, text, text, boolean, text, integer, text) to service_role;

-- The old email-only function must not insert a row that the new constraint
-- rejects; it never could (email was required), so it needs no change.
