-- =====================================================================
-- v3_010: custom roles with fine-grained permissions + phase 3 schema
-- (richer student card, institutions, recruiters, schools/cities,
--  calendar event kinds, student log, siblings).
-- =====================================================================

-- ---------- 1. roles & permissions ----------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text unique,                       -- set for the 5 built-in roles
  name        text not null unique check (length(trim(name)) between 2 and 60),
  description text check (length(description) <= 300),
  is_admin    boolean not null default false,    -- full access, cannot be restricted
  perms       jsonb not null default '{}'::jsonb,-- { "students.view": true, ... }
  institutions text[] not null default '{}',     -- empty = every institution
  sort        int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into public.roles (key, name, description, is_admin, perms, sort) values
 ('admin', 'מנהל מערכת', 'הכל, כולל משתמשים, תפקידים והגדרות', true, '{}', 1),
 ('manager', 'מנהל/ת רישום', 'הכל על הנתונים, כולל מחיקה ופתיחת שנת רישום', false, '{
   "students.view":true,"students.add":true,"students.edit":true,"students.status":true,"students.archive":true,"students.delete":true,
   "sensitive.notes":true,"sensitive.files":true,"export":true,
   "appointments.manage":true,"appointments.attendance":true,"stations.mark":true,"interviews.write":true,
   "whatsapp.send":true,"print.forms":true,"print.reports":true,"potentials.view":true,"potentials.edit":true,
   "admin.years":true,"admin.lists":true,"admin.audit":true,"requests.handle":true}', 2),
 ('secretary', 'מזכירה', 'הוספה, עריכה, פגישות, וואטסאפ וארכיון. בלי מחיקה סופית', false, '{
   "students.view":true,"students.add":true,"students.edit":true,"students.status":true,"students.archive":true,
   "sensitive.notes":true,"sensitive.files":true,"export":true,
   "appointments.manage":true,"appointments.attendance":true,"stations.mark":true,"interviews.write":true,
   "whatsapp.send":true,"print.forms":true,"print.reports":true,"potentials.view":true,"potentials.edit":true}', 3),
 ('interviewer', 'מראיין (תחנות בלבד)', 'צפייה, סימון תחנות וכתיבת סיכומי ראיון', false, '{
   "students.view":true,"stations.mark":true,"interviews.write":true,"appointments.attendance":true}', 4),
 ('viewer', 'צפייה בלבד', 'צפייה בלבד, בלי שינויים', false, '{"students.view":true,"potentials.view":true}', 5)
on conflict (key) do nothing;

alter table public.profiles add column if not exists role_id uuid references public.roles(id);
update public.profiles p set role_id = r.id from public.roles r where r.key = p.role and p.role_id is null;
update public.profiles p set role_id = (select id from public.roles where key = 'viewer') where role_id is null;
alter table public.profiles alter column role_id set not null;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add column if not exists institutions text[] not null default '{}';   -- personal default filter
alter table public.profiles add column if not exists calendar_token uuid not null default gen_random_uuid();

-- keep the legacy text column in step (role key, or 'custom')
create or replace function public.tg_profiles_role_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.role := coalesce((select key from public.roles where id = new.role_id), 'custom');
  return new;
end $$;
revoke execute on function public.tg_profiles_role_sync() from public, anon, authenticated;
drop trigger if exists profiles_role_sync on public.profiles;
create trigger profiles_role_sync before insert or update of role_id on public.profiles for each row execute function public.tg_profiles_role_sync();

-- permission check used by every policy. Trusted server context passes.
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null and coalesce(auth.role(), 'service_role') = 'service_role' then true
    else coalesce((
      select r.is_admin or coalesce((r.perms ->> p)::boolean, false)
        from public.profiles pr join public.roles r on r.id = pr.role_id
       where pr.user_id = auth.uid() and pr.is_active), false)
  end
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null and coalesce(auth.role(), 'service_role') = 'service_role' then true
    else coalesce((select r.is_admin from public.profiles pr join public.roles r on r.id = pr.role_id
                    where pr.user_id = auth.uid() and pr.is_active), false)
  end
