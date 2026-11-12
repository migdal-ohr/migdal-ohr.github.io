-- =====================================================================
-- v3 functions (RPC). All run with the caller's rights unless noted,
-- so Row Level Security + role checks still apply.
-- =====================================================================

-- Partial update by the app's camelCase field names. Only keys present in
-- p_patch change; documents / stations maps are merged key-by-key, so two
-- secretaries editing different things never overwrite each other.
create or replace function public.patch_student(p_id uuid, p_patch jsonb)
returns public.students
language plpgsql
set search_path = public
as $$
declare
  s public.students;
  p jsonb := p_patch;
  t text;
begin
  select * into s from public.students where id = p_id for update;
  if not found then raise exception 'student not found' using errcode = 'P0002'; end if;

  if p ? 'firstName'         then s.first_name        := coalesce(p->>'firstName', ''); end if;
  if p ? 'lastName'          then s.last_name         := coalesce(p->>'lastName', ''); end if;
  if p ? 'studentId'         then s.id_number         := nullif(regexp_replace(coalesce(p->>'studentId',''), '\D', '', 'g'), ''); end if;
  if p ? 'birthDate'         then s.birth_date        := nullif(p->>'birthDate', '')::date; end if;
  if p ? 'city'              then s.city              := nullif(trim(p->>'city'), ''); end if;
  if p ? 'grade'             then s.grade             := (p->>'grade')::smallint; end if;
  if p ? 'registrationTrack' then s.track             := nullif(p->>'registrationTrack', ''); end if;
  if p ? 'stage'             then s.stage             := p->>'stage'; end if;
  if p ? 'familyStatus'      then s.family_status     := coalesce(p->>'familyStatus', 'married'); end if;
  if p ? 'fatherName'        then s.father_name       := nullif(trim(p->>'fatherName'), ''); end if;
  if p ? 'fatherPhone'       then s.father_phone      := nullif(trim(p->>'fatherPhone'), ''); end if;
  if p ? 'fatherEmployment'  then s.father_employment := coalesce(p->>'fatherEmployment', 'na'); end if;
  if p ? 'fatherAvrech'      then s.father_avrech     := coalesce((p->>'fatherAvrech')::boolean, false); end if;
  if p ? 'motherName'        then s.mother_name       := nullif(trim(p->>'motherName'), ''); end if;
  if p ? 'motherPhone'       then s.mother_phone      := nullif(trim(p->>'motherPhone'), ''); end if;
  if p ? 'motherEmployment'  then s.mother_employment := coalesce(p->>'motherEmployment', 'na'); end if;
  if p ? 'optionalDocs'      then s.optional_docs     := coalesce(array(select jsonb_array_elements_text(p->'optionalDocs')), '{}'); end if;
  if p ? 'documents'         then s.documents         := s.documents || coalesce(p->'documents', '{}'::jsonb); end if;
  if p ? 'stations'          then s.stations          := s.stations  || coalesce(p->'stations', '{}'::jsonb); end if;
  if p ? 'files'             then s.files             := coalesce(p->'files', '{}'::jsonb); end if;
  if p ? 'notes'             then s.notes             := nullif(p->>'notes', ''); end if;
  if p ? 'hesitationReason'  then s.hesitation_reason := nullif(p->>'hesitationReason', ''); end if;
  if p ? 'photoPath'         then s.photo_path        := nullif(p->>'photoPath', ''); end if;
  if p ? 'source'            then s.source            := nullif(p->>'source', ''); end if;
  if p ? 'rsvpStatus'        then s.rsvp_status       := coalesce(p->>'rsvpStatus', 'pending'); end if;
  if p ? 'isArchived'        then s.is_archived       := coalesce((p->>'isArchived')::boolean, false); end if;
  if p ? 'schoolYearId'      then s.school_year_id    := (p->>'schoolYearId')::uuid; end if;

  update public.students set
    first_name = s.first_name, last_name = s.last_name, id_number = s.id_number, birth_date = s.birth_date,
    city = s.city, grade = s.grade, track = s.track, stage = s.stage, family_status = s.family_status,
    father_name = s.father_name, father_phone = s.father_phone, father_employment = s.father_employment,
    father_avrech = s.father_avrech, mother_name = s.mother_name, mother_phone = s.mother_phone,
    mother_employment = s.mother_employment, optional_docs = s.optional_docs, documents = s.documents,
    stations = s.stations, files = s.files, notes = s.notes, hesitation_reason = s.hesitation_reason,
    photo_path = s.photo_path, source = s.source, rsvp_status = s.rsvp_status, is_archived = s.is_archived,
    school_year_id = s.school_year_id
  where id = p_id
  returning * into s;
  return s;
