-- =====================================================================
-- v2.1 — document uploads + public self-registration form for parents
-- =====================================================================

-- 1. Private bucket for scanned documents (ID copies, payslips, ...)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('student-docs', 'student-docs', false, 15728640)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff read student docs" ON storage.objects;
DROP POLICY IF EXISTS "staff write student docs" ON storage.objects;
DROP POLICY IF EXISTS "staff delete student docs" ON storage.objects;
CREATE POLICY "staff read student docs" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'student-docs');
CREATE POLICY "staff write student docs" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-docs');
CREATE POLICY "staff delete student docs" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'student-docs');

-- 2. Public registration: parents fill a form → a new lead appears in the CRM.
--    SECURITY DEFINER + strict validation + simple rate limits. Anonymous users
--    still cannot read anything.
CREATE TABLE IF NOT EXISTS public.public_form_hits (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_form_hits ENABLE ROW LEVEL SECURITY; -- no policies: nobody reads it directly

CREATE OR REPLACE FUNCTION public.public_register(p jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := left(trim(coalesce(p->>'firstName', '')), 40);
  v_last text := left(trim(coalesce(p->>'lastName', '')), 40);
  v_sid text := left(regexp_replace(coalesce(p->>'studentId', ''), '\D', '', 'g'), 9);
  v_grade int := coalesce(nullif(p->>'grade', '')::int, 0);
  v_track text := coalesce(p->>'registrationTrack', '');
  v_fphone text := left(regexp_replace(coalesce(p->>'fatherPhone', ''), '[^0-9+-]', '', 'g'), 15);
  v_mphone text := left(regexp_replace(coalesce(p->>'motherPhone', ''), '[^0-9+-]', '', 'g'), 15);
  v_fname text := left(trim(coalesce(p->>'fatherName', '')), 40);
  v_mname text := left(trim(coalesce(p->>'motherName', '')), 40);
  v_city text := left(trim(coalesce(p->>'city', '')), 40);
  v_notes text := left(trim(coalesce(p->>'notes', '')), 500);
  v_id text;
  v_name text;
BEGIN
  IF v_first = '' OR v_last = '' THEN RAISE EXCEPTION 'name required'; END IF;
  IF v_fphone = '' AND v_mphone = '' THEN RAISE EXCEPTION 'phone required'; END IF;
  IF v_grade < 6 OR v_grade > 12 THEN RAISE EXCEPTION 'bad grade'; END IF;
  IF v_track NOT IN ('metivta', 'yeshiva_ketana', 'maor_israel') THEN v_track := NULL; END IF;

  -- rate limits: 60 submissions/hour overall
  IF (SELECT count(*) FROM public.public_form_hits WHERE created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate limited';
  END IF;
  INSERT INTO public.public_form_hits DEFAULT VALUES;

  -- same student ID already in the system → don't duplicate, just log
  IF v_sid <> '' AND EXISTS (SELECT 1 FROM public.families WHERE data->>'studentId' = v_sid) THEN
    INSERT INTO public.activity_logs (action_type, description, family_id)
    SELECT 'web_registration', 'טופס הרשמה נשלח שוב עבור ' || v_first || ' ' || v_last || ' (כבר קיים במערכת)', id
      FROM public.families WHERE data->>'studentId' = v_sid LIMIT 1;
    RETURN 'exists';
  END IF;

  v_id := 'f' || (extract(epoch from clock_timestamp()) * 1000)::bigint || 'w' || floor(random() * 1000)::int;
  v_name := v_first || ' ' || v_last;
  INSERT INTO public.families (id, data) VALUES (
    v_id,
    jsonb_strip_nulls(jsonb_build_object(
      'firstName', v_first,
      'lastName', v_last,
      'studentName', v_name,
      'studentId', nullif(v_sid, ''),
      'grade', v_grade,
      'registrationTrack', v_track,
      'city', nullif(v_city, ''),
      'fatherName', nullif(v_fname, ''),
      'motherName', nullif(v_mname, ''),
      'fatherPhone', nullif(v_fphone, ''),
      'motherPhone', nullif(v_mphone, ''),
      'parentNames', concat_ws(' ו', nullif(v_fname, ''), nullif(v_mname, '')),
      'phone', coalesce(nullif(v_fphone, ''), v_mphone),
      'notes', nullif('נרשם דרך טופס ההרשמה באתר. ' || v_notes, 'נרשם דרך טופס ההרשמה באתר. '),
      'stage', 'leads',
      'source', 'web_form',
      'documents', '{}'::jsonb,
      'stations', '{}'::jsonb,
      'createdAt', now()
    ))
  );
  INSERT INTO public.activity_logs (action_type, description, family_id)
  VALUES ('web_registration', 'נרשם דרך הטופס באתר: ' || v_name, v_id);
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.public_register(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.public_register(jsonb) TO anon, authenticated;
