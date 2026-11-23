/** Load students by id even when they are not in the loaded list (another year / principal-only access). */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import { studentToFamilyRow } from "@/lib/api/supabaseBackend";
import { rowToFamily, useCrm } from "@/store/crmStore";
import type { Family } from "@/types/crm";

export const useFamiliesByIds = (ids: string[]) => {
  const { getFamily } = useCrm();
  const [extra, setExtra] = useState<Record<string, Family>>({});
  const [loaded, setLoaded] = useState(false);
  const key = [...new Set(ids)].sort().join(",");
  const missing = useMemo(() => (key ? key.split(",") : []).filter((id) => !getFamily(id)), [key, getFamily]);
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey || isDemoMode()) return setLoaded(true);
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from("students").select("*").in("id", missingKey.split(","));
      if (!alive) return;
      const next: Record<string, Family> = {};
      for (const r of (data as never[]) ?? []) {
        const f = rowToFamily(studentToFamilyRow(r));
        next[f.id] = f;
      }
      setExtra(next);
      setLoaded(true);
    };
    load();
    const ch = supabase
      .channel(`file-students-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "students" }, (p) => {
        if (missingKey.includes((p.new as { id: string }).id)) load();
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [missingKey]);
  const get = (id: string): Family | undefined => getFamily(id) ?? extra[id];
  return { get, loaded };
};

export const useFamilyById = (id: string | null) => {
  const { get, loaded } = useFamiliesByIds(id ? [id] : []);
  return { family: id ? get(id) : undefined, loaded };
};