end $$;
grant execute on function public.patch_student(uuid, jsonb) to authenticated;

-- Insert from the app's camelCase shape (single or bulk via jsonb array)
create or replace function public.insert_students(p_rows jsonb)
returns setof public.students
language plpgsql
set search_path = public
as $$
declare
  r jsonb;
  s public.students;
begin
  if not public.has_role('secretary') then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else jsonb_build_array(p_rows) end) loop
    insert into public.students (
      school_year_id, first_name, last_name, id_number, birth_date, city, grade, track, stage,
      family_status, father_name, father_phone, father_employment, father_avrech,
      mother_name, mother_phone, mother_employment, optional_docs, documents, stations, files,
      notes, hesitation_reason, photo_path, source, rsvp_status, is_archived
    ) values (
      coalesce((r->>'schoolYearId')::uuid, (select id from public.school_years where is_current)),
      coalesce(r->>'firstName', ''), coalesce(r->>'lastName', ''),
      nullif(regexp_replace(coalesce(r->>'studentId',''), '\D', '', 'g'), ''),
      nullif(r->>'birthDate', '')::date, nullif(trim(r->>'city'), ''),
      coalesce((r->>'grade')::smallint, 7), nullif(r->>'registrationTrack', ''), coalesce(r->>'stage', 'leads'),
      coalesce(r->>'familyStatus', 'married'), nullif(trim(r->>'fatherName'), ''), nullif(trim(r->>'fatherPhone'), ''),
      coalesce(r->>'fatherEmployment', 'na'), coalesce((r->>'fatherAvrech')::boolean, false),
      nullif(trim(r->>'motherName'), ''), nullif(trim(r->>'motherPhone'), ''), coalesce(r->>'motherEmployment', 'na'),
      coalesce(array(select jsonb_array_elements_text(r->'optionalDocs')), '{}'),
      coalesce(r->'documents', '{}'::jsonb), coalesce(r->'stations', '{}'::jsonb), coalesce(r->'files', '{}'::jsonb),
      nullif(r->>'notes', ''), nullif(r->>'hesitationReason', ''), nullif(r->>'photoPath', ''), nullif(r->>'source', ''),
      coalesce(r->>'rsvpStatus', 'pending'), coalesce((r->>'isArchived')::boolean, false)
    ) returning * into s;
    return next s;
  end loop;
end $$;
grant execute on function public.insert_students(jsonb) to authenticated;

-- The single registration meeting of a student (null clears it).
create or replace function public.set_student_appointment(p_student_id uuid, p_starts_at timestamptz, p_type text default 'פגישת רישום')
returns uuid
language plpgsql
set search_path = public
as $$
declare v_old timestamptz; v_id uuid;
begin
  if not public.has_role('secretary') then raise exception 'not allowed' using errcode = '42501'; end if;
  select starts_at into v_old from public.appointments where student_id = p_student_id;
  if p_starts_at is null then
    delete from public.appointments where student_id = p_student_id;
    return null;
  end if;
  insert into public.appointments (student_id, starts_at, type, created_by)
  values (p_student_id, p_starts_at, coalesce(p_type, 'פגישת רישום'), auth.uid())
  on conflict (student_id) do update set starts_at = excluded.starts_at, type = excluded.type
  returning id into v_id;
  if v_old is distinct from p_starts_at then
    update public.students set rsvp_status = 'pending' where id = p_student_id;
  end if;
  update public.students set stage = 'meeting' where id = p_student_id and stage = 'leads';
  return v_id;
