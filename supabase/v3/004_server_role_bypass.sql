-- Trusted server context (direct SQL / migrations / service_role key) passes role checks.
-- Browser users always carry a JWT: anon → role 'anon' (blocked), staff → checked by profile.
create or replace function public.has_role(min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null and coalesce(auth.role(), 'service_role') = 'service_role' then true
    else public.role_rank(public.my_role()) >= public.role_rank(min_role)
  end
$$;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.has_role(text) to authenticated;
