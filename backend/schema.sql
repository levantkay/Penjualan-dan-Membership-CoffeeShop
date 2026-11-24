-- ============================================================
-- BREW & BENEFITS | Coffee Shop Sales + Membership System
-- 4 core entities: members, products, sales, sale_items
-- Target DB: Supabase PostgreSQL
-- ============================================================

create extension if not exists pgcrypto;

-- 1) MEMBERS
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  membership_number varchar(20) unique not null,
  joined_at date not null default current_date,
  status varchar(10) not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  paid_through date,
  membership_payments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(membership_payments) = 'array'),
  created_at timestamptz not null default now()
);

-- 2) PRODUCTS
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku varchar(30) unique not null,
  name varchar(100) not null,
  category varchar(30) not null,
  price numeric(12,2) not null check (price >= 0),
  image_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products add column if not exists image_path text;

-- 3) SALES
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_no varchar(30) unique not null,
  sold_at timestamptz not null default now(),
  member_id uuid references public.members(id) on delete set null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method varchar(20) not null
    check (payment_method in ('CASH','QRIS','DEBIT','EWALLET')),
  created_at timestamptz not null default now()
);

-- 4) SALE ITEMS
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  qty integer not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create index if not exists idx_sales_sold_at on public.sales(sold_at);
create index if not exists idx_sales_member_id on public.sales(member_id);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);

-- Computed membership view. No extra table/entity is created.
-- Tenure-based benefits:
-- < 3 months      => Bronze, 5%
-- 3 to < 6 months => Silver, 10%
-- >= 6 months     => Gold, 15%
create or replace view public.v_membership as
select
  m.id,
  m.membership_number,
  m.joined_at,
  m.status,
  greatest(0, (extract(year from age(current_date, m.joined_at))::int * 12)
      + extract(month from age(current_date, m.joined_at))::int) as tenure_months,
  case
    when age(current_date, m.joined_at) < interval '3 months' then 'BRONZE'
    when age(current_date, m.joined_at) < interval '6 months' then 'SILVER'
    else 'GOLD'
  end as tier,
  case
    when age(current_date, m.joined_at) < interval '3 months' then 5
    when age(current_date, m.joined_at) < interval '6 months' then 10
    else 15
  end as discount_pct
from public.members m;

-- RLS for classroom/demo use. In production, tighten these policies behind login roles.
alter table public.members enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

-- Drop existing demo policies so this script can be re-run safely.
drop policy if exists "demo members read" on public.members;
drop policy if exists "demo members insert" on public.members;
drop policy if exists "demo products read" on public.products;
drop policy if exists "demo products insert" on public.products;
drop policy if exists "demo sales read" on public.sales;
drop policy if exists "demo sales insert" on public.sales;
drop policy if exists "demo sale_items read" on public.sale_items;
drop policy if exists "demo sale_items insert" on public.sale_items;

create policy "demo members read" on public.members for select using (true);
create policy "demo members insert" on public.members for insert with check (true);
create policy "demo products read" on public.products for select using (true);
create policy "demo products insert" on public.products for insert with check (true);
create policy "demo sales read" on public.sales for select using (true);
create policy "demo sales insert" on public.sales for insert with check (true);
create policy "demo sale_items read" on public.sale_items for select using (true);
create policy "demo sale_items insert" on public.sale_items for insert with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images insert" on storage.objects;
drop policy if exists "product images delete" on storage.objects;
create policy "product images insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'product-images');
create policy "product images delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "demo membership view read" on public.v_membership;
-- Views don't support direct RLS. Access follows the underlying tables.

