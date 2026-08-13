alter table public.profiles add column last_name text;

update public.profiles set last_name = 'Bernasconi' where first_name = 'Luca' and last_name is null;
update public.profiles set last_name = 'unbekannt' where last_name is null;

alter table public.profiles alter column last_name set not null;
alter table public.profiles add constraint profiles_last_name_check check (char_length(last_name) between 1 and 30);

drop function if exists public.get_public_profile(text);

create function public.get_public_profile(p_code text)
returns table (
  first_name    text,
  last_name     text,
  category      text,
  public_note   text,
  medical_note  text,
  contact_name  text,
  contact_phone text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hits int;
begin
  return query
    select
      p.first_name,
      p.last_name,
      p.category,
      p.public_note,
      p.medical_note,
      case when p.contact_call_public then p.contact_name  end,
      case when p.contact_call_public then p.contact_phone end
    from public.bands b
    join public.profiles p on p.id = b.profile_id
    where b.code = upper(trim(p_code))
      and b.status = 'assigned'
      and p.active;

  get diagnostics hits = row_count;

  if hits = 0 then
    perform public.enforce_rate_limit('lookup_miss', 20, interval '10 minutes');
  end if;
end;
$$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

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

create or replace function public.get_profile_by_token(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
           'first_name',    p.first_name,
           'last_name',     p.last_name,
           'category',      p.category,
           'public_note',   p.public_note,
           'medical_note',  p.medical_note,
           'contact_name',  p.contact_name,
           'contact_phone', p.contact_phone,
           'contact_email', p.contact_email,
           'active',        p.active,
           'band_code',     b.code
         )
  into result
  from public.profiles p
  left join public.bands b on b.profile_id = p.id
  where p.manage_token = p_token;

  if result is null then
    perform public.enforce_rate_limit('token_miss', 20, interval '10 minutes');
    raise exception 'Ungültiger Verwaltungslink.';
  end if;

  return result;
end;
$$;

create or replace function public.update_profile_by_token(p_token uuid, payload jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select id into target from public.profiles where manage_token = p_token;
  if target is null then
    perform public.enforce_rate_limit('token_miss', 20, interval '10 minutes');
    raise exception 'Ungültiger Verwaltungslink.';
  end if;

  update public.profiles set
    first_name    = trim(payload ->> 'first_name'),
    last_name     = trim(payload ->> 'last_name'),
    category      = payload ->> 'category',
    public_note   = nullif(trim(payload ->> 'public_note'), ''),
    medical_note  = nullif(trim(payload ->> 'medical_note'), ''),
    contact_name  = trim(payload ->> 'contact_name'),
    contact_phone = trim(payload ->> 'contact_phone'),
    contact_email = nullif(trim(payload ->> 'contact_email'), ''),
    updated_at    = now()
  where id = target;
end;
$$;

drop function if exists public.pending_profiles();

create function public.pending_profiles()
returns table (
  id         uuid,
  order_ref  text,
  first_name text,
  last_name  text,
  category   text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  return query
    select p.id, p.order_ref, p.first_name, p.last_name, p.category, p.created_at
    from public.profiles p
    left join public.bands b on b.profile_id = p.id
    where b.code is null
    order by p.created_at asc;
end;
$$;

revoke all on function public.pending_profiles() from public;
grant execute on function public.pending_profiles() to authenticated;

drop function if exists public.list_bands(text, text, int);

create function public.list_bands(
  p_status text default null,
  p_search text default null,
  p_limit  int  default 200
)
returns table (
  code          text,
  status        text,
  batch         text,
  created_at    timestamptz,
  assigned_at   timestamptz,
  first_name    text,
  last_name     text,
  category      text,
  order_ref     text,
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
      p.order_ref,
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
      )
    order by b.assigned_at desc nulls last, b.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_bands(text, text, int) from public;
grant execute on function public.list_bands(text, text, int) to authenticated;
