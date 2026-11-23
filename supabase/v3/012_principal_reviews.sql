-- Applied as migration v3_012_principal_reviews.
-- "סיכום החלטת מנהל": registration staff send a student to the institution principal;
-- the principal writes a summary + accept/reject; the decision comes back to the sender.
create table if not exists public.principal_reviews (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending','decided','cancelled')),
  request_note     text check (length(request_note) <= 1000),
  requested_by     uuid references auth.users(id) on delete set null,
  requested_by_name text,
  requested_at     timestamptz not null default now(),
  decision         text check (decision in ('accept','reject')),
  summary          text check (length(summary) <= 6000),
  decided_by       uuid references auth.users(id) on delete set null,
  decided_by_name  text,
  decided_at       timestamptz,
  seen_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists principal_reviews_student_idx on public.principal_reviews (student_id, created_at desc);
create index if not exists principal_reviews_status_idx on public.principal_reviews (status, created_at desc);
create index if not exists principal_reviews_requested_by_idx on public.principal_reviews (requested_by);
create index if not exists principal_reviews_decided_by_idx on public.principal_reviews (decided_by);
create unique index if not exists principal_reviews_one_pending on public.principal_reviews (student_id) where status = 'pending';

create or replace function public.tg_principal_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text := (select coalesce(nullif(full_name, ''), email) from public.profiles where user_id = auth.uid());
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.has_perm('principal.request') then raise exception 'not allowed' using errcode = '42501'; end if;
    new.requested_by := auth.uid(); new.requested_by_name := nm; new.requested_at := now();
    new.status := 'pending'; new.decision := null; new.summary := null; new.decided_by := null; new.decided_by_name := null; new.decided_at := null; new.seen_at := null;
    return new;
  end if;
  -- the request itself never changes
  new.student_id := old.student_id; new.requested_by := old.requested_by; new.requested_by_name := old.requested_by_name;
  new.requested_at := old.requested_at; new.request_note := old.request_note; new.created_at := old.created_at;
  if auth.uid() is null then return new; end if;
  if old.status = 'pending' and new.status = 'decided' then
    if not public.has_perm('principal.decide') then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.decision is null then raise exception 'decision required' using errcode = '23514'; end if;
    new.decided_by := auth.uid(); new.decided_by_name := nm; new.decided_at := now(); new.seen_at := null;
  elsif old.status = 'pending' and new.status = 'cancelled' then
    if not public.has_perm('principal.request') then raise exception 'not allowed' using errcode = '42501'; end if;
    new.decision := null; new.summary := null;
  elsif old.status = 'decided' and new.status = 'decided' then
    -- the sender side only marks it as read; the principal may still edit the summary/decision
    if new.decision is distinct from old.decision or new.summary is distinct from old.summary then
      if not public.has_perm('principal.decide') then raise exception 'not allowed' using errcode = '42501'; end if;
      new.decided_by := auth.uid(); new.decided_by_name := nm; new.decided_at := now(); new.seen_at := null;
    else
      new.decided_by := old.decided_by; new.decided_by_name := old.decided_by_name; new.decided_at := old.decided_at;
    end if;
  elsif new.status is distinct from old.status then
    raise exception 'invalid status change' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.tg_principal_reviews() from public, anon, authenticated;
drop trigger if exists principal_reviews_guard on public.principal_reviews;
create trigger principal_reviews_guard before insert or update on public.principal_reviews for each row execute function public.tg_principal_reviews();
drop trigger if exists principal_reviews_audit on public.principal_reviews;
create trigger principal_reviews_audit after insert or update or delete on public.principal_reviews for each row execute function public.tg_audit();

alter table public.principal_reviews enable row level security;
-- visible to principals and registration staff, only for students in the institutions they may see
create policy "reviews read" on public.principal_reviews for select to authenticated using (
  ((select public.has_perm('principal.decide')) or (select public.has_perm('principal.request')))
  and exists (select 1 from public.students s where s.id = student_id and public.can_see_track(s.track)));
create policy "reviews add" on public.principal_reviews for insert to authenticated with check (
  (select public.has_perm('principal.request'))
  and exists (select 1 from public.students s where s.id = student_id and public.can_see_track(s.track)));
create policy "reviews update" on public.principal_reviews for update to authenticated using (
  ((select public.has_perm('principal.decide')) or (select public.has_perm('principal.request')))
  and exists (select 1 from public.students s where s.id = student_id and public.can_see_track(s.track)))
  with check (true);
create policy "reviews delete" on public.principal_reviews for delete to authenticated using ((select public.is_admin()));

alter publication supabase_realtime add table public.principal_reviews;

-- permissions: registration manager sends, the Metivta principal decides
update public.roles set perms = perms || '{"principal.request": true}'::jsonb where key = 'manager';
update public.roles set perms = perms || '{"principal.decide": true, "students.view": true}'::jsonb where name = 'מנהל המתיבתא';
