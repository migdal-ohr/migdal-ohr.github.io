DELETE FROM public.appointments a
USING public.appointments b
WHERE a.family_id = b.family_id
  AND a.id <> b.id
  AND (a.date < b.date OR (a.date = b.date AND a.id < b.id));
