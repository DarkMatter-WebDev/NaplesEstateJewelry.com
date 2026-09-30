-- Add per-product and per-image frame padding preferences.
-- Values:
--   none  = existing site image frame color
--   white = white frame behind contained product images
--   black = black frame behind contained product images
--   #rrggbb = custom frame color
--
-- image_padding is the product-level fallback.
-- image_padding_by_image stores optional per-image overrides keyed by image URL.

alter table public.products
  add column if not exists image_padding text not null default 'none',
  add column if not exists image_padding_by_image jsonb not null default '{}'::jsonb;

update public.products
set image_padding = 'none'
where image_padding is null
   or not (
    image_padding in ('none', 'white', 'black')
    or image_padding ~* '^#[0-9a-f]{6}$'
   );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'products_image_padding_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products drop constraint products_image_padding_check;
  end if;

  alter table public.products
    add constraint products_image_padding_check
    check (
      image_padding in ('none', 'white', 'black')
      or image_padding ~* '^#[0-9a-f]{6}$'
    );
end $$;

update public.products
set image_padding_by_image = '{}'::jsonb
where image_padding_by_image is null
   or jsonb_typeof(image_padding_by_image) <> 'object';
