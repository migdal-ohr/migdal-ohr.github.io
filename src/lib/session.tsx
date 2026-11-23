import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import { setSchoolYearScope } from "@/lib/api/supabaseBackend";
import { setInstitutionSettings, InstitutionSettings, DEFAULT_INSTITUTION } from "@/lib/whatsapp";

import type { RoleRow } from "@/lib/permissions";
import { setDocsCatalog, setInstitutionNames, type CatalogDoc } from "@/types/crm";

/** Built-in role keys (custom roles have key null → "custom"). */
export type Role = "admin" | "manager" | "secretary" | "interviewer" | "viewer" | "custom";

export const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל/ת רישום",
  secretary: "מזכירה",
  interviewer: "מראיין (תחנות בלבד)",
  viewer: "צפייה בלבד",
  custom: "תפקיד מותאם",
};
/** Display name for a role key or role name stored on old rows. */
export const roleLabel = (r?: string | null) => (r ? ROLE_LABELS[r] ?? r : "");

export interface Profile {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  role_id: string;
  is_active: boolean;
  institutions: string[];
  calendar_token?: string;
  roles?: RoleRow | null;
}

export interface SchoolYear {
  id: string;
  name: string;
  is_current: boolean;
  starts_on: string | null;
  ends_on: string | null;
}

export interface Permissions {
  /** generic check by permission key (see lib/permissions.ts) */
  has: (perm: string) => boolean;
  isAdmin: boolean;
  view: boolean;
  add: boolean;
  edit: boolean;
  status: boolean;
  archive: boolean;
  delete: boolean;
  notes: boolean;
  files: boolean;
  export: boolean;
  appointments: boolean;
  attendance: boolean;
  stations: boolean;
  interviews: boolean;
  whatsapp: boolean;
  printForms: boolean;
  printReports: boolean;
  potentialsView: boolean;
  potentialsEdit: boolean;
  manageUsers: boolean;
  manageYears: boolean;
  lists: boolean;
  settings: boolean;
  audit: boolean;
  handleRequests: boolean;
  principalRequest: boolean;
  principalDecide: boolean;
  /** decides on students but has no general access: sees only the student files sent to him */
  principalOnly: boolean;
  /** institutions this role is limited to (null = all) */
  institutions: string[] | null;
}

export const permsFromRole = (r: RoleRow | null | undefined, active = true): Permissions => {
  const has = (p: string) => !!active && !!r && (r.is_admin || !!r.perms?.[p]);
  return {
    has,
    isAdmin: !!active && !!r?.is_admin,
    view: has("students.view"),
    add: has("students.add"),
    edit: has("students.edit"),
    status: has("students.status"),
    archive: has("students.archive"),
    delete: has("students.delete"),
    notes: has("sensitive.notes"),
    files: has("sensitive.files"),
    export: has("export"),
    appointments: has("appointments.manage"),
    attendance: has("appointments.attendance"),
    stations: has("stations.mark"),
    interviews: has("interviews.write"),
    whatsapp: has("whatsapp.send"),
    printForms: has("print.forms"),
    printReports: has("print.reports"),
    potentialsView: has("potentials.view"),
    potentialsEdit: has("potentials.edit"),
    manageUsers: has("admin.users"),
    manageYears: has("admin.years"),
    lists: has("admin.lists"),
    settings: has("admin.settings"),
    audit: has("admin.audit"),
    handleRequests: has("requests.handle"),
    principalRequest: has("principal.request"),
    principalDecide: has("principal.decide"),
    principalOnly: has("principal.decide") && !has("students.view"),
    institutions: r && !r.is_admin && r.institutions?.length ? r.institutions : null,
  };
};

const DEMO_ROLE: RoleRow = { id: "demo", key: "admin", name: "מנהל מערכת", description: null, is_admin: true, perms: {}, institutions: [], sort: 1 };

interface SessionValue {
  loading: boolean;
  profile: Profile | null;
  role: Role | null;
  /** the user's role row (name, permissions) */
  roleRow: RoleRow | null;
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
    demo
      ? { user_id: "demo", email: "demo@migdal-ohr.local", full_name: "משתמש הדגמה", role: "admin", role_id: "demo", is_active: true, institutions: [], roles: DEMO_ROLE }
      : null,
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
    const [{ data: rows }, { data: insts }] = await Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["institution", "documents_catalog"]),
      supabase.from("institutions").select("key, name, is_active, sort"),
    ]);
    setInstitutionNames((insts as { key: string; name: string; is_active: boolean; sort: number }[]) ?? []);
    const data = rows?.find((r) => r.key === "institution");
    setDocsCatalog((rows?.find((r) => r.key === "documents_catalog")?.value as CatalogDoc[] | undefined) ?? null);
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
        .select("user_id, email, full_name, role, role_id, is_active, institutions, calendar_token, roles(id, key, name, description, is_admin, perms, institutions, sort)")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (!alive) return;
      const row = data as unknown as (Profile & { roles: RoleRow | RoleRow[] | null }) | null;
      setProfile(row ? { ...row, roles: Array.isArray(row.roles) ? row.roles[0] ?? null : row.roles } : null);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "roles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "institutions" }, () => reloadSettings())
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
  const roleRow = (profile?.is_active ? profile.roles : null) ?? null;
  const value = useMemo<SessionValue>(
    () => ({
      loading,
      profile,
      role,
      roleRow,
      can: permsFromRole(roleRow, !!profile?.is_active),
      years,
      yearId,
      selectedYear: years.find((y) => y.id === yearId) ?? null,
      setYearId,
      reloadYears,
      settings,
      reloadSettings,
      scopeKey: yearId ?? "none",
    }),
    [loading, profile, role, roleRow, years, yearId, setYearId, reloadYears, settings, reloadSettings],
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
