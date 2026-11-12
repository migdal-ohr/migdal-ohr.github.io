-- trigger functions are never called directly
revoke execute on function public.tg_touch() from public, anon, authenticated;
revoke execute on function public.tg_students_created_by() from public, anon, authenticated;
revoke execute on function public.tg_students_role_guard() from public, anon, authenticated;
revoke execute on function public.tg_audit() from public, anon, authenticated;
revoke execute on function public.tg_activity_actor() from public, anon, authenticated;
revoke execute on function public.tg_new_auth_user() from public, anon, authenticated;
-- role helpers: signed-in only
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.has_role(text) to authenticated;
revoke execute on function public.start_school_year(text, boolean) from public, anon;
revoke execute on function public.student_history(uuid, int) from public, anon;
-- extension out of the public schema
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