$$;
-- institutions this user's role may see; NULL = all
create or replace function public.my_institutions() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    else (select case when r.is_admin or cardinality(r.institutions) = 0 then null else r.institutions end
            from public.profiles pr join public.roles r on r.id = pr.role_id
           where pr.user_id = auth.uid() and pr.is_active)
  end
$$;
create or replace function public.can_see_track(t text) returns boolean
language sql stable set search_path = public as $$
  select t is null or (select public.my_institutions()) is null or t = any(public.my_institutions())
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and is_active)
$$;
-- legacy helpers now follow the new roles
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select r.key from public.profiles pr join public.roles r on r.id = pr.role_id
                    where pr.user_id = auth.uid() and pr.is_active), '')
$$;

revoke all on function public.has_perm(text), public.is_admin(), public.my_institutions(), public.can_see_track(text), public.is_staff() from public, anon;
grant execute on function public.has_perm(text), public.is_admin(), public.my_institutions(), public.can_see_track(text), public.is_staff() to authenticated;

-- built-in admin role can never be locked down or deleted
create or replace function public.tg_roles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.key is not null then raise exception 'built-in role cannot be deleted' using errcode = '42501'; end if;
    if exists (select 1 from public.profiles where role_id = old.id) then
      raise exception 'role in use' using errcode = '23503';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.key = 'admin' then
    new.is_admin := true; new.key := 'admin'; new.institutions := '{}';
  end if;
  if tg_op = 'UPDATE' and old.key is not null then new.key := old.key; end if;
  if tg_op = 'INSERT' then new.key := null; new.is_admin := false; end if;  -- custom roles are never super-admin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.tg_roles_guard() from public, anon, authenticated;
drop trigger if exists roles_guard on public.roles;
create trigger roles_guard before insert or update or delete on public.roles for each row execute function public.tg_roles_guard();

-- new auth users get a role from app_metadata (initial_role_id, or legacy initial_role key)
create or replace function public.tg_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role uuid;
begin
  v_role := coalesce(
    (select id from public.roles where id::text = new.raw_app_meta_data ->> 'initial_role_id'),
    (select id from public.roles where key = new.raw_app_meta_data ->> 'initial_role'),
    (select id from public.roles where key = 'viewer'));
  insert into public.profiles (user_id, email, full_name, role_id, is_active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''), v_role, true)
  on conflict (user_id) do nothing;
  return new;
end $$;

-- ---------- 2. phase 3 data ----------
alter table public.students add column if not exists details jsonb not null default '{}'::jsonb;
create index if not exists students_family_group_idx on public.students ((details->>'familyGroup')) where details ? 'familyGroup';
alter table public.students drop constraint if exists students_family_status_check;
alter table public.students add constraint students_family_status_check
  check (family_status in ('married','divorced','separated','single','single_father','widowed','unknown'));
alter table public.students drop constraint if exists students_father_employment_check;
alter table public.students add constraint students_father_employment_check
  check (father_employment in ('salaried','self_employed','unemployed','pensioner','other','na'));
alter table public.students drop constraint if exists students_mother_employment_check;
alter table public.students add constraint students_mother_employment_check
  check (mother_employment in ('salaried','self_employed','unemployed','housewife','pensioner','other','na'));