-- ------------------------------------------------------------
-- SEED DATA (safe to run after first setup; uses conflict guards)
-- ------------------------------------------------------------
insert into public.products (sku, name, category, price, image_path)
values
  ('CF-001', 'Cloud Latte', 'Coffee', 28000, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=480&q=85'),
  ('CF-002', 'Brown Sugar Oat', 'Coffee', 32000, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=480&q=85'),
  ('CF-003', 'Americano', 'Coffee', 22000, 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=480&q=85'),
  ('CF-004', 'Matcha Cream', 'Non-Coffee', 30000, 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=480&q=85'),
  ('FD-001', 'Butter Croissant', 'Pastry', 24000, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=480&q=85'),
  ('FD-002', 'Cinnamon Roll', 'Pastry', 26000, 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&w=480&q=85')
on conflict (sku) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price;

insert into public.members (membership_number, joined_at, status)
values
  ('BRW-0001', current_date - interval '14 months', 'ACTIVE'),
  ('BRW-0002', current_date - interval '8 months', 'ACTIVE'),
  ('BRW-0003', current_date - interval '5 months', 'ACTIVE'),
  ('BRW-0004', current_date - interval '2 months', 'ACTIVE'),
  ('BRW-0005', current_date - interval '1 month', 'ACTIVE'),
  ('BRW-0006', current_date - interval '9 months', 'INACTIVE')
on conflict (membership_number) do update set
  joined_at = excluded.joined_at,
  status = excluded.status;

-- Example transactions are intentionally omitted because totals and item lines
-- should normally be produced by the POS workflow.
-- Membership billing and status workflow.
-- Run this after schema.sql in the Supabase SQL Editor.

alter table public.members
  add column if not exists paid_through date;

alter table public.members
  add column if not exists membership_payments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(membership_payments) = 'array');

alter table public.sales
  add column if not exists transaction_type varchar(20) not null default 'SALE'
    check (transaction_type in ('SALE', 'MEMBERSHIP')),
  add column if not exists membership_payment_type varchar(20)
    check (membership_payment_type in ('NEW', 'RENEWAL', 'REACTIVATION')),
  add column if not exists subscription_fee numeric(12,2) not null default 0 check (subscription_fee >= 0),
  add column if not exists reactivation_fee numeric(12,2) not null default 0 check (reactivation_fee >= 0),
  add column if not exists coverage_start date,
  add column if not exists coverage_end date;

-- Move existing billing records into members before removing legacy storage.
do $$
declare
  v_monthly_fee numeric(12,2) := 35000;
  v_reactivation_fee numeric(12,2) := 10000;
  v_payment record;
begin
  if to_regclass('public.membership_settings') is not null then
    execute 'select monthly_fee, reactivation_fee from public.membership_settings where id = 1'
      into v_monthly_fee, v_reactivation_fee;
  elsif to_regprocedure('public.get_membership_fees()') is not null then
    select f.monthly_fee, f.reactivation_fee
      into v_monthly_fee, v_reactivation_fee
    from public.get_membership_fees() f;
  end if;

  if to_regclass('public.membership_payments') is not null then
    for v_payment in execute
      'select receipt_no, member_id, payment_type, subscription_fee, reactivation_fee, payment_method, coverage_start, coverage_end, paid_at from public.membership_payments'
    loop
      update public.members m
      set membership_payments = m.membership_payments || jsonb_build_array(jsonb_build_object(
        'receipt_no', v_payment.receipt_no,
        'payment_type', v_payment.payment_type,
        'subscription_fee', v_payment.subscription_fee,
        'reactivation_fee', v_payment.reactivation_fee,
        'total_amount', v_payment.subscription_fee + v_payment.reactivation_fee,
        'payment_method', v_payment.payment_method,
        'coverage_start', v_payment.coverage_start,
        'coverage_end', v_payment.coverage_end,
        'paid_at', v_payment.paid_at
      ))
      where m.id = v_payment.member_id
        and not (m.membership_payments @> jsonb_build_array(jsonb_build_object('receipt_no', v_payment.receipt_no)));
    end loop;
    execute 'drop table public.membership_payments';
  end if;

  for v_payment in
    select receipt_no, member_id, membership_payment_type as payment_type,
           subscription_fee, reactivation_fee, payment_method,
           coverage_start, coverage_end, sold_at as paid_at
    from public.sales
    where transaction_type = 'MEMBERSHIP'
  loop
    update public.members m
    set membership_payments = m.membership_payments || jsonb_build_array(jsonb_build_object(
      'receipt_no', v_payment.receipt_no,
      'payment_type', v_payment.payment_type,
      'subscription_fee', v_payment.subscription_fee,
      'reactivation_fee', v_payment.reactivation_fee,
      'total_amount', v_payment.subscription_fee + v_payment.reactivation_fee,
      'payment_method', v_payment.payment_method,
      'coverage_start', v_payment.coverage_start,
      'coverage_end', v_payment.coverage_end,
      'paid_at', v_payment.paid_at
    ))
    where m.id = v_payment.member_id
      and not (m.membership_payments @> jsonb_build_array(jsonb_build_object('receipt_no', v_payment.receipt_no)));
  end loop;

  delete from public.sales where transaction_type = 'MEMBERSHIP';

  if to_regclass('public.membership_settings') is not null then
    execute 'drop table public.membership_settings';
  end if;

  execute format(
    'create or replace function public.get_membership_fees() returns table(monthly_fee numeric, reactivation_fee numeric) language sql immutable as %L',
    format('select %s::numeric, %s::numeric', v_monthly_fee, v_reactivation_fee)
  );
end;
$$;

alter table public.sales
  drop constraint if exists sales_coverage_period_check,
  drop column if exists transaction_type,
  drop column if exists membership_payment_type,
  drop column if exists subscription_fee,
  drop column if exists reactivation_fee,
  drop column if exists coverage_start,
  drop column if exists coverage_end;

grant execute on function public.get_membership_fees() to anon, authenticated;

create or replace function public._record_membership_payment(
  p_member_id uuid,
  p_payment_type text,
  p_payment_method text,
  p_initial_start date default null
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monthly_fee numeric(12,2);
  v_reactivation_fee numeric(12,2) := 0;
  v_status text;
  v_paid_through date;
  v_coverage_start date;
  v_coverage_end date;
  v_receipt_no text;
begin
  select m.status, m.paid_through
    into v_status, v_paid_through
  from public.members m
  where m.id = p_member_id
  for update;

  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;

  if p_payment_type not in ('NEW', 'RENEWAL', 'REACTIVATION') then
    raise exception 'Jenis pembayaran membership tidak valid.';
  end if;

  if p_payment_type = 'RENEWAL' and v_status <> 'ACTIVE' then
    raise exception 'Iuran hanya dapat dibayar untuk member aktif.';
  end if;

  if p_payment_type = 'REACTIVATION' and v_status <> 'INACTIVE' then
    raise exception 'Reaktivasi hanya dapat dilakukan untuk member inactive.';
  end if;

  select f.monthly_fee, f.reactivation_fee
    into v_monthly_fee, v_reactivation_fee
  from public.get_membership_fees() f;

  if p_payment_type <> 'REACTIVATION' then
    v_reactivation_fee := 0;
  end if;

  v_coverage_start := coalesce(
    p_initial_start,
    greatest(coalesce(v_paid_through + 1, current_date), current_date)
  );
  v_coverage_end := (v_coverage_start + interval '1 month' - interval '1 day')::date;
  v_receipt_no := 'MBR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  update public.members
  set paid_through = v_coverage_end,
      membership_payments = membership_payments || jsonb_build_array(jsonb_build_object(
        'receipt_no', v_receipt_no,
        'payment_type', p_payment_type,
        'subscription_fee', v_monthly_fee,
        'reactivation_fee', v_reactivation_fee,
        'total_amount', v_monthly_fee + v_reactivation_fee,
        'payment_method', upper(p_payment_method),
        'coverage_start', v_coverage_start,
        'coverage_end', v_coverage_end,
        'paid_at', now()
      ))
  where id = p_member_id;

  return v_coverage_end;
end;
$$;

create or replace function public.register_member(
  p_membership_number text,
  p_joined_at date,
  p_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  insert into public.members (membership_number, joined_at, status)
  values (upper(trim(p_membership_number)), p_joined_at, 'ACTIVE')
  returning id into v_member_id;

  perform public._record_membership_payment(v_member_id, 'NEW', p_payment_method, p_joined_at);
  return v_member_id;
end;
$$;

create or replace function public.change_membership_status(
  p_member_id uuid,
  p_status text,
  p_payment_method text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if upper(p_status) not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Status membership tidak valid.';
  end if;

  select m.status into v_status
  from public.members m
  where m.id = p_member_id
  for update;

  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;

  if v_status = upper(p_status) then
    return v_status;
  end if;

  if upper(p_status) = 'INACTIVE' then
    update public.members set status = 'INACTIVE' where id = p_member_id;
    return 'INACTIVE';
  end if;

  if coalesce(trim(p_payment_method), '') = '' then
    raise exception 'Metode pembayaran diperlukan untuk reaktivasi.';
  end if;

  perform public._record_membership_payment(p_member_id, 'REACTIVATION', p_payment_method);
  update public.members set status = 'ACTIVE' where id = p_member_id;
  return 'ACTIVE';
end;
$$;

create or replace function public.renew_membership(
  p_member_id uuid,
  p_payment_method text
)
returns date
language plpgsql
security definer
set search_path = public
as $$
begin
  return public._record_membership_payment(p_member_id, 'RENEWAL', p_payment_method);
end;
$$;

revoke all on function public._record_membership_payment(uuid, text, text, date) from public;
revoke all on function public.register_member(text, date, text) from public;
revoke all on function public.change_membership_status(uuid, text, text) from public;
revoke all on function public.renew_membership(uuid, text) from public;

grant execute on function public.register_member(text, date, text) to anon, authenticated;
grant execute on function public.change_membership_status(uuid, text, text) to anon, authenticated;
grant execute on function public.renew_membership(uuid, text) to anon, authenticated;

-- Transaction correction and product availability controls.
-- Run after schema.sql in the Supabase SQL Editor.

create or replace function public.revise_sale(
  p_sale_id uuid,
  p_member_id uuid,
  p_payment_method text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product_price numeric(12,2);
  v_unit_price numeric(12,2);
  v_product_active boolean;
  v_subtotal numeric(12,2) := 0;
  v_discount_pct numeric(5,2) := 0;
  v_discount_amount numeric(12,2);
  v_member_joined_at date;
  v_item_count integer := 0;
  v_original_prices jsonb;
begin
  if coalesce(upper(p_payment_method), '') not in ('CASH', 'QRIS', 'DEBIT', 'EWALLET') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Daftar item transaksi tidak valid.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Transaksi harus memiliki minimal satu item.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Jumlah item transaksi melebihi batas.';
  end if;

  perform 1 from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if p_member_id is not null then
    select m.joined_at into v_member_joined_at
    from public.members m
    where m.id = p_member_id
      and (m.status = 'ACTIVE' or m.id = (select s.member_id from public.sales s where s.id = p_sale_id));
    if not found then
      raise exception 'Member tidak ditemukan atau tidak aktif.';
    end if;

    v_discount_pct := case
      when age(current_date, v_member_joined_at) < interval '3 months' then 5
      when age(current_date, v_member_joined_at) < interval '6 months' then 10
      else 15
    end;
  end if;

  if exists (
    select item.product_id
    from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
    group by item.product_id
    having count(*) > 1
  ) then
    raise exception 'Produk yang sama tidak boleh muncul lebih dari satu kali.';
  end if;

  for v_item in
    select item.product_id, item.qty
    from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
  loop
    if v_item.qty is null or v_item.qty < 1 or v_item.qty > 999 then
      raise exception 'Jumlah item harus antara 1 dan 999.';
    end if;

    select p.price, p.is_active into v_product_price, v_product_active
    from public.products p where p.id = v_item.product_id;
    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;

    if not v_product_active and not exists (
      select 1 from public.sale_items si
      where si.sale_id = p_sale_id and si.product_id = v_item.product_id
    ) then
      raise exception 'Produk non-available tidak dapat ditambahkan ke transaksi.';
    end if;

    select si.unit_price into v_unit_price
    from public.sale_items si
    where si.sale_id = p_sale_id and si.product_id = v_item.product_id;
    if not found then
      v_unit_price := v_product_price;
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_item.qty);
    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count = 0 then
    raise exception 'Transaksi harus memiliki minimal satu item.';
  end if;

  v_discount_amount := v_subtotal * v_discount_pct / 100;

  select coalesce(jsonb_object_agg(si.product_id::text, si.unit_price), '{}'::jsonb)
    into v_original_prices
  from public.sale_items si
  where si.sale_id = p_sale_id;

  update public.sales
  set member_id = p_member_id,
      payment_method = upper(p_payment_method),
      subtotal = v_subtotal,
      discount_pct = v_discount_pct,
      discount_amount = v_discount_amount,
      total = v_subtotal - v_discount_amount
  where id = p_sale_id;

  delete from public.sale_items where sale_id = p_sale_id;

  insert into public.sale_items (sale_id, product_id, qty, unit_price, line_total)
  select p_sale_id, item.product_id, item.qty, prices.unit_price,
         prices.unit_price * item.qty
  from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
  join public.products p on p.id = item.product_id
  cross join lateral (
    select coalesce((v_original_prices ->> item.product_id::text)::numeric, p.price) as unit_price
  ) as prices;
end;
$$;

create or replace function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;
end;
$$;

create or replace function public.set_product_availability(
  p_product_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products set is_active = p_is_active where id = p_product_id;
  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.revise_sale(uuid, uuid, text, jsonb) from public;
revoke all on function public.delete_sale(uuid) from public;
revoke all on function public.set_product_availability(uuid, boolean) from public;
grant execute on function public.revise_sale(uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.delete_sale(uuid) to anon, authenticated;
grant execute on function public.set_product_availability(uuid, boolean) to anon, authenticated;

create or replace function public.update_membership_details(
  p_member_id uuid,
  p_membership_number text,
  p_joined_at date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_number text := upper(trim(coalesce(p_membership_number, '')));
begin
  if v_membership_number = '' then
    raise exception 'Nomor membership wajib diisi.';
  end if;

  if char_length(v_membership_number) > 20 then
    raise exception 'Nomor membership maksimal 20 karakter.';
  end if;

  if p_joined_at is null then
    raise exception 'Tanggal bergabung wajib diisi.';
  end if;

  update public.members
  set membership_number = v_membership_number,
      joined_at = p_joined_at
  where id = p_member_id;

  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;
end;
$$;

create or replace function public.update_product_details(
  p_product_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_price numeric,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text := upper(trim(coalesce(p_sku, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_category text := trim(coalesce(p_category, ''));
begin
  if v_sku = '' or char_length(v_sku) > 30 then
    raise exception 'SKU wajib diisi dan maksimal 30 karakter.';
  end if;

  if v_name = '' or char_length(v_name) > 100 then
    raise exception 'Nama produk wajib diisi dan maksimal 100 karakter.';
  end if;

  if v_category = '' or char_length(v_category) > 30 then
    raise exception 'Kategori wajib diisi dan maksimal 30 karakter.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Harga harus bernilai nol atau lebih.';
  end if;

  update public.products
  set sku = v_sku,
      name = v_name,
      category = v_category,
      price = p_price,
      image_path = coalesce(p_image_path, image_path)
  where id = p_product_id;

  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;
end;
$$;

create or replace function public.delete_membership(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;

  if exists (select 1 from public.sales where member_id = p_member_id) then
    raise exception 'Membership memiliki riwayat transaksi dan tidak dapat dihapus. Nonaktifkan membership sebagai gantinya.';
  end if;

  if exists (
    select 1 from public.members
    where id = p_member_id
      and jsonb_array_length(membership_payments) > 0
      and (paid_through is null or paid_through >= current_date)
  ) then
    raise exception 'Membership masih memiliki masa iuran aktif dan belum dapat dihapus.';
  end if;

  delete from public.members where id = p_member_id;
  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;
end;
$$;

create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.sale_items where product_id = p_product_id) then
    raise exception 'Produk memiliki riwayat transaksi dan tidak dapat dihapus. Tandai non-available sebagai gantinya.';
  end if;

  delete from public.products where id = p_product_id;
  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.update_membership_details(uuid, text, date) from public;
revoke all on function public.update_product_details(uuid, text, text, text, numeric, text) from public;
revoke all on function public.delete_membership(uuid) from public;
revoke all on function public.delete_product(uuid) from public;
grant execute on function public.update_membership_details(uuid, text, date) to anon, authenticated;
grant execute on function public.update_product_details(uuid, text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.delete_membership(uuid) to anon, authenticated;
grant execute on function public.delete_product(uuid) to anon, authenticated;

create or replace function public.delete_membership(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;

  if exists (select 1 from public.sales where member_id = p_member_id) then
    raise exception 'Membership memiliki riwayat transaksi dan tidak dapat dihapus. Nonaktifkan membership sebagai gantinya.';
  end if;

  if exists (
    select 1 from public.members
    where id = p_member_id
      and jsonb_array_length(membership_payments) > 0
      and (paid_through is null or paid_through >= current_date)
  ) then
    raise exception 'Membership masih memiliki masa iuran aktif dan belum dapat dihapus.';
  end if;

  delete from public.members where id = p_member_id;
  if not found then
    raise exception 'Membership tidak ditemukan.';
  end if;
end;
$$;

begin;

alter table public.products
  add column if not exists image_path text;

update public.products
set image_path = case sku
  when 'CF-001' then 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=480&q=85'
  when 'CF-002' then 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=480&q=85'
  when 'CF-003' then 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=480&q=85'
  when 'CF-004' then 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=480&q=85'
  when 'CF-005' then 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=480&q=85'
  when 'CF-006' then 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=480&q=85'
  when 'CF-007' then 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=480&q=85'
  when 'FD-001' then 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=480&q=85'
  when 'FD-002' then 'https://images.unsplash.com/photo-1509365465985-25d11c17e812?auto=format&fit=crop&w=480&q=85'
  when 'FD-004' then 'https://images.unsplash.com/photo-1623334044303-241021148842?auto=format&fit=crop&w=480&q=85'
  when 'SN-001' then 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=480&q=85'
  when 'SN-002' then 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=480&q=85'
  else image_path
end
where image_path is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product images insert" on storage.objects;
drop policy if exists "product images delete" on storage.objects;
create policy "product images insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'product-images');
create policy "product images delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'product-images');

drop function if exists public.update_product_details(uuid, text, text, text, numeric);
drop function if exists public.update_product_details(uuid, text, text, text, numeric, text);
create function public.update_product_details(
  p_product_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_price numeric,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text := upper(trim(coalesce(p_sku, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_category text := trim(coalesce(p_category, ''));
begin
  if v_sku = '' or char_length(v_sku) > 30 then
    raise exception 'SKU wajib diisi dan maksimal 30 karakter.';
  end if;

  if v_name = '' or char_length(v_name) > 100 then
    raise exception 'Nama produk wajib diisi dan maksimal 100 karakter.';
  end if;

  if v_category = '' or char_length(v_category) > 30 then
    raise exception 'Kategori wajib diisi dan maksimal 30 karakter.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Harga harus bernilai nol atau lebih.';
  end if;

  update public.products
  set sku = v_sku,
      name = v_name,
      category = v_category,
      price = p_price,
      image_path = coalesce(p_image_path, image_path)
  where id = p_product_id;

  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.update_product_details(uuid, text, text, text, numeric, text) from public;
grant execute on function public.update_product_details(uuid, text, text, text, numeric, text) to anon, authenticated;

commit;

-- Accounting module: Chart of Accounts, read-only General Journal, and Revenue Report.
-- Run after schema.sql and the existing membership/product migrations.

drop trigger if exists sale_item_cost_snapshot on public.sale_items;
drop function if exists public.snapshot_sale_item_cost();
drop function if exists public.record_operating_expense(date, uuid, numeric, text, text);
drop function if exists public.update_product_details(uuid, text, text, text, numeric, numeric, text);

-- A prior accounting migration may have left this unused column without a default.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_items' and column_name = 'unit_cost'
  ) then
    alter table public.sale_items alter column unit_cost set default 0;
  end if;
end;
$$;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  account_code varchar(20) not null unique,
  account_name varchar(100) not null,
  account_type varchar(20) not null
    check (account_type in ('Assets', 'Liabilities', 'Equity', 'Revenue', 'Expenses')),
  system_role varchar(30) unique,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence if not exists public.journal_number_sequence;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_no text not null unique,
  entry_date date not null,
  source_type varchar(20) not null check (source_type in ('SALE', 'MEMBERSHIP')),
  source_reference varchar(100) not null,
  description varchar(200) not null,
  status varchar(10) not null default 'POSTED' check (status in ('POSTED', 'VOID')),
  created_at timestamptz not null default now(),
  constraint journal_entries_source_unique unique (source_type, source_reference),
  constraint journal_entries_reference_unique unique (source_reference)
);

alter table public.journal_entries alter column journal_no drop default;

create or replace function public.set_journal_number_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_suffix text;
begin
  if tg_op = 'INSERT' then
    if new.journal_no is null or new.journal_no = '' then
      new.journal_no := 'JRN-' || to_char(new.entry_date, 'YYYYMMDD') || '-' ||
        lpad(nextval('public.journal_number_sequence')::text, 6, '0');
    else
      v_suffix := substring(new.journal_no from '^JRN-[0-9]{8}-(.*)$');
      if v_suffix is not null then
        new.journal_no := 'JRN-' || to_char(new.entry_date, 'YYYYMMDD') || '-' || v_suffix;
      end if;
    end if;
  else
    v_suffix := substring(old.journal_no from '^JRN-[0-9]{8}-(.*)$');
    if v_suffix is not null then
      new.journal_no := 'JRN-' || to_char(new.entry_date, 'YYYYMMDD') || '-' || v_suffix;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists journal_number_entry_date on public.journal_entries;
create trigger journal_number_entry_date
  before insert or update of entry_date on public.journal_entries
  for each row execute function public.set_journal_number_date();

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description varchar(200) not null,
  debit numeric(12,2) not null default 0 check (debit >= 0),
  credit numeric(12,2) not null default 0 check (credit >= 0),
  constraint journal_lines_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists idx_journal_entries_date on public.journal_entries(entry_date desc);
create index if not exists idx_journal_lines_entry on public.journal_lines(journal_entry_id);
create index if not exists idx_journal_lines_account on public.journal_lines(account_id);

insert into public.chart_of_accounts
  (account_code, account_name, account_type, system_role, is_system)
values
  ('1000', 'Cash & Bank', 'Assets', 'CASH', true),
  ('2000', 'Accounts Payable', 'Liabilities', 'PAYABLES', true),
  ('3000', 'Owner Equity', 'Equity', 'EQUITY', true),
  ('4000', 'Sales Revenue', 'Revenue', 'SALES_REVENUE', true),
  ('4010', 'Membership Revenue', 'Revenue', 'MEMBERSHIP_REVENUE', true)
on conflict (account_code) do nothing;

alter table public.chart_of_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;

drop policy if exists "accounting accounts read" on public.chart_of_accounts;
drop policy if exists "accounting accounts insert" on public.chart_of_accounts;
drop policy if exists "accounting accounts update" on public.chart_of_accounts;
drop policy if exists "accounting journal entries read" on public.journal_entries;
drop policy if exists "accounting journal lines read" on public.journal_lines;

create policy "accounting accounts read" on public.chart_of_accounts
  for select to anon, authenticated using (true);
create policy "accounting accounts insert" on public.chart_of_accounts
  for insert to anon, authenticated with check (not is_system and system_role is null);
create policy "accounting accounts update" on public.chart_of_accounts
  for update to anon, authenticated using (true) with check (true);
create policy "accounting journal entries read" on public.journal_entries
  for select to anon, authenticated using (true);
create policy "accounting journal lines read" on public.journal_lines
  for select to anon, authenticated using (true);

revoke all on public.chart_of_accounts, public.journal_entries, public.journal_lines from public, anon, authenticated;
grant select, insert, update on public.chart_of_accounts to anon, authenticated;
grant select on public.journal_entries, public.journal_lines to anon, authenticated;

create or replace function public.protect_accounting_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system or exists (
      select 1 from public.journal_lines jl where jl.account_id = old.id
    ) then
      raise exception 'Accounts used by the accounting system or journal cannot be deleted. Deactivate custom accounts instead.';
    end if;
    return old;
  end if;

  if new.is_system is distinct from old.is_system
     or new.system_role is distinct from old.system_role then
    raise exception 'System account settings cannot be changed.';
  end if;

  if old.is_system and (
    new.account_code is distinct from old.account_code
    or new.account_type is distinct from old.account_type
    or new.is_active is distinct from old.is_active
  ) then
    raise exception 'System account codes, categories, and status cannot be changed.';
  end if;

  if exists (select 1 from public.journal_lines jl where jl.account_id = old.id)
     and (new.account_code is distinct from old.account_code
       or new.account_type is distinct from old.account_type) then
    raise exception 'Account code and category cannot change after journal use.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_accounting_account on public.chart_of_accounts;
create trigger protect_accounting_account
  before update or delete on public.chart_of_accounts
  for each row execute function public.protect_accounting_account();

create or replace function public.assert_journal_balanced()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_status text;
  v_debit numeric(14,2);
  v_credit numeric(14,2);
begin
  if tg_table_name = 'journal_entries' then
    v_entry_id := new.id;
  elsif tg_op = 'DELETE' then
    v_entry_id := old.journal_entry_id;
  else
    v_entry_id := new.journal_entry_id;
  end if;

  select je.status into v_status
  from public.journal_entries je
  where je.id = v_entry_id;

  if not found or v_status <> 'POSTED' then
    return null;
  end if;

  select coalesce(sum(jl.debit), 0), coalesce(sum(jl.credit), 0)
    into v_debit, v_credit
  from public.journal_lines jl
  where jl.journal_entry_id = v_entry_id;

  if v_debit <= 0 or v_debit <> v_credit then
    raise exception 'Journal entry % must have equal, non-zero debit and credit totals.', v_entry_id;
  end if;
  return null;
end;
$$;

drop trigger if exists journal_entry_balance_check on public.journal_entries;
create constraint trigger journal_entry_balance_check
  after insert or update on public.journal_entries
  deferrable initially deferred
  for each row execute function public.assert_journal_balanced();

drop trigger if exists journal_line_balance_check on public.journal_lines;
create constraint trigger journal_line_balance_check
  after insert or update or delete on public.journal_lines
  deferrable initially deferred
  for each row execute function public.assert_journal_balanced();

-- Timestamp-derived journal dates use the same Asia/Jakarta business date shown by the POS.
create or replace function public.sync_sale_journal(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_entry_id uuid;
  v_cash_id uuid;
  v_sales_revenue_id uuid;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    return;
  end if;

  if upper(v_sale.receipt_no) like 'MBR-%' or exists (
    select 1
    from public.members m,
         lateral jsonb_array_elements(m.membership_payments) as payment(value)
    where upper(coalesce(payment.value ->> 'receipt_no', '')) = upper(v_sale.receipt_no)
  ) then
    update public.journal_entries
    set status = 'VOID'
    where source_type = 'SALE' and source_reference = v_sale.receipt_no;
    return;
  end if;

  if not exists (select 1 from public.sale_items si where si.sale_id = p_sale_id)
     or v_sale.total = 0 then
    update public.journal_entries
    set status = 'VOID'
    where source_type = 'SALE' and source_reference = v_sale.receipt_no;
    return;
  end if;

  select id into v_cash_id from public.chart_of_accounts where system_role = 'CASH';
  select id into v_sales_revenue_id from public.chart_of_accounts where system_role = 'SALES_REVENUE';

  insert into public.journal_entries
    (entry_date, source_type, source_reference, description, status)
  values
    ((v_sale.sold_at at time zone 'Asia/Jakarta')::date, 'SALE', v_sale.receipt_no, 'POS sale ' || v_sale.receipt_no, 'POSTED')
  on conflict (source_type, source_reference) do update
    set entry_date = excluded.entry_date,
        description = excluded.description,
        status = 'POSTED'
  returning id into v_entry_id;

  delete from public.journal_lines where journal_entry_id = v_entry_id;

  if v_sale.total > 0 then
    insert into public.journal_lines (journal_entry_id, account_id, description, debit, credit)
    values
      (v_entry_id, v_cash_id, 'Sales receipt ' || v_sale.receipt_no || ' · ' || v_sale.payment_method, v_sale.total, 0),
      (v_entry_id, v_sales_revenue_id, 'Net sales revenue', 0, v_sale.total);
  end if;
end;
$$;

create or replace function public.on_sale_journal_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_receipt_no text;
begin
  if tg_table_name = 'sales' then
    if tg_op = 'DELETE' then
      v_receipt_no := old.receipt_no;
      update public.journal_entries
      set status = 'VOID'
      where source_type = 'SALE' and source_reference = v_receipt_no;
      return old;
    end if;
    v_sale_id := new.id;
  elsif tg_op = 'DELETE' then
    v_sale_id := old.sale_id;
  else
    v_sale_id := new.sale_id;
  end if;

  perform public.sync_sale_journal(v_sale_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sales_journal_sync on public.sales;
create trigger sales_journal_sync
  after insert or update or delete on public.sales
  for each row execute function public.on_sale_journal_change();

drop trigger if exists sale_items_journal_sync on public.sale_items;
create trigger sale_items_journal_sync
  after insert or update or delete on public.sale_items
  for each row execute function public.on_sale_journal_change();

create or replace function public.sync_membership_payment_journals_for_member(
  p_member_id uuid,
  p_payments jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment jsonb;
  v_ordinality bigint;
  v_receipt_no text;
  v_payment_type text;
  v_amount numeric(12,2);
  v_paid_text text;
  v_paid_at timestamptz;
  v_entry_date date;
  v_joined_at date;
  v_payment_method text;
  v_entry_id uuid;
  v_cash_id uuid;
  v_revenue_id uuid;
begin
  select joined_at into v_joined_at
  from public.members
  where id = p_member_id;

  select id into v_cash_id from public.chart_of_accounts where system_role = 'CASH';
  select id into v_revenue_id from public.chart_of_accounts where system_role = 'MEMBERSHIP_REVENUE';

  for v_payment, v_ordinality in
    select payment.value, payment.ordinality
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
      with ordinality as payment(value, ordinality)
  loop
    v_receipt_no := coalesce(nullif(v_payment ->> 'receipt_no', ''), 'MBR-' || p_member_id::text || '-' || v_ordinality::text);
    v_payment_type := upper(coalesce(v_payment ->> 'payment_type', 'MEMBERSHIP'));
    v_amount := coalesce(
      nullif(v_payment ->> 'total_amount', '')::numeric,
      coalesce(nullif(v_payment ->> 'subscription_fee', '')::numeric, 0) +
        coalesce(nullif(v_payment ->> 'reactivation_fee', '')::numeric, 0)
    );
    v_paid_text := nullif(v_payment ->> 'paid_at', '');
    if v_paid_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      v_entry_date := v_paid_text::date;
    elsif v_paid_text ~ '([zZ]|[+-][0-9]{2}(:?[0-9]{2})?)$' then
      v_paid_at := v_paid_text::timestamptz;
      v_entry_date := (v_paid_at at time zone 'Asia/Jakarta')::date;
    elsif v_paid_text is not null then
      v_entry_date := v_paid_text::timestamp::date;
    else
      v_entry_date := coalesce(
        nullif(v_payment ->> 'coverage_start', '')::date,
        v_joined_at,
        (now() at time zone 'Asia/Jakarta')::date
      );
    end if;
    v_payment_method := upper(coalesce(v_payment ->> 'payment_method', 'CASH'));

    if v_amount <= 0 then
      continue;
    end if;

    insert into public.journal_entries
      (entry_date, source_type, source_reference, description, status)
    values
      (v_entry_date, 'MEMBERSHIP', v_receipt_no, 'Membership ' || v_payment_type || ' ' || v_receipt_no, 'POSTED')
    on conflict (source_type, source_reference) do update
      set entry_date = excluded.entry_date,
          description = excluded.description,
          status = 'POSTED'
    returning id into v_entry_id;

    delete from public.journal_lines where journal_entry_id = v_entry_id;
    insert into public.journal_lines (journal_entry_id, account_id, description, debit, credit)
    values
      (v_entry_id, v_cash_id, 'Membership payment · ' || v_payment_method, v_amount, 0),
      (v_entry_id, v_revenue_id, 'Membership ' || v_payment_type || ' revenue', 0, v_amount);
  end loop;
end;
$$;

create or replace function public.sync_membership_payment_journals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_membership_payment_journals_for_member(new.id, new.membership_payments);
  return new;
end;
$$;

drop trigger if exists membership_payment_journal_insert on public.members;
create trigger membership_payment_journal_insert
  after insert on public.members
  for each row execute function public.sync_membership_payment_journals();

drop trigger if exists membership_payment_journal_update on public.members;
create trigger membership_payment_journal_update
  after update of membership_payments on public.members
  for each row
  when (new.membership_payments is distinct from old.membership_payments)
  execute function public.sync_membership_payment_journals();

revoke all on function public.sync_sale_journal(uuid) from public;
revoke all on function public.on_sale_journal_change() from public;
revoke all on function public.sync_membership_payment_journals() from public;
revoke all on function public.sync_membership_payment_journals_for_member(uuid, jsonb) from public;
revoke all on function public.set_journal_number_date() from public;

create or replace function public.revise_sale(
  p_sale_id uuid,
  p_member_id uuid,
  p_payment_method text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_product_price numeric(12,2);
  v_unit_price numeric(12,2);
  v_product_active boolean;
  v_subtotal numeric(12,2) := 0;
  v_discount_pct numeric(5,2) := 0;
  v_discount_amount numeric(12,2);
  v_member_joined_at date;
  v_item_count integer := 0;
  v_original_prices jsonb;
begin
  if coalesce(upper(p_payment_method), '') not in ('CASH', 'QRIS', 'DEBIT', 'EWALLET') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Daftar item transaksi tidak valid.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Transaksi harus memiliki minimal satu item.';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Jumlah item transaksi melebihi batas.';
  end if;

  perform 1 from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.';
  end if;

  if p_member_id is not null then
    select m.joined_at into v_member_joined_at
    from public.members m
    where m.id = p_member_id
      and (m.status = 'ACTIVE' or m.id = (select s.member_id from public.sales s where s.id = p_sale_id));
    if not found then
      raise exception 'Member tidak ditemukan atau tidak aktif.';
    end if;
    v_discount_pct := case
      when age(current_date, v_member_joined_at) < interval '3 months' then 5
      when age(current_date, v_member_joined_at) < interval '6 months' then 10
      else 15
    end;
  end if;

  if exists (
    select item.product_id from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
    group by item.product_id having count(*) > 1
  ) then
    raise exception 'Produk yang sama tidak boleh muncul lebih dari satu kali.';
  end if;

  for v_item in
    select item.product_id, item.qty
    from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
  loop
    if v_item.qty is null or v_item.qty < 1 or v_item.qty > 999 then
      raise exception 'Jumlah item harus antara 1 dan 999.';
    end if;
    select p.price, p.is_active into v_product_price, v_product_active
    from public.products p where p.id = v_item.product_id;
    if not found then
      raise exception 'Produk tidak ditemukan.';
    end if;
    if not v_product_active and not exists (
      select 1 from public.sale_items si
      where si.sale_id = p_sale_id and si.product_id = v_item.product_id
    ) then
      raise exception 'Produk non-available tidak dapat ditambahkan ke transaksi.';
    end if;
    select si.unit_price into v_unit_price
    from public.sale_items si
    where si.sale_id = p_sale_id and si.product_id = v_item.product_id;
    if not found then
      v_unit_price := v_product_price;
    end if;
    v_subtotal := v_subtotal + (v_unit_price * v_item.qty);
    v_item_count := v_item_count + 1;
  end loop;
  if v_item_count = 0 then
    raise exception 'Transaksi harus memiliki minimal satu item.';
  end if;

  v_discount_amount := v_subtotal * v_discount_pct / 100;
  select coalesce(jsonb_object_agg(si.product_id::text, si.unit_price), '{}'::jsonb)
    into v_original_prices from public.sale_items si where si.sale_id = p_sale_id;

  update public.sales
  set member_id = p_member_id,
      payment_method = upper(p_payment_method),
      subtotal = v_subtotal,
      discount_pct = v_discount_pct,
      discount_amount = v_discount_amount,
      total = v_subtotal - v_discount_amount
  where id = p_sale_id;

  delete from public.sale_items where sale_id = p_sale_id;
  insert into public.sale_items (sale_id, product_id, qty, unit_price, line_total)
  select p_sale_id, item.product_id, item.qty, prices.unit_price,
         prices.unit_price * item.qty
  from jsonb_to_recordset(p_items) as item(product_id uuid, qty integer)
  join public.products p on p.id = item.product_id
  cross join lateral (
    select coalesce((v_original_prices ->> item.product_id::text)::numeric, p.price) as unit_price
  ) as prices;
end;
$$;

create or replace function public.update_product_details(
  p_product_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_price numeric,
  p_image_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text := upper(trim(coalesce(p_sku, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_category text := trim(coalesce(p_category, ''));
begin
  if v_sku = '' or char_length(v_sku) > 30 then
    raise exception 'SKU wajib diisi dan maksimal 30 karakter.';
  end if;

  if v_name = '' or char_length(v_name) > 100 then
    raise exception 'Nama produk wajib diisi dan maksimal 100 karakter.';
  end if;

  if v_category = '' or char_length(v_category) > 30 then
    raise exception 'Kategori wajib diisi dan maksimal 30 karakter.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Harga harus bernilai nol atau lebih.';
  end if;

  update public.products
  set sku = v_sku,
      name = v_name,
      category = v_category,
      price = p_price,
      image_path = coalesce(p_image_path, image_path)
  where id = p_product_id;

  if not found then
    raise exception 'Produk tidak ditemukan.';
  end if;
end;
$$;

revoke all on function public.revise_sale(uuid, uuid, text, jsonb) from public;
revoke all on function public.update_product_details(uuid, text, text, text, numeric, text) from public;
grant execute on function public.revise_sale(uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.update_product_details(uuid, text, text, text, numeric, text) to anon, authenticated;

-- Backfill existing successful sales and membership payments without changing source records.
do $$
declare
  v_sale record;
  v_member record;
begin
  for v_sale in select s.id from public.sales s loop
    perform public.sync_sale_journal(v_sale.id);
  end loop;
  for v_member in
    select m.id, m.membership_payments from public.members m
    where jsonb_array_length(m.membership_payments) > 0
  loop
    perform public.sync_membership_payment_journals_for_member(v_member.id, v_member.membership_payments);
  end loop;
end;
$$;
