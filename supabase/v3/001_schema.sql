-- =====================================================================
-- Migdal Ohr Registration — v3 professional schema
-- Designed for ~3,000 students / year for 15+ years (≈50k students,
-- ~1M audit rows): normalized columns, per-year data, role-based access,
-- full audit trail, optimistic versioning.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;   -- fast Hebrew substring search

-- ---------------------------------------------------------------------
-- Roles
--   admin       מנהל מערכת     – everything incl. users & settings
--   manager     מנהל/ת רישום    – everything on data incl. delete, years
--   secretary   מזכירה         – add / edit / archive, no permanent delete
--   interviewer מראיין         – read + mark registration-day stations only
--   viewer      צפייה בלבד     – read only
-- ---------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        text not null default 'viewer'
              check (role in ('admin','manager','secretary','interviewer','viewer')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'admin' then 5 when 'manager' then 4 when 'secretary' then 3
                when 'interviewer' then 2 when 'viewer' then 1 else 0 end
$$;

-- current user's role ('' when not a staff member / deactivated)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where user_id = auth.uid() and is_active), '')
$$;

create or replace function public.has_role(min_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.role_rank(public.my_role()) >= public.role_rank(min_role)
$$;

-- ---------------------------------------------------------------------
-- School years (registration seasons)
-- ---------------------------------------------------------------------
create table public.school_years (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,              -- e.g. 'תשפ"ח'
  starts_on   date,
  ends_on     date,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index school_years_one_current on public.school_years (is_current) where is_current;

-- ---------------------------------------------------------------------
-- Students (one row = one student registering for one school year)
-- ---------------------------------------------------------------------
create table public.students (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,                       -- id from the v1/v2 system
  school_year_id     uuid not null references public.school_years(id),
  first_name         text not null default '' check (length(first_name) <= 60),
  last_name          text not null default '' check (length(last_name) <= 60),
  id_number          text check (id_number ~ '^[0-9]{5,9}$'),
  birth_date         date,
  city               text check (length(city) <= 60),
  grade              smallint not null default 7 check (grade between 1 and 12),
  track              text check (track in ('metivta','yeshiva_ketana','maor_israel')),
  stage              text not null default 'leads'
                     check (stage in ('leads','meeting','documents','complete','persuasion')),
  family_status      text not null default 'married' check (family_status in ('married','divorced','single','widowed')),
  father_name        text check (length(father_name) <= 60),
  father_phone       text check (length(father_phone) <= 20),
  father_employment  text not null default 'na' check (father_employment in ('salaried','self_employed','unemployed','na')),
  father_avrech      boolean not null default false,
  mother_name        text check (length(mother_name) <= 60),
  mother_phone       text check (length(mother_phone) <= 20),
  mother_employment  text not null default 'na' check (mother_employment in ('salaried','self_employed','unemployed','na')),
  optional_docs      text[] not null default '{}',
  documents          jsonb not null default '{}'::jsonb,   -- { doc_key: true/false }
  stations           jsonb not null default '{}'::jsonb,   -- { station_key: true/false }
  files              jsonb not null default '{}'::jsonb,   -- { doc_key: [{path,name,uploadedAt}] }
  notes              text check (length(notes) <= 4000),
  hesitation_reason  text check (length(hesitation_reason) <= 2000),
  photo_path         text,
  source             text,                                 -- 'web_form' | 'import' | 'scanner' | null
  rsvp_status        text not null default 'pending' check (rsvp_status in ('pending','confirmed','reschedule_requested')),
  rsvp_token         uuid not null unique default gen_random_uuid(),
  is_archived        boolean not null default false,
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references auth.users(id) on delete set null,
  updated_by         uuid references auth.users(id) on delete set null
);

create index students_year_idx        on public.students (school_year_id, is_archived);
create index students_stage_idx       on public.students (school_year_id, stage) where not is_archived;
create index students_id_number_idx   on public.students (id_number) where id_number is not null;
create index students_updated_idx     on public.students (updated_at desc);
create index students_name_trgm       on public.students using gin ((first_name || ' ' || last_name) gin_trgm_ops);
create index students_phones_idx      on public.students (father_phone, mother_phone);

-- ---------------------------------------------------------------------
-- Appointments (one active registration meeting per student)
-- ---------------------------------------------------------------------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null unique references public.students(id) on delete cascade,
  starts_at   timestamptz not null,
  type        text not null default 'פגישת רישום',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);
create index appointments_starts_idx on public.appointments (starts_at);

-- ---------------------------------------------------------------------
-- Activity feed (human readable) + full audit trail (machine readable)
-- ---------------------------------------------------------------------
create table public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  action_type  text not null,
  description  text not null,
  student_id   uuid references public.students(id) on delete set null,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  created_at   timestamptz not null default now()
);
create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_student_idx on public.activity_logs (student_id, created_at desc);

create table public.audit_log (
  id          bigserial primary key,
  table_name  text not null,
  row_id      uuid,
  op          text not null,            -- INSERT / UPDATE / DELETE
  changed     jsonb,                    -- UPDATE: {col: [old,new]}; INSERT/DELETE: full row
  actor_id    uuid,
  at          timestamptz not null default now()
);
create index audit_log_row_idx on public.audit_log (row_id, at desc);
create index audit_log_at_idx  on public.audit_log (at desc);

-- ---------------------------------------------------------------------
-- Potentials (AI ID-slip scanner)
-- ---------------------------------------------------------------------
create table public.potentials (
  id                   uuid primary key default gen_random_uuid(),
  full_name            text not null,
  id_number            text,
  date_of_birth        date not null,
  grade                smallint not null,
  source               text,
  converted            boolean not null default false,
  converted_student_id uuid references public.students(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index potentials_id_number_key on public.potentials (id_number) where id_number is not null and id_number <> '';

-- ---------------------------------------------------------------------
-- Settings (institution name, address, WhatsApp texts …)
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table public.public_form_hits (
  id bigserial primary key,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.tg_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_table_name = 'students' then
    new.version := old.version + 1;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

create trigger students_touch before update on public.students for each row execute function public.tg_touch();
create trigger profiles_touch before update on public.profiles for each row execute function public.tg_touch();
create trigger potentials_touch before update on public.potentials for each row execute function public.tg_touch();

create or replace function public.tg_students_created_by() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_by := coalesce(new.updated_by, auth.uid());
  if new.school_year_id is null then
    new.school_year_id := (select id from public.school_years where is_current);
  end if;
  return new;
end $$;
create trigger students_created_by before insert on public.students for each row execute function public.tg_students_created_by();

-- Interviewers may only change registration-day stations
create or replace function public.tg_students_role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := public.my_role();
begin
  if auth.uid() is null then return new; end if;     -- server / service code
  if r = 'interviewer' then
    if (to_jsonb(new) - 'stations' - 'updated_at' - 'version' - 'updated_by')
       is distinct from (to_jsonb(old) - 'stations' - 'updated_at' - 'version' - 'updated_by') then
      raise exception 'interviewers can only update stations' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger students_role_guard before update on public.students for each row execute function public.tg_students_role_guard();

-- Generic audit
create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}'::jsonb;
  k text;
  o jsonb; n jsonb;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','version','updated_by') and (o -> k) is distinct from (n -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return new; end if;
    insert into public.audit_log (table_name, row_id, op, changed, actor_id)
    values (tg_table_name, (n ->> 'id')::uuid, 'UPDATE', diff, auth.uid());
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, op, changed, actor_id)
    values (tg_table_name, (to_jsonb(new) ->> 'id')::uuid, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  else
    insert into public.audit_log (table_name, row_id, op, changed, actor_id)
    values (tg_table_name, (to_jsonb(old) ->> 'id')::uuid, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
end $$;
create trigger students_audit after insert or update or delete on public.students for each row execute function public.tg_audit();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function public.tg_audit();

-- Activity actor stamp
create or replace function public.tg_activity_actor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.actor_id := coalesce(new.actor_id, auth.uid());
  if new.actor_email is null and new.actor_id is not null then
    new.actor_email := (select coalesce(nullif(full_name, ''), email) from public.profiles where user_id = new.actor_id);
  end if;
  return new;
end $$;
create trigger activity_actor before insert on public.activity_logs for each row execute function public.tg_activity_actor();

-- New auth user → profile (inactive viewer until an admin assigns a role)
create or replace function public.tg_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name, role, is_active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          coalesce(new.raw_app_meta_data ->> 'initial_role', 'viewer'), true)
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.tg_new_auth_user();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.school_years    enable row level security;
alter table public.students        enable row level security;
alter table public.appointments    enable row level security;
alter table public.activity_logs   enable row level security;
alter table public.audit_log       enable row level security;
alter table public.potentials      enable row level security;
alter table public.app_settings    enable row level security;
alter table public.public_form_hits enable row level security;

-- profiles
create policy "staff read profiles"   on public.profiles for select to authenticated using (public.has_role('viewer') or user_id = auth.uid());
create policy "admin manage profiles" on public.profiles for all    to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- school years
create policy "staff read years"      on public.school_years for select to authenticated using (public.has_role('viewer'));
create policy "manager manage years"  on public.school_years for all    to authenticated using (public.has_role('manager')) with check (public.has_role('manager'));

-- students
create policy "staff read students"   on public.students for select to authenticated using (public.has_role('viewer'));
create policy "secretary add"         on public.students for insert to authenticated with check (public.has_role('secretary'));
create policy "interviewer+ update"   on public.students for update to authenticated using (public.has_role('interviewer')) with check (public.has_role('interviewer'));
create policy "manager delete"        on public.students for delete to authenticated using (public.has_role('manager'));

-- appointments
create policy "staff read appts"      on public.appointments for select to authenticated using (public.has_role('viewer'));
create policy "secretary write appts" on public.appointments for all    to authenticated using (public.has_role('secretary')) with check (public.has_role('secretary'));

-- activity
create policy "staff read activity"   on public.activity_logs for select to authenticated using (public.has_role('viewer'));
create policy "staff log activity"    on public.activity_logs for insert to authenticated with check (public.has_role('interviewer'));

-- audit (read: managers; write: triggers only)
create policy "manager read audit"    on public.audit_log for select to authenticated using (public.has_role('manager'));

-- potentials
create policy "staff read potentials" on public.potentials for select to authenticated using (public.has_role('viewer'));
create policy "secretary potentials"  on public.potentials for all    to authenticated using (public.has_role('secretary')) with check (public.has_role('secretary'));

-- settings
create policy "staff read settings"   on public.app_settings for select to authenticated using (public.has_role('viewer'));
create policy "admin write settings"  on public.app_settings for all    to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

-- =====================================================================
-- Realtime
-- =====================================================================
alter table public.students replica identity full;
alter table public.appointments replica identity full;
alter publication supabase_realtime add table public.students, public.appointments, public.activity_logs, public.profiles, public.school_years;
