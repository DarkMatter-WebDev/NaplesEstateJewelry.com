-- Admin → Subscribers: "Combine" two entries for the same customer (2026-11-02).
-- Run in the Supabase SQL Editor BEFORE deploying the batch that ships it.
-- If the deploy lands first, editing still works and only Combine answers
-- "run the SQL first". Safe to re-run (create or replace).
--
-- The case: one customer joined by email on one row and by text on another
-- (email-only row + text-only row). Combine keeps ONE row with both:
--   * the email and everything about the email list (subscribed, consent,
--     unsubscribe state, and the unsubscribe_token — so the unsubscribe links
--     in emails already sent keep working) come from whichever row had it;
--   * the mobile number and everything about texts (status — a Confirmed
--     number stays Confirmed, no new "reply YES" — the consent record, the
--     confirmation bookkeeping, the last deal) come from whichever row had it;
--   * the text history (text_deal_sends, text_inbound, text_system_messages)
--     is re-pointed at the kept row;
--   * the other row is deleted.
-- One transaction: either all of that happens or none of it does. That is
-- why this is a database function and not a sequence of API calls — a
-- half-finished combine could otherwise lose the number (the email and the
-- number are unique, so the other row must be deleted before the kept row
-- can take them).
--
-- Refused (an exception, nothing changed) when both rows have an email or
-- both have a number: two different emails / numbers are not "the same
-- customer on two rows", and one would be lost.

create or replace function public.merge_homepage_subscribers(
  keep_id uuid,
  remove_id uuid,
  keep_name text default null
)
returns table (subscriber_id uuid, email text, phone_e164 text, sms_status text, full_name text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  keep_row public.homepage_subscribers%rowtype;
  remove_row public.homepage_subscribers%rowtype;
  email_from public.homepage_subscribers%rowtype;
  phone_from public.homepage_subscribers%rowtype;
begin
  if keep_id is null or remove_id is null or keep_id = remove_id then
    raise exception 'Pick two different entries to combine.';
  end if;

  select * into keep_row from public.homepage_subscribers s where s.id = keep_id for update;
  select * into remove_row from public.homepage_subscribers s where s.id = remove_id for update;
  if keep_row.id is null or remove_row.id is null then
    raise exception 'One of the two entries no longer exists. Reload the page.';
  end if;
  if keep_row.email is not null and remove_row.email is not null then
    raise exception 'Both entries have an email, so they cannot be combined.';
  end if;
  if keep_row.phone_e164 is not null and remove_row.phone_e164 is not null then
    raise exception 'Both entries have a mobile number, so they cannot be combined.';
  end if;

  email_from := case when keep_row.email is not null then keep_row else remove_row end;
  phone_from := case when keep_row.phone_e164 is not null then keep_row else remove_row end;

  update public.text_deal_sends t set subscriber_id = keep_id where t.subscriber_id = remove_id;
  update public.text_inbound t set subscriber_id = keep_id where t.subscriber_id = remove_id;
  update public.text_system_messages t set subscriber_id = keep_id where t.subscriber_id = remove_id;

  -- Frees the unique email / number / unsubscribe token for the kept row.
  delete from public.homepage_subscribers s where s.id = remove_id;

  update public.homepage_subscribers s
  set
    full_name = coalesce(nullif(trim(coalesce(keep_name, '')), ''), keep_row.full_name, remove_row.full_name),
    email = email_from.email,
    subscribed = email_from.subscribed,
    consent_at = email_from.consent_at,
    unsubscribed_at = email_from.unsubscribed_at,
    unsubscribe_token = email_from.unsubscribe_token,
    locale = email_from.locale,
    subscribed_at = least(keep_row.subscribed_at, remove_row.subscribed_at),
    phone_e164 = phone_from.phone_e164,
    sms_status = phone_from.sms_status,
    sms_consent_at = phone_from.sms_consent_at,
    sms_consent_text = phone_from.sms_consent_text,
    sms_consent_version = phone_from.sms_consent_version,
    sms_confirmed_at = phone_from.sms_confirmed_at,
    sms_stopped_at = phone_from.sms_stopped_at,
    sms_confirmation_sent_at = phone_from.sms_confirmation_sent_at,
    sms_confirmation_attempted_at = phone_from.sms_confirmation_attempted_at,
    sms_confirmation_attempts = phone_from.sms_confirmation_attempts,
    sms_last_deal_id = phone_from.sms_last_deal_id,
    updated_at = now()
  where s.id = keep_id
  returning * into keep_row;

  return query select keep_row.id, keep_row.email, keep_row.phone_e164, keep_row.sms_status, keep_row.full_name;
end;
$$;

revoke execute on function public.merge_homepage_subscribers(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.merge_homepage_subscribers(uuid, uuid, text) to service_role;

-- Check: one row, `merge_homepage_subscribers`, security definer = true.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname = 'merge_homepage_subscribers';
