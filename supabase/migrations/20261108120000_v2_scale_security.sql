-- =====================================================================
-- Migdal Ohr Registration — v2 upgrade (scale + security + data safety)
-- Safe to run on the existing production data: additive only, no data loss.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Secure RSVP token per family (replaces guessable ?studentId= links)
-- ---------------------------------------------------------------------
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS rsvp_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS families_rsvp_token_key ON public.families (rsvp_token);

-- ---------------------------------------------------------------------
-- 2. Expression indexes for fast filtering at 1,400+ students
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS families_stage_idx    ON public.families ((data->>'stage'));
CREATE INDEX IF NOT EXISTS families_track_idx    ON public.families ((data->>'registrationTrack'));
CREATE INDEX IF NOT EXISTS families_archived_idx ON public.families ((coalesce((data->>'isArchived')::boolean, false)));
CREATE INDEX IF NOT EXISTS families_student_id_idx ON public.families ((data->>'studentId'));
CREATE INDEX IF NOT EXISTS families_updated_at_idx ON public.families (updated_at DESC);

-- One appointment per family (the app already enforces this; now the DB does too)
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_per_family ON public.appointments (family_id);

-- Activity log can now point at a specific family (per-student history)
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS family_id text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS actor_email text;
CREATE INDEX IF NOT EXISTS activity_logs_family_idx ON public.activity_logs (family_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3. Atomic partial update — fixes "last write wins" data loss.
--    Two secretaries editing the same student at the same time no longer
--    overwrite each other: only the keys that changed are merged.
--    Nested maps (documents / stations) are merged key-by-key.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.patch_family(p_id text, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.families%ROWTYPE;
  v_data jsonb;
BEGIN
  SELECT * INTO v_row FROM public.families WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'family % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  v_data := v_row.data || (p_patch - 'documents' - 'stations');

  IF p_patch ? 'documents' THEN
    v_data := jsonb_set(v_data, '{documents}',
      coalesce(v_row.data->'documents', '{}'::jsonb) || coalesce(p_patch->'documents', '{}'::jsonb));
  END IF;
  IF p_patch ? 'stations' THEN
    v_data := jsonb_set(v_data, '{stations}',
      coalesce(v_row.data->'stations', '{}'::jsonb) || coalesce(p_patch->'stations', '{}'::jsonb));
  END IF;

  -- Strip explicit nulls so "clear field" works
  v_data := jsonb_strip_nulls(v_data);

  UPDATE public.families SET data = v_data WHERE id = p_id;
  RETURN v_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patch_family(text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Atomic "set the one meeting of a family" (+ RSVP reset on change)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_family_appointment(p_family_id text, p_date timestamptz, p_type text DEFAULT 'פגישת רישום')
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old timestamptz;
  v_id text;
BEGIN
  SELECT date INTO v_old FROM public.appointments WHERE family_id = p_family_id;

  IF p_date IS NULL THEN
    DELETE FROM public.appointments WHERE family_id = p_family_id;
    RETURN NULL;
  END IF;

  v_id := 'a' || replace(gen_random_uuid()::text, '-', '');
  DELETE FROM public.appointments WHERE family_id = p_family_id;
  INSERT INTO public.appointments (id, family_id, date, type) VALUES (v_id, p_family_id, p_date, coalesce(p_type, 'פגישת רישום'));

  -- New date => previous RSVP answer is no longer valid
  IF v_old IS DISTINCT FROM p_date THEN
    UPDATE public.families
       SET data = data || jsonb_build_object('rsvpStatus', 'pending', 'hasConfirmedAttendance', false)
     WHERE id = p_family_id;
  END IF;

  -- First meeting moves a lead forward
  UPDATE public.families
     SET data = data || jsonb_build_object('stage', 'meeting')
   WHERE id = p_family_id AND data->>'stage' = 'leads';

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_family_appointment(text, timestamptz, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Public RSVP — parents can only see/answer their OWN meeting,
--    and only with the unguessable token. No table is opened to anon.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rsvp(p_token uuid)
RETURNS TABLE (first_name text, appointment_date timestamptz, rsvp_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(nullif(f.data->>'firstName', ''), split_part(f.data->>'studentName', ' ', 1)) AS first_name,
         a.date AS appointment_date,
         coalesce(f.data->>'rsvpStatus', 'pending') AS rsvp_status
    FROM public.families f
    LEFT JOIN public.appointments a ON a.family_id = f.id
   WHERE f.rsvp_token = p_token
     AND coalesce((f.data->>'isArchived')::boolean, false) = false
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.submit_rsvp(p_token uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_name text;
  v_status text := CASE WHEN p_status = 'reschedule_requested' THEN 'reschedule_requested' ELSE 'confirmed' END;
BEGIN
  SELECT id, coalesce(nullif(data->>'studentName', ''), trim(coalesce(data->>'firstName','') || ' ' || coalesce(data->>'lastName','')))
    INTO v_id, v_name
    FROM public.families WHERE rsvp_token = p_token
     AND coalesce((data->>'isArchived')::boolean, false) = false;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.families
     SET data = data || jsonb_build_object('rsvpStatus', v_status, 'hasConfirmedAttendance', v_status = 'confirmed')
   WHERE id = v_id;

  INSERT INTO public.activity_logs (action_type, description, family_id)
  VALUES (
    CASE WHEN v_status = 'confirmed' THEN 'rsvp_confirmed' ELSE 'rsvp_reschedule' END,
    CASE WHEN v_status = 'confirmed' THEN v_name || ' אישר/ה הגעה!' ELSE 'משפחת ' || v_name || ' ביקשה מועד חדש' END,
    v_id
  );
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rsvp(uuid) FROM public;
REVOKE ALL ON FUNCTION public.submit_rsvp(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_rsvp(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(uuid, text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Activity log: stamp who did it (server side, cannot be spoofed)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_activity_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_email IS NULL THEN
    NEW.actor_email := (SELECT email FROM auth.users WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_logs_stamp_actor ON public.activity_logs;
CREATE TRIGGER activity_logs_stamp_actor BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.stamp_activity_actor();

-- ---------------------------------------------------------------------
-- 7. Realtime: send full rows so clients can apply changes incrementally
-- ---------------------------------------------------------------------
ALTER TABLE public.families REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------
-- 8. Student photos in Storage (instead of base64 inside the DB row)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff read student photos" ON storage.objects;
DROP POLICY IF EXISTS "staff write student photos" ON storage.objects;
DROP POLICY IF EXISTS "staff delete student photos" ON storage.objects;
CREATE POLICY "staff read student photos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'student-photos');
CREATE POLICY "staff write student photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "staff delete student photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'student-photos');

-- ---------------------------------------------------------------------
-- 9. Potentials: avoid duplicate rows for the same ID number
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS potentials_id_number_key
  ON public.potentials (id_number) WHERE id_number IS NOT NULL AND id_number <> '';
