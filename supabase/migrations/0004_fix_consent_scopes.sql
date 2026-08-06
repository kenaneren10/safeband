-- SafeBand – Korrektur zu 0003
--
-- In 0003 wurden die Einwilligungs-Bereiche mit `scopes || 'text'` angehängt.
-- Der `||`-Operator ist für Arrays doppelt belegt (Array plus Element und
-- Array plus Array). Ein Literal ohne festen Typ lässt Postgres auf die
-- zweite Variante schliessen, es versucht die Zeichenkette als Array zu lesen
-- und bricht mit `malformed array literal` ab – das Anlegen eines Profils
-- schlug dadurch immer fehl.
--
-- array_append ist eindeutig und hat das Problem nicht.

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
