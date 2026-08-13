drop function if exists public.release_band_reservation(text);
drop function if exists public.reserve_band(text, text);
drop function if exists public.assign_band(text, uuid);

create function public.assign_band(
  p_code       text,
  p_profile_id uuid default null,
  p_order_ref  text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_code text := upper(trim(p_code));
  band_status text;
  ref         text := nullif(trim(p_order_ref), '');
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  if p_profile_id is null and ref is null then
    raise exception 'Profil oder Bestellnummer fehlt.';
  end if;

  select status into band_status from public.bands where code = target_code for update;

  if band_status is null then
    raise exception 'Band % ist nicht im Bestand.', target_code;
  end if;
  if band_status <> 'unassigned' then
    raise exception 'Band % ist bereits vergeben oder gesperrt.', target_code;
  end if;

  if p_profile_id is not null then
    if exists (select 1 from public.bands where profile_id = p_profile_id) then
      raise exception 'Diese Bestellung hat bereits ein Band.';
    end if;

    update public.bands
    set profile_id = p_profile_id, status = 'assigned', assigned_at = now(), order_ref = null
    where code = target_code;
  else
    if exists (select 1 from public.profiles where order_ref = ref) then
      raise exception 'Für diese Bestellung existiert bereits ein Profil, bitte direkt zuweisen.';
    end if;
    if exists (select 1 from public.bands where order_ref = ref and code <> target_code) then
      raise exception 'Für diese Bestellung ist bereits ein anderes Band zugeteilt.';
    end if;

    update public.bands
    set order_ref = ref, status = 'assigned', assigned_at = now()
    where code = target_code;
  end if;
end;
$$;

revoke all on function public.assign_band(text, uuid, text) from public;
grant execute on function public.assign_band(text, uuid, text) to authenticated;

create or replace function public.create_profile(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_profile public.profiles%rowtype;
  wants_call  boolean := coalesce((payload ->> 'consent_call')::boolean, false);
  scopes      text[]  := array['datenverarbeitung'];
begin
  perform public.enforce_rate_limit('create_profile', 10, interval '1 hour');

  if coalesce((payload ->> 'consent_privacy')::boolean, false) is not true then
    raise exception 'Die Datenschutzerklärung muss bestätigt werden.';
  end if;

  if coalesce(nullif(trim(payload ->> 'last_name'), ''), '') = '' then
    raise exception 'Nachname fehlt.';
  end if;

  if coalesce(nullif(trim(payload ->> 'medical_note'), ''), '') <> ''
     and coalesce((payload ->> 'consent_health')::boolean, false) is not true then
    raise exception 'Für medizinische Angaben ist eine ausdrückliche Einwilligung nötig.';
  end if;

  insert into public.profiles (
    order_ref, first_name, last_name, category, public_note, medical_note,
    contact_name, contact_phone, contact_email, contact_call_public
  )
  values (
    nullif(trim(payload ->> 'order_ref'), ''),
    trim(payload ->> 'first_name'),
    trim(payload ->> 'last_name'),
    payload ->> 'category',
    nullif(trim(payload ->> 'public_note'), ''),
    nullif(trim(payload ->> 'medical_note'), ''),
    trim(payload ->> 'contact_name'),
    trim(payload ->> 'contact_phone'),
    nullif(trim(payload ->> 'contact_email'), ''),
    wants_call
  )
  returning * into new_profile;

  if new_profile.order_ref is not null then
    update public.bands
    set profile_id = new_profile.id,
        assigned_at = now(),
        order_ref = null
    where order_ref = new_profile.order_ref
      and status = 'assigned'
      and profile_id is null;
  end if;

  if coalesce((payload ->> 'consent_health')::boolean, false) then
    scopes := array_append(scopes, 'gesundheitsdaten');
  end if;

  if wants_call then
    scopes := array_append(scopes, 'notfallnummer_oeffentlich');
  end if;

  insert into public.consents (profile_id, policy_version, scopes, user_agent)
  values (
    new_profile.id,
    coalesce(nullif(trim(payload ->> 'policy_version'), ''), 'unbekannt'),
    scopes,
    left(coalesce(public.request_header('user-agent'), ''), 300)
  );

  return jsonb_build_object(
    'profile_id',   new_profile.id,
    'manage_token', new_profile.manage_token,
    'order_ref',    new_profile.order_ref
  );
end;
$$;

drop function if exists public.list_bands(text, text, int);

create function public.list_bands(
  p_status text default null,
  p_search text default null,
  p_limit  int  default 200
)
returns table (
  code           text,
  status         text,
  batch          text,
  created_at     timestamptz,
  assigned_at    timestamptz,
  first_name     text,
  last_name      text,
  category       text,
  order_ref      text,
  pending_profile boolean,
  profile_active boolean
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
      b.code,
      b.status,
      b.batch,
      b.created_at,
      b.assigned_at,
      p.first_name,
      p.last_name,
      p.category,
      coalesce(p.order_ref, b.order_ref),
      (p.id is null and b.order_ref is not null),
      p.active
    from public.bands b
    left join public.profiles p on p.id = b.profile_id
    where (p_status is null or b.status = p_status)
      and (
        needle is null
        or b.code ilike '%' || needle || '%'
        or p.first_name ilike '%' || needle || '%'
        or p.last_name ilike '%' || needle || '%'
        or p.order_ref ilike '%' || needle || '%'
        or b.order_ref ilike '%' || needle || '%'
      )
    order by b.assigned_at desc nulls last, b.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_bands(text, text, int) from public;
grant execute on function public.list_bands(text, text, int) to authenticated;

drop function if exists public.list_orders(text, int);

create function public.list_orders(
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
  has_profile boolean,
  assigned_band_code text
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
      ) as has_profile,
      (
        select b.code from public.bands b
        where b.order_ref = o.order_ref and b.status = 'assigned' and b.profile_id is null
        limit 1
      ) as assigned_band_code
    from public.orders o
    where needle is null
       or o.order_ref ilike '%' || needle || '%'
       or o.name ilike '%' || needle || '%'
       or o.city ilike '%' || needle || '%'
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_orders(text, int) from public;
grant execute on function public.list_orders(text, int) to authenticated;
