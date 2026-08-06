-- SafeBand – Datenmodell
--
-- Zugriffsmodell: RLS ist auf allen Tabellen aktiv und es gibt bewusst KEINE
-- Policies für die Rolle `anon`. Die Webseite kommt ausschliesslich über die
-- SECURITY-DEFINER-Funktionen weiter unten an Daten. Dadurch kann der öffentliche
-- anon-Key selbst dann keine Kontaktdaten auslesen, wenn jemand ihn aus dem
-- JavaScript kopiert.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  order_ref     text check (char_length(order_ref) <= 40),
  first_name    text not null check (char_length(first_name) between 1 and 30),
  category      text not null check (category in ('kind', 'senior', 'pflege')),
  public_note   text check (char_length(public_note) <= 200),
  medical_note  text check (char_length(medical_note) <= 150),
  contact_name  text not null check (char_length(contact_name) between 1 and 60),
  contact_phone text not null check (char_length(contact_phone) between 4 and 20),
  contact_email text check (char_length(contact_email) <= 80),
  manage_token  uuid not null default gen_random_uuid(),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.profiles.manage_token is
  'Geheimer Link-Token, mit dem der Kunde sein Profil ohne Login ändern kann.';
comment on column public.profiles.medical_note is
  'Gesundheitsdaten (Art. 9 DSGVO) – nur mit ausdrücklicher Einwilligung befüllen.';

-- Physischer Bestand. Codes werden auf Vorrat erzeugt und auf die Chips
-- geschrieben, lange bevor eine Bestellung existiert.
create table public.bands (
  code        text primary key check (code ~ '^[A-Z0-9]{8}$'),
  profile_id  uuid references public.profiles(id) on delete set null,
  status      text not null default 'unassigned'
                check (status in ('unassigned', 'assigned', 'disabled')),
  batch       text,
  created_at  timestamptz not null default now(),
  assigned_at timestamptz
);

-- Ein Profil hängt an höchstens einem Band.
create unique index bands_profile_id_key
  on public.bands (profile_id) where profile_id is not null;
create index bands_status_idx on public.bands (status);

-- Nachweis der Einwilligung (Art. 7 Abs. 1 DSGVO / Art. 6 revDSG).
create table public.consents (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  scopes         text[] not null,
  user_agent     text,
  consented_at   timestamptz not null default now()
);

create index consents_profile_idx on public.consents (profile_id);

-- Meldungen, die Ersthelfer über die Notfallseite absetzen.
create table public.helper_messages (
  id          uuid primary key default gen_random_uuid(),
  band_code   text not null references public.bands(code) on delete cascade,
  helper_name text check (char_length(helper_name) <= 50),
  location    text not null check (char_length(location) between 1 and 120),
  message     text not null check (char_length(message) between 1 and 400),
  created_at  timestamptz not null default now()
);

create index helper_messages_band_idx on public.helper_messages (band_code, created_at desc);

