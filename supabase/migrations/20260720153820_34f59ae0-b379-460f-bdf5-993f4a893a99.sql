
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read activity_logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert activity_logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

CREATE INDEX activity_logs_created_at_idx ON public.activity_logs (created_at DESC);
