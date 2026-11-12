import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import { setSchoolYearScope } from "@/lib/api/supabaseBackend";
import { setInstitutionSettings, InstitutionSettings, DEFAULT_INSTITUTION } from "@/lib/whatsapp";

export type Role = "admin" | "manager" | "secretary" | "interviewer" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל/ת רישום",
  secretary: "מזכירה",
  interviewer: "מראיין (תחנות בלבד)",
  viewer: "צפייה בלבד",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "הכל, כולל ניהול משתמשים והגדרות",
  manager: "הכל על הנתונים, כולל מחיקה ופתיחת שנת רישום",
  secretary: "הוספה, עריכה, פגישות, וואטסאפ וארכיון. בלי מחיקה סופית",
  interviewer: "צפייה וסימון תחנות ביום הרישום בלבד",
  viewer: "צפייה בלבד, בלי שינויים",
};

const RANK: Record<Role, number> = { admin: 5, manager: 4, secretary: 3, interviewer: 2, viewer: 1 };

export interface Profile {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface SchoolYear {
  id: string;
  name: string;
  is_current: boolean;
  starts_on: string | null;
  ends_on: string | null;
}

export interface Permissions {
  view: boolean;
  stations: boolean;
  edit: boolean;
  delete: boolean;
  manageYears: boolean;
  manageUsers: boolean;
  settings: boolean;
  audit: boolean;
}

const permsFor = (role: Role | null): Permissions => {
  const r = role ? RANK[role] : 0;
  return {
    view: r >= 1,
    stations: r >= 2,
    edit: r >= 3,
    delete: r >= 4,
    manageYears: r >= 4,
    audit: r >= 4,
    manageUsers: r >= 5,
    settings: r >= 5,
  };
};

interface SessionValue {
  loading: boolean;
  profile: Profile | null;
  role: Role | null;
  can: Permissions;
  years: SchoolYear[];
  yearId: string | null;
  selectedYear: SchoolYear | null;
  setYearId: (id: string) => void;
  reloadYears: () => Promise<void>;
  settings: InstitutionSettings;
  reloadSettings: () => Promise<void>;
  /** bumps whenever the data scope (year) changes — the CRM store reloads on it */
  scopeKey: string;
}

const SessionContext = createContext<SessionValue | null>(null);

const DEMO_YEARS: SchoolYear[] = [{ id: "demo-year", name: 'תשפ"ח', is_current: true, starts_on: null, ends_on: null }];

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const demo = isDemoMode();
  const [loading, setLoading] = useState(!demo);
  const [profile, setProfile] = useState<Profile | null>(
    demo ? { user_id: "demo", email: "demo@migdal-ohr.local", full_name: "משתמש הדגמה", role: "admin", is_active: true } : null,
  );
  const [years, setYears] = useState<SchoolYear[]>(demo ? DEMO_YEARS : []);
  const [yearId, setYearIdState] = useState<string | null>(demo ? "demo-year" : null);
  const [settings, setSettings] = useState<InstitutionSettings>(DEFAULT_INSTITUTION);

  const reloadYears = useCallback(async () => {
    if (demo) return;
    const { data } = await supabase.from("school_years").select("id, name, is_current, starts_on, ends_on").order("created_at", { ascending: false });
    const list = (data ?? []) as SchoolYear[];
    setYears(list);
    setYearIdState((cur) => {
      const keep = cur && list.some((y) => y.id === cur) ? cur : list.find((y) => y.is_current)?.id ?? list[0]?.id ?? null;
      setSchoolYearScope(keep);
      return keep;
    });
  }, [demo]);

  const reloadSettings = useCallback(async () => {
    if (demo) return;
    const { data } = await supabase.from("app_settings").select("value").eq("key", "institution").maybeSingle();
    const s = { ...DEFAULT_INSTITUTION, ...((data?.value as Partial<InstitutionSettings>) ?? {}) };
    setSettings(s);
    setInstitutionSettings(s);
  }, [demo]);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (alive) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, role, is_active")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!alive) return;
      setProfile((data as Profile) ?? null);
      await Promise.all([reloadYears(), reloadSettings()]);
      if (alive) setLoading(false);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_IN" || evt === "SIGNED_OUT" || evt === "USER_UPDATED") load();
    });
    // live role changes (an admin changed my role)
    const ch = supabase
      .channel(`me-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "school_years" }, () => reloadYears())
      .subscribe();
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      supabase.removeChannel(ch);
    };
  }, [demo, reloadYears, reloadSettings]);

  const setYearId = useCallback((id: string) => {
    setSchoolYearScope(id);
    setYearIdState(id);
  }, []);

  const role = profile?.is_active ? profile.role : null;
  const value = useMemo<SessionValue>(
    () => ({
      loading,
      profile,
      role,
      can: permsFor(role),
      years,
      yearId,
      selectedYear: years.find((y) => y.id === yearId) ?? null,
      setYearId,
      reloadYears,
      settings,
      reloadSettings,
      scopeKey: yearId ?? "none",
    }),
    [loading, profile, role, years, yearId, setYearId, reloadYears, settings, reloadSettings],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
};

/** Short-hand for permission checks in components. */
export const useCan = () => useSession().can;