create table if not exists public.institutions (
  key              text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name             text not null,
  phone            text,
  principal        text,
  principal_mobile text,
  city             text,
  sort             int not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
insert into public.institutions (key, name, city, sort) values
  ('metivta', 'מתיבתא', 'מגדל העמק', 1),
  ('yeshiva_ketana', 'ישיבה קטנה', 'מגדל העמק', 2),
  ('maor_israel', 'מאור ישראל', 'מגדל העמק', 3)
on conflict (key) do nothing;
alter table public.students drop constraint if exists students_track_check;
alter table public.students drop constraint if exists students_track_fk;
alter table public.students add constraint students_track_fk foreign key (track) references public.institutions(key) on update cascade;

create table if not exists public.recruiters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 2 and 80),
  phone      text,
  user_id    uuid references auth.users(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.schools (
  id         uuid primary key default gen_random_uuid(),
  symbol     text unique,
  name       text not null,
  city       text,
  created_at timestamptz not null default now()
);
create index if not exists schools_city_idx on public.schools (city);
create table if not exists public.cities (
  code    int primary key,
  name_he text not null,
  name_en text
);
create index if not exists cities_name_idx on public.cities (name_he);

alter table public.appointments add column if not exists kind text not null default 'registration';
alter table public.appointments drop constraint if exists appointments_kind_check;
alter table public.appointments add constraint appointments_kind_check check (kind in ('registration','tour','interview','registration_day','other'));
alter table public.appointments add column if not exists attended boolean;
alter table public.appointments add column if not exists notes text check (length(notes) <= 1000);
alter table public.appointments drop constraint if exists appointments_student_id_key;
create unique index if not exists appointments_one_registration on public.appointments (student_id) where kind = 'registration';
create index if not exists appointments_student_idx on public.appointments (student_id, starts_at);

create table if not exists public.student_log (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  kind         text not null check (kind in ('call','interview','note')),
  at           timestamptz not null default now(),
  subtype      text check (length(subtype) <= 60),
  participant  text check (length(participant) <= 120),
  summary      text not null default '' check (length(summary) <= 4000),
  followup_on  date,
  mentions     uuid[] not null default '{}',
  author_id    uuid references auth.users(id) on delete set null,
  author_name  text,
  created_at   timestamptz not null default now()
);
create index if not exists student_log_student_idx on public.student_log (student_id, at desc);
create index if not exists student_log_mentions_idx on public.student_log using gin (mentions);
create index if not exists student_log_author_idx on public.student_log (author_id);
create or replace function public.tg_student_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := (select coalesce(nullif(full_name, ''), email) from public.profiles where user_id = auth.uid());
    if new.kind = 'note' and not public.has_perm('sensitive.notes') then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.kind = 'interview' and not public.has_perm('interviews.write') then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.kind = 'call' and not public.has_perm('students.edit') then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.tg_student_log() from public, anon, authenticated;
drop trigger if exists student_log_author on public.student_log;
create trigger student_log_author before insert on public.student_log for each row execute function public.tg_student_log();

-- ---------- 3. write guards (field-level permissions) ----------
create or replace function public.tg_students_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text; o jsonb; n jsonb; dk text; need text;
begin
  if auth.uid() is null then return new; end if;
  if not public.can_see_track(new.track) then raise exception 'institution not allowed' using errcode = '42501'; end if;
  o := to_jsonb(old) - 'updated_at' - 'version' - 'updated_by';
  n := to_jsonb(new) - 'updated_at' - 'version' - 'updated_by';
  for k in select jsonb_object_keys(n) loop
    continue when (o -> k) is not distinct from (n -> k);
    need := case k
      when 'stations' then 'stations.mark'
      when 'stage' then 'students.status'
      when 'is_archived' then 'students.archive'
      when 'rsvp_status' then 'appointments.manage'
      else 'students.edit' end;
    if k = 'details' then
      -- outcome & enrolment dates count as "status"; everything else in details is "edit"
      need := 'students.status';
      for dk in select jsonb_object_keys(coalesce(o->'details','{}') || coalesce(n->'details','{}')) loop
        if (o->'details'->dk) is distinct from (n->'details'->dk) and dk not in ('outcome','startDate','endDate') then
          need := 'students.edit';
        end if;
      end loop;
    end if;
    if k in ('school_year_id','grade') and public.has_perm('admin.years') then continue; end if;
    if not public.has_perm(need) then
      raise exception 'not allowed: %', need using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.tg_students_role_guard() from public, anon, authenticated;

create or replace function public.tg_appointments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.has_perm('appointments.manage') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- attendance-only update
  if tg_op = 'UPDATE' and public.has_perm('appointments.attendance')
     and (to_jsonb(new) - 'attended' - 'notes') = (to_jsonb(old) - 'attended' - 'notes') then
    return new;
  end if;
  raise exception 'not allowed' using errcode = '42501';
end $$;
revoke execute on function public.tg_appointments_guard() from public, anon, authenticated;
drop trigger if exists appointments_guard on public.appointments;
create trigger appointments_guard before insert or update or delete on public.appointments for each row execute function public.tg_appointments_guard();

-- requests: route by permission instead of fixed roles
create or replace function public.tg_requests() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  select coalesce(nullif(full_name, ''), email) into nm from public.profiles where user_id = auth.uid();
  if tg_op = 'INSERT' then
    new.author_id   := auth.uid();
    new.author_name := nm;
    new.author_role := (select r.name from public.profiles p join public.roles r on r.id = p.role_id where p.user_id = auth.uid());
    new.level       := case when public.has_perm('requests.handle') then 'admin' else 'manager' end;
    new.status      := 'new';
    new.response    := null; new.version := null; new.handled_by := null;
    return new;
  end if;
  new.title := old.title; new.body := old.body; new.kind := old.kind;
  new.author_id := old.author_id; new.author_name := old.author_name; new.author_role := old.author_role;
  new.created_at := old.created_at;
  if not public.is_admin() and old.level = 'admin' then raise exception 'not allowed' using errcode = '42501'; end if;
  if not public.is_admin() then new.version := old.version; end if;
  new.handled_by := nm;
  new.updated_at := now();
  return new;
end $$;

-- ---------- 4. RPCs follow permissions ----------
create or replace function public.insert_students(p_rows jsonb)
returns setof public.students language plpgsql set search_path = public as $$
declare r jsonb; s public.students;
begin
  if not public.has_perm('students.add') then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else jsonb_build_array(p_rows) end) loop
    insert into public.students (
      school_year_id, first_name, last_name, id_number, birth_date, city, grade, track, stage,
      family_status, father_name, father_phone, father_employment, father_avrech,
      mother_name, mother_phone, mother_employment, optional_docs, documents, stations, files,
      notes, hesitation_reason, photo_path, source, rsvp_status, is_archived, details
    ) values (
      coalesce((r->>'schoolYearId')::uuid, (select id from public.school_years where is_current)),
      coalesce(r->>'firstName', ''), coalesce(r->>'lastName', ''),
      nullif(regexp_replace(coalesce(r->>'studentId',''), '\D', '', 'g'), ''),
      nullif(r->>'birthDate', '')::date, nullif(trim(r->>'city'), ''),
      coalesce((r->>'grade')::smallint, 7), nullif(r->>'registrationTrack', ''), coalesce(r->>'stage', 'leads'),
      coalesce(r->>'familyStatus', 'married'), nullif(trim(r->>'fatherName'), ''), nullif(trim(r->>'fatherPhone'), ''),
      coalesce(r->>'fatherEmployment', 'na'), coalesce((r->>'fatherAvrech')::boolean, false),
      nullif(trim(r->>'motherName'), ''), nullif(trim(r->>'motherPhone'), ''), coalesce(r->>'motherEmployment', 'na'),
      coalesce(array(select jsonb_array_elements_text(coalesce(r->'optionalDocs','[]'::jsonb))), '{}'),
      coalesce(r->'documents', '{}'::jsonb), coalesce(r->'stations', '{}'::jsonb), coalesce(r->'files', '{}'::jsonb),
      nullif(r->>'notes', ''), nullif(r->>'hesitationReason', ''), nullif(r->>'photoPath', ''), nullif(r->>'source', ''),
      coalesce(r->>'rsvpStatus', 'pending'), coalesce((r->>'isArchived')::boolean, false),
      case when jsonb_typeof(r->'details') = 'object' then r->'details' else '{}'::jsonb end
    ) returning * into s;
    return next s;
  end loop;
