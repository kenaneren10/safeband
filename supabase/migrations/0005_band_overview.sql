-- SafeBand – Bänder-Übersicht für die Verwaltung
--
-- Bisher liess sich im Admin-Bereich nur die frisch erzeugte Charge sehen.
-- Nach einem Neuladen war der Bestand unsichtbar, und es gab keine Möglichkeit
-- nachzusehen, welches Band zu wem gehört oder welche Codes noch im Lager
-- liegen.
--
-- Ausgeliefert wird bewusst nur, was für Produktion und Versand nötig ist:
-- Vorname und Bestellnummer zum Wiedererkennen. Telefonnummer und E-Mail des
-- Notfallkontakts bleiben auch für die Verwaltung aussen vor – sie werden für
-- keinen der Handgriffe gebraucht.

create or replace function public.list_bands(
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
        or p.order_ref ilike '%' || needle || '%'
      )
    -- Zuletzt Zugeordnetes zuerst, danach der Lagerbestand nach Alter.
    order by b.assigned_at desc nulls last, b.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_bands(text, text, int) from public;
grant execute on function public.list_bands(text, text, int) to authenticated;
