
-- Families table: stores the full family/student record as JSONB for easy mapping with existing UI
CREATE TABLE public.families (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.appointments (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL DEFAULT 'פגישת רישום',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX appointments_family_idx ON public.appointments(family_id);
CREATE INDEX appointments_date_idx ON public.appointments(date);

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Shared workspace: any authenticated staff member has full CRUD
CREATE POLICY "auth read families" ON public.families FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert families" ON public.families FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update families" ON public.families FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete families" ON public.families FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read appointments" ON public.appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert appointments" ON public.appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update appointments" ON public.appointments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete appointments" ON public.appointments FOR DELETE TO authenticated USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.families;
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER families_updated_at BEFORE UPDATE ON public.families
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
