drop function if exists public.list_profiles(text, int);

create function public.list_profiles(
  p_search text default null,
  p_limit  int  default 200
)
returns table (
  id            uuid,
  first_name    text,
  last_name     text,
  category      text,
  order_ref     text,
  contact_phone text,
  contact_email text,
  created_at    timestamptz,
  band_code     text,
  band_status   text
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
      p.id, p.first_name, p.last_name, p.category, p.order_ref,
      p.contact_phone, p.contact_email, p.created_at,
      b.code, b.status
    from public.profiles p
    left join public.bands b on b.profile_id = p.id
    where needle is null
       or p.first_name ilike '%' || needle || '%'
       or p.last_name ilike '%' || needle || '%'
       or p.order_ref ilike '%' || needle || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_profiles(text, int) from public;
grant execute on function public.list_profiles(text, int) to authenticated;
