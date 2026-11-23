-- Applied as migration v3_013_student_file_principal_only.
-- "תיק תלמיד": a principal (principal.decide) without students.view sees ONLY the files of the
-- students that were sent to him (pending or decided), in the institutions of his role:
-- the student row, the log (interviews/calls; notes only with sensitive.notes), events,
-- the photo and the uploaded documents (only with sensitive.files). Nothing else.

create or replace function public.principal_sees(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sid is not null
     and public.has_perm('principal.decide')
     and exists (
       select 1 from public.principal_reviews r join public.students s on s.id = r.student_id
        where r.student_id = sid and r.status in ('pending', 'decided') and public.can_see_track(s.track))
$$;
revoke execute on function public.principal_sees(uuid) from public, anon;
grant execute on function public.principal_sees(uuid) to authenticated;

-- may the current user open this student (regular staff or principal-by-request)?
create or replace function public.can_open_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = sid
                  and ((public.has_perm('students.view') and public.can_see_track(s.track)) or public.principal_sees(s.id)))
$$;
revoke execute on function public.can_open_student(uuid) from public, anon;
grant execute on function public.can_open_student(uuid) to authenticated;

-- storage paths are "<student uuid>/<file>": safe cast of the first folder
create or replace function public.path_student(p text) returns uuid
language sql immutable set search_path = public as $$
  select case when split_part(p, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(p, '/', 1)::uuid end
$$;

drop policy if exists "students read" on public.students;
create policy "students read" on public.students for select to authenticated using (
  ((select public.has_perm('students.view')) and public.can_see_track(track))
  or ((select public.has_perm('principal.decide')) and public.principal_sees(id)));

drop policy if exists "log read" on public.student_log;
create policy "log read" on public.student_log for select to authenticated using (
  ((select public.has_perm('students.view')) or ((select public.has_perm('principal.decide')) and public.principal_sees(student_id)))
  and (kind <> 'note' or (select public.has_perm('sensitive.notes'))));

drop policy if exists "appts read" on public.appointments;
create policy "appts read" on public.appointments for select to authenticated using (
  (select public.has_perm('students.view')) or ((select public.has_perm('principal.decide')) and public.principal_sees(student_id)));

drop policy if exists "files read" on storage.objects;
create policy "files read" on storage.objects for select to authenticated using (
  (bucket_id = 'student-photos' and public.can_open_student(public.path_student(name)))
  or (bucket_id = 'student-docs' and (select public.has_perm('sensitive.files')) and public.can_open_student(public.path_student(name))));

-- the Metivta principal: only the files sent to him, with documents and internal notes
update public.roles
   set perms = (perms - 'students.view') || '{"principal.decide": true, "sensitive.files": true, "sensitive.notes": true}'::jsonb,
       updated_at = now()
 where name = 'מנהל המתיבתא';
