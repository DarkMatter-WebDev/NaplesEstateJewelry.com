-- Enables "Buyers" as a selectable audience in the admin Email Campaigns
-- composer, alongside the existing Newsletter/Accounts options.
-- Depends on supabase/buyers-2026-07.sql having already been run.
-- Run in Supabase SQL Editor.

-- Buyers have no newsletter-signup or account row to record an unsubscribe
-- on if they only ever appear here from a purchase — without their own
-- opt-out flag, a "Buyers" campaign could re-email someone who already
-- unsubscribed through a channel that has nowhere else to persist it for a
-- buyer-only email address.
alter table public.buyers add column if not exists marketing_opt_out boolean not null default false;

-- buildMarketingAudience() defaults to a service-role client when no caller
-- override is supplied (matches the defensive grant homepage_subscribers
-- already has for service_role); the admin composer's own routes pass the
-- signed-in admin session instead, already covered by the `authenticated`
-- grant added in buyers-2026-07.sql. The public /api/unsubscribe route's
-- suppressMarketingEmail() always uses the service-role client, so this
-- grant is required for a buyer-only unsubscribe to actually stick.
grant select, insert, update, delete on public.buyers to service_role;

-- Re-defines the buyer-upsert trigger (from buyers-2026-07.sql) to also
-- carry forward any existing opt-out already recorded for this email in
-- homepage_subscribers/profiles — so someone who unsubscribed before ever
-- buying anything doesn't get silently re-added to a mailable list the
-- first time they place an order. An existing buyer row's marketing_opt_out
-- is left untouched by later orders (opting back in is a separate, explicit
-- action, never a side effect of buying again).
create or replace function public.upsert_buyer_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  already_opted_out boolean;
begin
  if new.payment_status is distinct from 'paid' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.payment_status = 'paid' then
      return new;
    end if;
  end if;

  if new.customer_email is null or trim(new.customer_email) = '' then
    return new;
  end if;

  normalized_email := lower(trim(new.customer_email));

  already_opted_out := exists (
    select 1 from public.homepage_subscribers hs
    where lower(hs.email) = normalized_email and (hs.subscribed = false or hs.unsubscribed_at is not null)
  ) or exists (
    select 1 from public.profiles p
    where lower(p.email) = normalized_email and p.marketing_opt_out = true
  );

  insert into public.buyers (
    email, name, phone, user_id,
    order_count, total_spent, first_order_at, last_order_at,
    marketing_opt_out
  )
  values (
    normalized_email,
    nullif(trim(coalesce(new.customer_name, '')), ''),
    nullif(trim(coalesce(new.customer_phone, '')), ''),
    new.user_id,
    1,
    coalesce(new.total, 0),
    coalesce(new.created_at, now()),
    now(),
    already_opted_out
  )
  on conflict (email) do update
  set
    name = coalesce(nullif(trim(coalesce(new.customer_name, '')), ''), public.buyers.name),
    phone = coalesce(nullif(trim(coalesce(new.customer_phone, '')), ''), public.buyers.phone),
    user_id = coalesce(new.user_id, public.buyers.user_id),
    order_count = public.buyers.order_count + 1,
    total_spent = public.buyers.total_spent + coalesce(new.total, 0),
    last_order_at = now(),
    updated_at = now();

  return new;
exception
  when others then
    raise warning 'upsert_buyer_from_order failed for order %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- Allow the new 'buyers' value in the campaign audience-scope check
-- (originally: check (audience_scope in ('subscribers', 'accounts', 'all'))
-- in email-marketing.sql).
alter table public.email_campaigns drop constraint if exists email_campaigns_audience_scope_check;
alter table public.email_campaigns add constraint email_campaigns_audience_scope_check
  check (audience_scope in ('subscribers', 'accounts', 'buyers', 'all'));
