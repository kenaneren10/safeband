create table public.orders (
  id         uuid primary key default gen_random_uuid(),
  order_ref  text not null unique check (order_ref ~ '^SB-[0-9]{5}$'),
  name       text not null check (char_length(name) between 1 and 80),
  street     text not null check (char_length(street) between 1 and 80),
  zip        text not null check (char_length(zip) between 1 and 8),
  city       text not null check (char_length(city) between 1 and 60),
  email      text not null check (char_length(email) between 1 and 120),
  created_at timestamptz not null default now()
);

create index orders_created_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

create policy admin_all_orders on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_ref   text;
  new_order public.orders%rowtype;
begin
  perform public.enforce_rate_limit('create_order', 10, interval '1 hour');

  if coalesce((payload ->> 'consent')::boolean, false) is not true then
    raise exception 'Die Datenschutzerklärung muss bestätigt werden.';
  end if;

  if coalesce(nullif(trim(payload ->> 'name'), ''), '') = '' then
    raise exception 'Name fehlt.';
  end if;
  if coalesce(nullif(trim(payload ->> 'street'), ''), '') = '' then
    raise exception 'Strasse fehlt.';
  end if;
  if coalesce(nullif(trim(payload ->> 'zip'), ''), '') = '' then
    raise exception 'PLZ fehlt.';
  end if;
  if coalesce(nullif(trim(payload ->> 'city'), ''), '') = '' then
    raise exception 'Ort fehlt.';
  end if;
  if coalesce(nullif(trim(payload ->> 'email'), ''), '') = '' then
    raise exception 'E-Mail fehlt.';
  end if;

  loop
    new_ref := 'SB-' || (10000 + floor(random() * 90000))::int;
    exit when not exists (select 1 from public.orders where order_ref = new_ref);
  end loop;

  insert into public.orders (order_ref, name, street, zip, city, email)
  values (
    new_ref,
    trim(payload ->> 'name'),
    trim(payload ->> 'street'),
    trim(payload ->> 'zip'),
    trim(payload ->> 'city'),
    trim(payload ->> 'email')
  )
  returning * into new_order;

  return jsonb_build_object('order_ref', new_order.order_ref);
end;
$$;

create or replace function public.list_orders(
  p_search text default null,
  p_limit  int  default 200
)
returns table (
  order_ref   text,
  name        text,
  street      text,
  zip         text,
  city        text,
  email       text,
  created_at  timestamptz,
  has_profile boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  needle text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  return query
    select
      o.order_ref, o.name, o.street, o.zip, o.city, o.email, o.created_at,
      exists (
        select 1 from public.profiles p where p.order_ref = o.order_ref
      ) as has_profile
    from public.orders o
    where needle is null
       or o.order_ref ilike '%' || needle || '%'
       or o.name ilike '%' || needle || '%'
       or o.city ilike '%' || needle || '%'
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to anon, authenticated;

revoke all on function public.list_orders(text, int) from public;
grant execute on function public.list_orders(text, int) to authenticated;