end $$;

create or replace function public.patch_student(p_id uuid, p_patch jsonb)
returns public.students language plpgsql set search_path = public as $$
declare s public.students; p jsonb := p_patch;
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
  if p ? 'optionalDocs'      then s.optional_docs     := coalesce(array(select jsonb_array_elements_text(coalesce(p->'optionalDocs','[]'::jsonb))), '{}'); end if;
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
  -- details merge key-by-key; a null value removes the key
  if p ? 'details' and jsonb_typeof(p->'details') = 'object' then
    s.details := jsonb_strip_nulls(s.details || (p->'details'));
  end if;
  update public.students set
    first_name = s.first_name, last_name = s.last_name, id_number = s.id_number, birth_date = s.birth_date,
    city = s.city, grade = s.grade, track = s.track, stage = s.stage, family_status = s.family_status,
    father_name = s.father_name, father_phone = s.father_phone, father_employment = s.father_employment,
    father_avrech = s.father_avrech, mother_name = s.mother_name, mother_phone = s.mother_phone,
    mother_employment = s.mother_employment, optional_docs = s.optional_docs, documents = s.documents,
    stations = s.stations, files = s.files, notes = s.notes, hesitation_reason = s.hesitation_reason,
    photo_path = s.photo_path, source = s.source, rsvp_status = s.rsvp_status, is_archived = s.is_archived,
    school_year_id = s.school_year_id, details = s.details
  where id = p_id returning * into s;
  return s;
