-- SafeBand – Notfallnummer direkt anrufbar machen (opt-in)
--
-- Bisher hat `get_public_profile` die Kontaktdaten grundsätzlich nicht
-- ausgeliefert. Ein Anruf-Knopf braucht die Nummer aber im Klartext auf der
-- Seite, und damit sieht sie jede Person, die das Band scannt.
--
-- Deshalb entscheidet der Kunde selbst: ohne ausdrückliche Freigabe bleibt es
-- beim bisherigen Verhalten, die Datenbank gibt Name und Nummer gar nicht erst
-- heraus. Die Entscheidung liegt in der Datenbank und nicht im Frontend – wer
-- am JavaScript manipuliert, kommt so trotzdem nicht an die Nummer.

alter table public.profiles
  add column if not exists contact_call_public boolean not null default false;

comment on column public.profiles.contact_call_public is
  'Freigabe des Kunden, Name und Telefonnummer des Notfallkontakts auf der '
  'Notfallseite anzuzeigen. Ohne Freigabe liefert get_public_profile beides '
  'als NULL aus.';

-- ---------------------------------------------------------------------------
-- Öffentliche Notfallseite
-- ---------------------------------------------------------------------------

-- Der Rückgabetyp wächst um zwei Spalten, deshalb muss die Funktion weichen.
drop function if exists public.get_public_profile(text);

create function public.get_public_profile(p_code text)
returns table (
  first_name    text,
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

  -- Nur Fehlgriffe zählen: echtes Scannen am Band soll nie limitiert werden.
  if hits = 0 then
    perform public.enforce_rate_limit('lookup_miss', 20, interval '10 minutes');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Einwilligung beim Einrichten
-- ---------------------------------------------------------------------------

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

  -- Ein medizinischer Hinweis ist ein Gesundheitsdatum und braucht nach
  -- Art. 9 Abs. 2 lit. a DSGVO eine separate, ausdrückliche Einwilligung.
  if coalesce(nullif(trim(payload ->> 'medical_note'), ''), '') <> ''
     and coalesce((payload ->> 'consent_health')::boolean, false) is not true then
    raise exception 'Für medizinische Angaben ist eine ausdrückliche Einwilligung nötig.';
  end if;

  insert into public.profiles (
    order_ref, first_name, category, public_note, medical_note,
    contact_name, contact_phone, contact_email, contact_call_public
  )
  values (
    nullif(trim(payload ->> 'order_ref'), ''),
    trim(payload ->> 'first_name'),
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
    scopes := scopes || 'gesundheitsdaten';
  end if;

  if wants_call then
    scopes := scopes || 'notfallnummer_oeffentlich';
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

-- ---------------------------------------------------------------------------
-- Selbstverwaltung: Freigabe jederzeit widerrufbar (Art. 7 Abs. 3 DSGVO)
-- ---------------------------------------------------------------------------

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
           'first_name',          p.first_name,
           'category',            p.category,
           'public_note',         p.public_note,
           'medical_note',        p.medical_note,
           'contact_name',        p.contact_name,
           'contact_phone',       p.contact_phone,
           'contact_email',       p.contact_email,
           'contact_call_public', p.contact_call_public,
           'active',              p.active,
           'band_code',           b.code
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
    first_name          = trim(payload ->> 'first_name'),
    category            = payload ->> 'category',
    public_note         = nullif(trim(payload ->> 'public_note'), ''),
    medical_note        = nullif(trim(payload ->> 'medical_note'), ''),
    contact_name        = trim(payload ->> 'contact_name'),
    contact_phone       = trim(payload ->> 'contact_phone'),
    contact_email       = nullif(trim(payload ->> 'contact_email'), ''),
    contact_call_public = coalesce((payload ->> 'contact_call_public')::boolean, false),
    updated_at          = now()
  where id = target;
end;
$$;

-- Die neu erstellte Funktion hat die Rechte der alten nicht geerbt.
revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;

-- Damit sich der Anruf-Knopf am Demo-Band ausprobieren lässt.
update public.profiles p
set contact_call_public = true
from public.bands b
where b.profile_id = p.id and b.code = 'DEMO0001';