-- Wer die Admin-Oberfläche benutzen darf.
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Generischer Zähler gegen Missbrauch (Code-Durchprobieren, Formular-Spam).
create table public.rate_limits (
  bucket       text primary key,
  hits         int not null default 0,
  window_start timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.bands           enable row level security;
alter table public.consents        enable row level security;
alter table public.helper_messages enable row level security;
alter table public.admins          enable row level security;
alter table public.rate_limits     enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Eingeloggte Admins sehen und bearbeiten alles; anon bekommt keine Policy und
-- damit keinen direkten Tabellenzugriff.
create policy admin_all_profiles on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_bands on public.bands
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_read_consents on public.consents
  for select to authenticated using (public.is_admin());
create policy admin_read_messages on public.helper_messages
  for select to authenticated using (public.is_admin());
create policy admin_read_own_admin_row on public.admins
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Crockford-Base32: ohne I, L, O und U. Dadurch gibt es keine Verwechslung
-- zwischen 0/O und 1/I, und die 32 Zeichen teilen 256 ohne Rest – das Modulo
-- unten ist deshalb verzerrungsfrei.
create or replace function public.gen_band_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes    bytea := gen_random_bytes(8);
  result   text := '';
  i        int;
begin
  for i in 0..7 loop
    result := result || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  end loop;
  return result;
end;
$$;

create or replace function public.request_header(p_name text)
returns text
language plpgsql
stable
as $$
declare
  headers json;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return headers ->> p_name;
end;
$$;

create or replace function public.client_ip_hash()
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  ip text := split_part(coalesce(public.request_header('x-forwarded-for'), ''), ',', 1);
begin
  if trim(ip) = '' then
    return 'unknown';
  end if;
  return encode(digest(trim(ip) || 'safeband', 'sha256'), 'hex');
end;
$$;

-- Zählt Zugriffe pro Schlüssel und wirft eine Ausnahme, sobald das Limit im
-- Zeitfenster überschritten ist. Der auslösende Aufruf wird mitsamt seinem
-- Zähler zurückgerollt, das Fenster bleibt dadurch gesperrt bis es abläuft.
create or replace function public.enforce_rate_limit(
  p_key    text,
  p_limit  int,
  p_window interval
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ip           text := public.client_ip_hash();
  bucket_key   text;
  current_hits int;
begin
  if ip = 'unknown' then
    return;
  end if;

  bucket_key := p_key || ':' || ip;

  insert into public.rate_limits (bucket, hits)
  values (bucket_key, 1)
  on conflict (bucket) do update
    set hits = case
                 when public.rate_limits.window_start < now() - p_window then 1
                 else public.rate_limits.hits + 1
               end,
        window_start = case
                 when public.rate_limits.window_start < now() - p_window then now()
                 else public.rate_limits.window_start
               end
  returning hits into current_hits;

  if current_hits > p_limit then
    raise exception 'Zu viele Anfragen. Bitte später erneut versuchen.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Öffentliche API (anon)
-- ---------------------------------------------------------------------------

-- Gibt bewusst NUR die für Ersthelfer freigegebenen Felder zurück.
-- Name, Telefon und E-Mail des Notfallkontakts verlassen die Datenbank nie.
create or replace function public.get_public_profile(p_code text)
returns table (
  first_name   text,
  category     text,
  public_note  text,
  medical_note text
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
    select p.first_name, p.category, p.public_note, p.medical_note
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

-- Wird nach dem Kauf vom Bestellformular aufgerufen. Legt Profil und
-- Einwilligungsnachweis in einer Transaktion an.
create or replace function public.create_profile(payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_profile public.profiles%rowtype;
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
    contact_name, contact_phone, contact_email
  )
  values (
    nullif(trim(payload ->> 'order_ref'), ''),
    trim(payload ->> 'first_name'),
    payload ->> 'category',
    nullif(trim(payload ->> 'public_note'), ''),
    nullif(trim(payload ->> 'medical_note'), ''),
    trim(payload ->> 'contact_name'),
    trim(payload ->> 'contact_phone'),
    nullif(trim(payload ->> 'contact_email'), '')
  )
  returning * into new_profile;

  insert into public.consents (profile_id, policy_version, scopes, user_agent)
  values (
    new_profile.id,
    coalesce(nullif(trim(payload ->> 'policy_version'), ''), 'unbekannt'),
    case
      when coalesce((payload ->> 'consent_health')::boolean, false)
      then array['datenverarbeitung', 'gesundheitsdaten']
      else array['datenverarbeitung']
    end,
    left(coalesce(public.request_header('user-agent'), ''), 300)
  );

  return jsonb_build_object(
    'profile_id',   new_profile.id,
    'manage_token', new_profile.manage_token,
    'order_ref',    new_profile.order_ref
  );
end;
$$;

create or replace function public.submit_helper_message(
  p_code        text,
  p_helper_name text,
  p_location    text,
  p_message     text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_code text;
begin
  perform public.enforce_rate_limit('helper_message', 10, interval '1 hour');

  select b.code into target_code
  from public.bands b
  join public.profiles p on p.id = b.profile_id
  where b.code = upper(trim(p_code)) and b.status = 'assigned' and p.active;

  if target_code is null then
    raise exception 'Unbekanntes Armband.';
  end if;

  insert into public.helper_messages (band_code, helper_name, location, message)
  values (
    target_code,
    nullif(trim(p_helper_name), ''),
    trim(p_location),
    trim(p_message)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Selbstverwaltung über den geheimen Token aus der Bestätigungs-E-Mail
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
           'first_name',    p.first_name,
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

-- Sofortabschaltung bei Verlust oder Diebstahl des Armbands.
create or replace function public.set_profile_active_by_token(p_token uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.profiles
  set active = p_active, updated_at = now()
  where manage_token = p_token;

  if not found then
    perform public.enforce_rate_limit('token_miss', 20, interval '10 minutes');
    raise exception 'Ungültiger Verwaltungslink.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin-API
-- ---------------------------------------------------------------------------

-- Erzeugt einen Vorrat an Codes für die Chip-Produktion.
create or replace function public.generate_bands(p_count int, p_batch text)
returns setof text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_code text;
  i        int;
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;
  if p_count is null or p_count < 1 or p_count > 500 then
    raise exception 'Bitte zwischen 1 und 500 Bänder erzeugen.';
  end if;

  for i in 1..p_count loop
    loop
      new_code := public.gen_band_code();
      exit when not exists (select 1 from public.bands where code = new_code);
    end loop;

    insert into public.bands (code, batch) values (new_code, nullif(trim(p_batch), ''));
    return next new_code;
  end loop;
end;
$$;

-- Der Handgriff beim Verpacken: gescanntes Band an die offene Bestellung hängen.
create or replace function public.assign_band(p_code text, p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  target_code text := upper(trim(p_code));
  band_status text;
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  select status into band_status from public.bands where code = target_code for update;

  if band_status is null then
    raise exception 'Band % ist nicht im Bestand.', target_code;
  end if;
  if band_status <> 'unassigned' then
    raise exception 'Band % ist bereits vergeben oder gesperrt.', target_code;
  end if;
  if exists (select 1 from public.bands where profile_id = p_profile_id) then
    raise exception 'Diese Bestellung hat bereits ein Band.';
  end if;

  update public.bands
  set profile_id = p_profile_id, status = 'assigned', assigned_at = now()
  where code = target_code;
end;
$$;

create or replace function public.set_band_status(p_code text, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;
  if p_status not in ('unassigned', 'assigned', 'disabled') then
    raise exception 'Unbekannter Status.';
  end if;

  update public.bands set status = p_status where code = upper(trim(p_code));

  if not found then
    raise exception 'Band nicht gefunden.';
  end if;
end;
$$;

-- Bestellungen, die noch auf ein Band warten.
create or replace function public.pending_profiles()
returns table (
  id         uuid,
  order_ref  text,
  first_name text,
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
    select p.id, p.order_ref, p.first_name, p.category, p.created_at
    from public.profiles p
    left join public.bands b on b.profile_id = p.id
    where b.code is null
    order by p.created_at asc;
end;
$$;

create or replace function public.band_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  return (
    select jsonb_object_agg(status, anzahl)
    from (select status, count(*) as anzahl from public.bands group by status) s
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------

-- Postgres vergibt EXECUTE standardmässig an PUBLIC – das muss weg, sonst wäre
-- jede Funktion oben auch ohne expliziten Grant für anon aufrufbar.
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_public_profile(text)                      to anon, authenticated;
grant execute on function public.create_profile(jsonb)                         to anon, authenticated;
grant execute on function public.submit_helper_message(text, text, text, text) to anon, authenticated;
grant execute on function public.get_profile_by_token(uuid)                    to anon, authenticated;
grant execute on function public.update_profile_by_token(uuid, jsonb)          to anon, authenticated;
grant execute on function public.set_profile_active_by_token(uuid, boolean)    to anon, authenticated;

grant execute on function public.generate_bands(int, text)   to authenticated;
grant execute on function public.assign_band(text, uuid)     to authenticated;
grant execute on function public.set_band_status(text, text) to authenticated;
grant execute on function public.pending_profiles()          to authenticated;
grant execute on function public.band_stats()                to authenticated;
grant execute on function public.is_admin()                  to authenticated;

-- ---------------------------------------------------------------------------
-- Demo-Datensatz für die Webseite
-- ---------------------------------------------------------------------------

do $$
declare
  demo_id uuid;
begin
  insert into public.profiles (
    first_name, category, public_note, medical_note,
    contact_name, contact_phone, contact_email
  )
  values (
    'Luca', 'kind',
    'Spricht Deutsch und Albanisch. Bitte ruhig ansprechen.',
    'Keine bekannten Allergien.',
    'Anna Müller (Mutter)', '+41 79 123 45 67', 'anna.mueller@beispiel.ch'
  )
  returning id into demo_id;

  insert into public.bands (code, profile_id, status, batch, assigned_at)
  values ('DEMO0001', demo_id, 'assigned', 'demo', now());
end;
$$;