end $$;

create or replace function public.set_student_appointment(p_student_id uuid, p_starts_at timestamptz, p_type text default 'פגישת רישום')
returns uuid language plpgsql set search_path = public as $$
declare v_old timestamptz; v_id uuid;
begin
  if not public.has_perm('appointments.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select starts_at into v_old from public.appointments where student_id = p_student_id and kind = 'registration';
  if p_starts_at is null then
    delete from public.appointments where student_id = p_student_id and kind = 'registration';
    return null;
  end if;
  insert into public.appointments (student_id, starts_at, type, kind, created_by)
  values (p_student_id, p_starts_at, coalesce(p_type, 'פגישת רישום'), 'registration', auth.uid())
  on conflict (student_id) where kind = 'registration'
  do update set starts_at = excluded.starts_at, type = excluded.type, attended = null
  returning id into v_id;
  if v_old is distinct from p_starts_at then
    update public.students set rsvp_status = 'pending' where id = p_student_id;
  end if;
  update public.students set stage = 'meeting' where id = p_student_id and stage = 'leads';
  return v_id;
end $$;

-- new school year: carry over unfinished registrations; "studying" students move up a grade
create or replace function public.start_school_year(p_name text, p_carry_over boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_new uuid; n int := 0; m int := 0;
begin
  if not public.has_perm('admin.years') then raise exception 'not allowed' using errcode = '42501'; end if;
  select id into v_old from public.school_years where is_current;
  update public.school_years set is_current = false where is_current;
  insert into public.school_years (name, is_current) values (p_name, true)
  on conflict (name) do update set is_current = true returning id into v_new;
  if v_old is not null and v_old <> v_new then
    if p_carry_over then
      with moved as (
        update public.students set school_year_id = v_new
         where school_year_id = v_old and not is_archived and stage <> 'complete'
           and coalesce(details->>'outcome', 'in_process') = 'in_process'
        returning 1) select count(*) into n from moved;
    end if;
    with promoted as (
      update public.students set school_year_id = v_new, grade = least(grade + 1, 12)
       where school_year_id = v_old and not is_archived and details->>'outcome' = 'studying'
      returning 1) select count(*) into m from promoted;
  end if;
  insert into public.activity_logs (action_type, description)
  values ('school_year', 'נפתחה שנת רישום ' || p_name
    || case when n > 0 then ' (הועברו ' || n || ' תלמידים שלא סיימו)' else '' end
    || case when m > 0 then ' (' || m || ' תלמידים לומדים עלו כיתה)' else '' end);
  return v_new;
end $$;

create or replace function public.student_history(p_student_id uuid, p_limit int default 100)
returns table (at timestamptz, op text, changed jsonb, actor text)
language sql stable security definer set search_path = public as $$
  select a.at, a.op, a.changed, coalesce(nullif(p.full_name, ''), p.email, 'מערכת')
    from public.audit_log a left join public.profiles p on p.user_id = a.actor_id
   where a.row_id = p_student_id and public.has_perm('admin.audit')
   order by a.at desc limit p_limit
$$;

-- per-user activity log for the audit screen
create or replace function public.user_activity(p_user uuid, p_limit int default 200)
returns table (at timestamptz, table_name text, op text, row_id uuid, student text, changed jsonb)
language sql stable security definer set search_path = public as $$
  select a.at, a.table_name, a.op, a.row_id,
         (select trim(s.first_name || ' ' || s.last_name) from public.students s where s.id = a.row_id),
         a.changed
    from public.audit_log a
   where a.actor_id = p_user and public.has_perm('admin.audit')
   order by a.at desc limit least(p_limit, 1000)
$$;
revoke all on function public.user_activity(uuid, int) from public, anon;
grant execute on function public.user_activity(uuid, int) to authenticated;

create or replace function public.set_my_institutions(p text[]) returns void
language sql security definer set search_path = public as $$
  update public.profiles set institutions = coalesce(p, '{}') where user_id = auth.uid() and is_active
$$;
revoke all on function public.set_my_institutions(text[]) from public, anon;
grant execute on function public.set_my_institutions(text[]) to authenticated;

-- audit the new tables too
drop trigger if exists student_log_audit on public.student_log;
create trigger student_log_audit after insert or update or delete on public.student_log for each row execute function public.tg_audit();
drop trigger if exists roles_audit on public.roles;
create trigger roles_audit after insert or update or delete on public.roles for each row execute function public.tg_audit();

-- ---------- 5. policies (all rewritten on permissions) ----------
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
            where (schemaname = 'public' and tablename in ('students','appointments','activity_logs','audit_log','potentials','profiles','school_years','app_settings','requests','assistant_usage'))
               or (schemaname = 'storage' and tablename = 'objects' and policyname in ('staff read files','secretary add files','secretary del files'))
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

alter table public.roles        enable row level security;
alter table public.institutions enable row level security;
alter table public.recruiters   enable row level security;
alter table public.schools      enable row level security;
alter table public.cities       enable row level security;
alter table public.student_log  enable row level security;

-- students
create policy "students read"   on public.students for select to authenticated using ((select public.has_perm('students.view')) and public.can_see_track(track));
create policy "students add"    on public.students for insert to authenticated with check ((select public.has_perm('students.add')) and public.can_see_track(track));
create policy "students update" on public.students for update to authenticated
  using (((select public.has_perm('students.edit')) or (select public.has_perm('students.status')) or (select public.has_perm('students.archive'))
          or (select public.has_perm('stations.mark')) or (select public.has_perm('appointments.manage')) or (select public.has_perm('admin.years')))
         and public.can_see_track(track))
  with check (true);
create policy "students delete" on public.students for delete to authenticated using ((select public.has_perm('students.delete')) and public.can_see_track(track));

-- appointments (field rules in tg_appointments_guard)
create policy "appts read"   on public.appointments for select to authenticated using ((select public.has_perm('students.view')));
create policy "appts insert" on public.appointments for insert to authenticated with check ((select public.has_perm('appointments.manage')));
create policy "appts update" on public.appointments for update to authenticated
  using ((select public.has_perm('appointments.manage')) or (select public.has_perm('appointments.attendance'))) with check (true);
create policy "appts delete" on public.appointments for delete to authenticated using ((select public.has_perm('appointments.manage')));

-- activity / audit
create policy "activity read"  on public.activity_logs for select to authenticated using ((select public.has_perm('students.view')));
create policy "activity write" on public.activity_logs for insert to authenticated with check ((select public.is_staff()));
create policy "audit read"     on public.audit_log for select to authenticated using ((select public.has_perm('admin.audit')));

-- potentials
create policy "potentials read"  on public.potentials for select to authenticated using ((select public.has_perm('potentials.view')));
create policy "potentials write" on public.potentials for all to authenticated
  using ((select public.has_perm('potentials.edit'))) with check ((select public.has_perm('potentials.edit')));

-- profiles & roles
create policy "profiles read"  on public.profiles for select to authenticated using ((select public.is_staff()) or user_id = (select auth.uid()));
create policy "profiles write" on public.profiles for all to authenticated using ((select public.has_perm('admin.users'))) with check ((select public.has_perm('admin.users')));
create policy "roles read"     on public.roles for select to authenticated using ((select public.is_staff()));
create policy "roles write"    on public.roles for all to authenticated using ((select public.has_perm('admin.users'))) with check ((select public.has_perm('admin.users')));

-- years & settings
create policy "years read"  on public.school_years for select to authenticated using ((select public.is_staff()));
create policy "years write" on public.school_years for all to authenticated using ((select public.has_perm('admin.years'))) with check ((select public.has_perm('admin.years')));
create policy "settings read"  on public.app_settings for select to authenticated using ((select public.is_staff()));
create policy "settings write" on public.app_settings for all to authenticated
  using ((select public.has_perm('admin.settings')) or ((select public.has_perm('admin.lists')) and key in ('documents_catalog','print_forms')))
  with check ((select public.has_perm('admin.settings')) or ((select public.has_perm('admin.lists')) and key in ('documents_catalog','print_forms')));

-- reference lists
create policy "institutions read"  on public.institutions for select to authenticated using ((select public.is_staff()));
create policy "institutions write" on public.institutions for all to authenticated using ((select public.has_perm('admin.lists'))) with check ((select public.has_perm('admin.lists')));
create policy "recruiters read"    on public.recruiters for select to authenticated using ((select public.is_staff()));
create policy "recruiters write"   on public.recruiters for all to authenticated using ((select public.has_perm('admin.lists'))) with check ((select public.has_perm('admin.lists')));
create policy "schools read"       on public.schools for select to authenticated using ((select public.is_staff()));
create policy "schools add"        on public.schools for insert to authenticated with check ((select public.has_perm('students.edit')) or (select public.has_perm('admin.lists')));
create policy "schools edit"       on public.schools for update to authenticated using ((select public.has_perm('admin.lists'))) with check ((select public.has_perm('admin.lists')));
create policy "schools delete"     on public.schools for delete to authenticated using ((select public.has_perm('admin.lists')));
create policy "cities read"        on public.cities for select to authenticated using ((select public.is_staff()));
create policy "cities write"       on public.cities for all to authenticated using ((select public.has_perm('admin.lists'))) with check ((select public.has_perm('admin.lists')));

-- student log (notes are sensitive)
create policy "log read" on public.student_log for select to authenticated
  using ((select public.has_perm('students.view')) and (kind <> 'note' or (select public.has_perm('sensitive.notes'))));
create policy "log add" on public.student_log for insert to authenticated with check ((select public.is_staff()));
create policy "log edit" on public.student_log for update to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin())) with check (author_id = (select auth.uid()) or (select public.is_admin()));
create policy "log delete" on public.student_log for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- requests
create policy "requests read" on public.requests for select to authenticated using (
  author_id = (select auth.uid()) or (select public.is_admin())
  or ((select public.has_perm('requests.handle')) and (level = 'manager' or coalesce(author_role, '') <> 'מנהל מערכת')));
create policy "requests submit" on public.requests for insert to authenticated with check ((select public.is_staff()));
create policy "requests update" on public.requests for update to authenticated
  using ((select public.is_admin()) or ((select public.has_perm('requests.handle')) and level = 'manager'))
  with check ((select public.is_admin()) or (select public.has_perm('requests.handle')));
create policy "requests delete" on public.requests for delete to authenticated using ((select public.is_admin()));

-- assistant usage
create policy "usage read"   on public.assistant_usage for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "usage insert" on public.assistant_usage for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_staff()));

-- storage: photos follow students.view; uploaded documents are sensitive
create policy "files read" on storage.objects for select to authenticated using (
  (bucket_id = 'student-photos' and (select public.has_perm('students.view')))
  or (bucket_id = 'student-docs' and (select public.has_perm('sensitive.files'))));
create policy "files add" on storage.objects for insert to authenticated with check (
  bucket_id in ('student-photos','student-docs') and (select public.has_perm('students.edit')));
create policy "files delete" on storage.objects for delete to authenticated using (
  bucket_id in ('student-photos','student-docs') and (select public.has_perm('students.edit')));

alter publication supabase_realtime add table public.student_log, public.institutions, public.recruiters, public.roles;
