
CREATE TABLE public.potentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name text NOT NULL,
  id_number text,
  date_of_birth date NOT NULL,
  grade smallint NOT NULL,
  source text,
  converted boolean NOT NULL DEFAULT false,
  converted_family_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.potentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read potentials" ON public.potentials FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert potentials" ON public.potentials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update potentials" ON public.potentials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete potentials" ON public.potentials FOR DELETE TO authenticated USING (true);

CREATE TRIGGER potentials_set_updated_at
BEFORE UPDATE ON public.potentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