end $$;
grant execute on function public.set_student_appointment(uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------
-- Public (anonymous) endpoints — token-protected / validated
-- ---------------------------------------------------------------------
create or replace function public.get_rsvp(p_token uuid)
returns table (first_name text, appointment_date timestamptz, rsvp_status text)
language sql stable security definer set search_path = public as $$
  select s.first_name, a.starts_at, s.rsvp_status
    from public.students s left join public.appointments a on a.student_id = s.id
   where s.rsvp_token = p_token and not s.is_archived
   limit 1
$$;

create or replace function public.submit_rsvp(p_token uuid, p_status text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_name text;
  v_status text := case when p_status = 'reschedule_requested' then 'reschedule_requested' else 'confirmed' end;
begin
  select id, trim(first_name || ' ' || last_name) into v_id, v_name
    from public.students where rsvp_token = p_token and not is_archived;
  if v_id is null then raise exception 'invalid token' using errcode = 'P0002'; end if;
  update public.students set rsvp_status = v_status where id = v_id;
  insert into public.activity_logs (action_type, description, student_id)
  values (case when v_status = 'confirmed' then 'rsvp_confirmed' else 'rsvp_reschedule' end,
          case when v_status = 'confirmed' then v_name || ' אישר/ה הגעה!' else 'משפחת ' || v_name || ' ביקשה מועד חדש' end,
          v_id);
  return v_status;
end $$;

create or replace function public.public_register(p jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_first text := left(trim(coalesce(p->>'firstName', '')), 40);
  v_last  text := left(trim(coalesce(p->>'lastName', '')), 40);
  v_sid   text := left(regexp_replace(coalesce(p->>'studentId', ''), '\D', '', 'g'), 9);
  v_grade int  := coalesce(nullif(p->>'grade', '')::int, 0);
  v_track text := coalesce(p->>'registrationTrack', '');
  v_fph   text := left(regexp_replace(coalesce(p->>'fatherPhone', ''), '[^0-9+-]', '', 'g'), 15);
  v_mph   text := left(regexp_replace(coalesce(p->>'motherPhone', ''), '[^0-9+-]', '', 'g'), 15);
  v_id uuid;
begin
  if v_first = '' or v_last = '' then raise exception 'name required'; end if;
  if v_fph = '' and v_mph = '' then raise exception 'phone required'; end if;
  if v_grade < 1 or v_grade > 12 then raise exception 'bad grade'; end if;
  if v_track not in ('metivta','yeshiva_ketana','maor_israel') then v_track := null; end if;
  if v_sid ~ '^0+$' or length(v_sid) < 5 then v_sid := ''; end if;
  if (select count(*) from public.public_form_hits where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate limited';
  end if;
  insert into public.public_form_hits default values;

  if v_sid <> '' then
    select id into v_id from public.students
     where id_number = v_sid and school_year_id = (select id from public.school_years where is_current) limit 1;
    if v_id is not null then
      insert into public.activity_logs (action_type, description, student_id)
      values ('web_registration', 'טופס הרשמה נשלח שוב עבור ' || v_first || ' ' || v_last || ' (כבר קיים במערכת)', v_id);
      return 'exists';
    end if;
  end if;

  insert into public.students (school_year_id, first_name, last_name, id_number, grade, track, city,
                               father_name, father_phone, mother_name, mother_phone, notes, stage, source)
  values ((select id from public.school_years where is_current), v_first, v_last, nullif(v_sid, ''), v_grade, v_track,
          nullif(left(trim(coalesce(p->>'city','')), 40), ''),
          nullif(left(trim(coalesce(p->>'fatherName','')), 40), ''), nullif(v_fph, ''),
          nullif(left(trim(coalesce(p->>'motherName','')), 40), ''), nullif(v_mph, ''),
          nullif(trim('נרשם דרך טופס ההרשמה באתר. ' || left(coalesce(p->>'notes', ''), 500)), 'נרשם דרך טופס ההרשמה באתר.'),
          'leads', 'web_form')
  returning id into v_id;
  insert into public.activity_logs (action_type, description, student_id)
  values ('web_registration', 'נרשם דרך הטופס באתר: ' || v_first || ' ' || v_last, v_id);
  return 'ok';
end $$;

revoke all on function public.get_rsvp(uuid) from public;
revoke all on function public.submit_rsvp(uuid, text) from public;
revoke all on function public.public_register(jsonb) from public;
grant execute on function public.get_rsvp(uuid) to anon, authenticated;
grant execute on function public.submit_rsvp(uuid, text) to anon, authenticated;
grant execute on function public.public_register(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- School-year rollover (managers): open a new season and optionally
-- carry over everyone who has not finished (leads/meeting/documents/persuasion)
-- ---------------------------------------------------------------------
create or replace function public.start_school_year(p_name text, p_carry_over boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_new uuid; n int := 0;
begin
  if not public.has_role('manager') then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into v_old from public.school_years where is_current;
  update public.school_years set is_current = false where is_current;
  insert into public.school_years (name, is_current) values (p_name, true)
  on conflict (name) do update set is_current = true
  returning id into v_new;
  if p_carry_over and v_old is not null and v_old <> v_new then
    with moved as (
      update public.students set school_year_id = v_new
       where school_year_id = v_old and not is_archived and stage <> 'complete'
      returning 1)
    select count(*) into n from moved;
  end if;
  insert into public.activity_logs (action_type, description)
  values ('school_year', 'נפתחה שנת רישום ' || p_name || case when n > 0 then ' (הועברו ' || n || ' תלמידים שלא סיימו)' else '' end);
  return v_new;
end $$;
grant execute on function public.start_school_year(text, boolean) to authenticated;

-- History of one student (managers): audit rows with actor names
create or replace function public.student_history(p_student_id uuid, p_limit int default 100)
returns table (at timestamptz, op text, changed jsonb, actor text)
language sql stable security definer set search_path = public as $$
  select a.at, a.op, a.changed, coalesce(nullif(p.full_name, ''), p.email, 'מערכת')
    from public.audit_log a left join public.profiles p on p.user_id = a.actor_id
   where a.row_id = p_student_id and public.has_role('manager')
   order by a.at desc limit p_limit
$$;
grant execute on function public.student_history(uuid, int) to authenticated;

-- ---------------------------------------------------------------------
-- Storage buckets (private) + role-based access
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('student-photos', 'student-photos', false, 5242880),
       ('student-docs',   'student-docs',   false, 15728640)
on conflict (id) do nothing;

create policy "staff read files"   on storage.objects for select to authenticated
  using (bucket_id in ('student-photos','student-docs') and public.has_role('viewer'));
create policy "secretary add files" on storage.objects for insert to authenticated
  with check (bucket_id in ('student-photos','student-docs') and public.has_role('secretary'));
create policy "secretary del files" on storage.objects for delete to authenticated
  using (bucket_id in ('student-photos','student-docs') and public.has_role('secretary'));

-- ---------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------
insert into public.school_years (name, starts_on, ends_on, is_current)
values ('תשפ"ח', '2027-09-01', '2028-08-31', true)
on conflict (name) do nothing;

insert into public.app_settings (key, value) values
  ('institution', '{"name":"מוסדות מגדל אור","city":"מגדל העמק","address":"רחוב הרב בוסקילה 10, מגדל העמק","signature":"צוות רישום מגדל אור"}'::jsonb)
on conflict (key) do nothing;
