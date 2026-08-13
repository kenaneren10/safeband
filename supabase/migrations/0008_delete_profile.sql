create or replace function public.delete_profile(p_profile_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  has_band boolean;
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  select exists(select 1 from public.bands where profile_id = p_profile_id) into has_band;
  if has_band then
    raise exception 'Profil ist einem Band zugeordnet und kann nicht gelöscht werden.';
  end if;

  delete from public.profiles where id = p_profile_id;

  if not found then
    raise exception 'Profil nicht gefunden.';
  end if;
end;
$$;

revoke all on function public.delete_profile(uuid) from public;
grant execute on function public.delete_profile(uuid) to authenticated;
