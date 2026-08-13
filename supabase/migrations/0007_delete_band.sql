create or replace function public.delete_band(p_code text)
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
    raise exception 'Band nicht gefunden.';
  end if;
  if band_status = 'assigned' then
    raise exception 'Band ist im Einsatz und kann nicht gelöscht werden.';
  end if;

  delete from public.bands where code = target_code;
end;
$$;

revoke all on function public.delete_band(text) from public;
grant execute on function public.delete_band(text) to authenticated;
