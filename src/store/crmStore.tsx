import { createContext, useContext, useState, ReactNode, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Family,
  Appointment,
  Stage,
  StationKey,
  STAGE_LABELS,
  emptyStations,
  getRequiredDocuments,
  composeFullName,
  composeParentNames,
} from "@/types/crm";
import { api, type AppointmentRow, type FamilyRow } from "@/lib/api";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";
import { cacheGet, cacheSet } from "@/lib/offlineCache";
import { getSchoolYearScope } from "@/lib/api/supabaseBackend";

/* ------------------------------------------------------------------ */
/*  Shape helpers                                                      */
/* ------------------------------------------------------------------ */

export const ensureShape = (f: Family): Family => {
  const stations = { ...emptyStations(), ...(f.stations ?? {}) };
  for (const k of Object.keys(stations) as StationKey[]) {
    if (typeof stations[k] !== "boolean") stations[k] = false;
  }
  const required = getRequiredDocuments(f);
  const docs: Record<string, boolean> = {};
  for (const r of required) docs[r.key] = !!f.documents?.[r.key];

  let firstName = f.firstName;
  let lastName = f.lastName;
  if (!firstName && !lastName && f.studentName) {
    const parts = f.studentName.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  const fatherName = f.fatherName ?? "";
  const motherName = f.motherName ?? "";
  const fatherPhone = f.fatherPhone ?? f.phone ?? "";
  const motherPhone = f.motherPhone ?? f.phone2 ?? "";

  return {
    ...f,
    grade: (Number(f.grade) || 7) as Family["grade"],
    stage: (f.stage && STAGE_LABELS[f.stage] ? f.stage : "leads") as Stage,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    fatherName,
    motherName,
    fatherPhone,
    motherPhone,
    studentName: composeFullName(firstName, lastName, f.studentName ?? ""),
    parentNames: composeParentNames(fatherName, motherName, f.parentNames ?? ""),
    phone: fatherPhone || f.phone || "",
    phone2: motherPhone || f.phone2 || "",
    familyStatus: f.familyStatus ?? "married",
    fatherEmployment: f.fatherEmployment ?? "na",
    motherEmployment: f.motherEmployment ?? "na",
    fatherAvrech: !!f.fatherAvrech,
    motherAvrech: false,
    optionalDocs: f.optionalDocs ?? [],
    isArchived: !!f.isArchived,
    hasConfirmedAttendance: !!f.hasConfirmedAttendance,
    rsvpStatus: f.rsvpStatus ?? (f.hasConfirmedAttendance ? "confirmed" : "pending"),
    documents: docs,
    stations,
  };
};

export const rowToFamily = (row: FamilyRow): Family => {
  const data = (row.data ?? {}) as Partial<Family>;
  return ensureShape({
    ...(data as Family),
    id: row.id,
    rsvpToken: row.rsvp_token ?? undefined,
    createdAt: data.createdAt ?? row.created_at,
    updatedAt: row.updated_at ?? data.updatedAt,
  });
};

/** Strip runtime-only fields before persisting. */
const familyToData = (f: Partial<Family>): Record<string, unknown> => {
  const { id: _id, rsvpToken: _t, updatedAt: _u, ...rest } = f as Family;
  return rest as unknown as Record<string, unknown>;
};

const rowToAppt = (r: AppointmentRow): Appointment => ({ id: r.id, familyId: r.family_id, date: r.date, type: r.type });

/** Same merge semantics as the server-side patch_family(). */
const mergePatch = (f: Family, patch: Partial<Family>): Family => {
  const next = { ...f, ...patch } as Family;
  if (patch.documents) next.documents = { ...f.documents, ...patch.documents };
  if (patch.stations) next.stations = { ...f.stations, ...patch.stations };
  return ensureShape(next);
};

/** Only the keys whose value actually changed — so concurrent edits of other fields survive. */
const diff = (before: Family, after: Partial<Family>): Partial<Family> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k === "id" || k === "rsvpToken" || k === "updatedAt" || k === "createdAt") continue;
    const prev = (before as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(prev ?? null) !== JSON.stringify(v ?? null)) out[k] = v === undefined ? null : v;
  }
  return out as Partial<Family>;
};

export const newFamilyId = () => `f${Date.now()}${Math.floor(Math.random() * 1e4).toString().padStart(4, "0")}`;

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface CrmContextValue {
  /** Active (non-archived) families */
  families: Family[];
  archivedFamilies: Family[];
  allFamilies: Family[];
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  /** true when showing the local snapshot because the server is unreachable */
  stale: boolean;
  backendKind: "supabase" | "demo";
  reload: () => Promise<void>;
  updateFamilyStage: (id: string, stage: Stage) => Promise<void>;
  bulkUpdateStage: (ids: string[], stage: Stage) => Promise<void>;
  bulkArchive: (ids: string[], archived: boolean) => Promise<void>;
  toggleDocument: (id: string, docKey: string) => Promise<void>;
  setDocuments: (id: string, docs: Record<string, boolean>) => Promise<void>;
  toggleStation: (id: string, station: StationKey) => Promise<void>;
  addFamily: (f: Omit<Family, "id" | "createdAt">) => Promise<Family | undefined>;
  importFamilies: (list: Omit<Family, "id" | "createdAt">[]) => Promise<number>;
  updateFamily: (id: string, patch: Partial<Omit<Family, "id" | "createdAt">>) => Promise<void>;
  deleteFamily: (id: string) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  getFamily: (id: string) => Family | undefined;
  getAppointment: (familyId: string) => Appointment | undefined;
  /** kept for backward compatibility — a family has exactly one appointment */
  getNextAppointment: (familyId: string) => Appointment | undefined;
  scheduleAppointment: (familyId: string, dateIso: string | null, type?: string) => Promise<void>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export const CrmProvider = ({ children }: { children: ReactNode }) => {
  const [familyMap, setFamilyMap] = useState<Map<string, Family>>(new Map());
  const [apptMap, setApptMap] = useState<Map<string, Appointment>>(new Map()); // by familyId
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const familyRef = useRef(familyMap);
  familyRef.current = familyMap;
  const apptRef = useRef(apptMap);
  apptRef.current = apptMap;

  /** Synchronous commit: the ref is updated immediately so chained actions see fresh data. */
  const commitFamilies = useCallback((mutate: (m: Map<string, Family>) => void) => {
    const next = new Map(familyRef.current);
    mutate(next);
    familyRef.current = next;
    setFamilyMap(next);
  }, []);
  const commitAppts = useCallback((mutate: (m: Map<string, Appointment>) => void) => {
    const next = new Map(apptRef.current);
    mutate(next);
    apptRef.current = next;
    setApptMap(next);
  }, []);

  const putFamily = useCallback((f: Family) => commitFamilies((m) => m.set(f.id, f)), [commitFamilies]);

  /* -------- auto-advance: meeting passed → documents / complete -------- */
  const autoAdvance = useCallback(async (fams: Map<string, Family>, appts: Map<string, Appointment>) => {
    const now = Date.now();
    const todo: { id: string; stage: Stage; name: string }[] = [];
    for (const f of fams.values()) {
      if (f.stage !== "meeting" || f.isArchived) continue;
      const a = appts.get(f.id);
      if (!a || +new Date(a.date) >= now) continue;
      const required = getRequiredDocuments(f);
      const allDocs = required.length > 0 && required.every((r) => !!f.documents?.[r.key]);
      const allStations = (Object.keys(f.stations) as StationKey[]).every((k) => !!f.stations[k]);
      todo.push({ id: f.id, stage: allDocs && allStations ? "complete" : "documents", name: f.studentName });
    }
    if (todo.length === 0) return;
    commitFamilies((next) => {
      for (const t of todo) {
        const f = next.get(t.id);
        if (f) next.set(t.id, { ...f, stage: t.stage });
      }
    });
    // small batches so we never flood the server
    for (let i = 0; i < todo.length; i += 10) {
      await Promise.all(todo.slice(i, i + 10).map((t) => api.patchFamily(t.id, { stage: t.stage }).catch(() => undefined)));
    }
  }, [commitFamilies]);

  const applyRows = useCallback((famRows: FamilyRow[], apptRows: AppointmentRow[]) => {
    const fams = new Map<string, Family>();
    for (const r of famRows) fams.set(r.id, rowToFamily(r));
    const appts = new Map<string, Appointment>();
    for (const r of apptRows) {
      if (!fams.has(r.family_id)) continue; // other school years
      const cur = appts.get(r.family_id);
      if (!cur || +new Date(r.date) > +new Date(cur.date)) appts.set(r.family_id, rowToAppt(r));
    }
    familyRef.current = fams;
    apptRef.current = appts;
    setFamilyMap(fams);
    setApptMap(appts);
    return { fams, appts };
  }, []);

  const cacheKey = `snapshot:${api.kind}:${getSchoolYearScope() ?? "current"}`;

  const reload = useCallback(async () => {
    setError(null);
    // 1) show the local snapshot instantly (also covers offline start)
    if (api.kind === "supabase" && familyRef.current.size === 0) {
      const snap = await cacheGet<{ fams: FamilyRow[]; appts: AppointmentRow[] }>(cacheKey);
      if (snap && familyRef.current.size === 0) {
        applyRows(snap.value.fams, snap.value.appts);
        setLoading(false);
      }
    }
    // 2) fresh data from the server
    try {
      const [famRows, apptRows] = await Promise.all([api.listFamilies(), api.listAppointments()]);
      const { fams, appts } = applyRows(famRows, apptRows);
      setLoading(false);
      setStale(false);
      if (api.kind === "supabase") cacheSet(cacheKey, { fams: famRows, appts: apptRows });
      autoAdvance(fams, appts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (familyRef.current.size > 0) {
        setStale(true);
        toast.warning("אין חיבור לשרת. מוצגים הנתונים האחרונים שנשמרו במחשב הזה");
      } else {
        setError(msg);
        toast.error("שגיאה בטעינת הנתונים: " + msg);
      }
      setLoading(false);
    }
  }, [autoAdvance, applyRows, cacheKey]);

  /* -------- initial load + incremental realtime -------- */
  useEffect(() => {
    reload();
    const unsub = api.subscribe({
      family: (evt, row, oldId) => {
        if (evt === "DELETE") {
          const id = oldId;
          if (!id) return;
          if (familyRef.current.has(id)) commitFamilies((m) => m.delete(id));
          return;
        }
        if (row) putFamily(rowToFamily(row));
      },
      appointment: (evt, row, oldFamilyId, oldId) => {
        commitAppts((next) => {
          if (evt === "DELETE") {
            if (oldFamilyId) {
              if (next.get(oldFamilyId)?.id === oldId || !oldId) next.delete(oldFamilyId);
            } else if (oldId) {
              for (const [fid, a] of next) if (a.id === oldId) next.delete(fid);
            }
          } else if (row) {
            next.set(row.family_id, rowToAppt(row));
          }
        });
      },
      reconnect: () => reload(),
    });
    // re-sync when the tab comes back after being hidden for a while
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) reload();
    };
    document.addEventListener("visibilitychange", onVis);
    const onOnline = () => reload();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      unsub();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reload, putFamily, commitFamilies, commitAppts]);

  /* -------- core mutation: optimistic patch with rollback -------- */
  const patch = useCallback(
    async (id: string, p: Partial<Family>): Promise<boolean> => {
      const before = familyRef.current.get(id);
      if (!before) return false;
      if (Object.keys(p).length === 0) return true;
      putFamily(mergePatch(before, p));
      try {
        await api.patchFamily(id, familyToData(p));
        return true;
      } catch (e) {
        putFamily(before);
        toast.error("השמירה נכשלה: " + (e instanceof Error ? e.message : String(e)));
        return false;
      }
    },
    [putFamily],
  );

  const families = useMemo(() => [...familyMap.values()], [familyMap]);
  const activeFamilies = useMemo(() => families.filter((f) => !f.isArchived), [families]);
  const archivedFamilies = useMemo(() => families.filter((f) => !!f.isArchived), [families]);
  const appointments = useMemo(() => [...apptMap.values()].sort((a, b) => +new Date(a.date) - +new Date(b.date)), [apptMap]);

  const value = useMemo<CrmContextValue>(
    () => ({
      families: activeFamilies,
      archivedFamilies,
      allFamilies: families,
      appointments,
      loading,
      error,
      stale,
      backendKind: api.kind,
      reload,

      updateFamilyStage: async (id, stage) => {
        const f = familyRef.current.get(id);
        if (!f || f.stage === stage) return;
        if (await patch(id, { stage })) {
          logActivity("stage_changed", `${f.studentName}: ${STAGE_LABELS[f.stage]} ← ${STAGE_LABELS[stage]}`, id);
        }
      },

      bulkUpdateStage: async (ids, stage) => {
        for (let i = 0; i < ids.length; i += 10) {
          await Promise.all(ids.slice(i, i + 10).map((id) => patch(id, { stage })));
        }
        logActivity("stage_changed", `עדכון קבוצתי: ${ids.length} תלמידים הועברו ל"${STAGE_LABELS[stage]}"`);
      },

      bulkArchive: async (ids, archived) => {
        for (let i = 0; i < ids.length; i += 10) {
          await Promise.all(ids.slice(i, i + 10).map((id) => patch(id, { isArchived: archived })));
        }
        logActivity(archived ? "student_archived" : "student_restored", `${archived ? "הועברו לארכיון" : "שוחזרו מהארכיון"}: ${ids.length} תלמידים`);
      },

      toggleDocument: async (id, docKey) => {
        const f = familyRef.current.get(id);
        if (f) await patch(id, { documents: { [docKey]: !f.documents[docKey] } } as Partial<Family>);
      },

      setDocuments: async (id, docs) => {
        await patch(id, { documents: docs } as Partial<Family>);
      },

      toggleStation: async (id, station) => {
        const f = familyRef.current.get(id);
        if (f) await patch(id, { stations: { [station]: !f.stations[station] } } as Partial<Family>);
      },

      addFamily: async (input) => {
        const created: Family = ensureShape({
          ...(input as Family),
          stations: { ...emptyStations(), ...(input.stations ?? {}) },
          id: newFamilyId(),
          createdAt: new Date().toISOString(),
        });
        try {
          const row = await api.insertFamily(created.id, familyToData(created));
          const fam = rowToFamily(row);
          putFamily(fam);
          logActivity("student_added", `נוסף תלמיד חדש: ${fam.studentName}`, fam.id);
          return fam;
        } catch (e) {
          toast.error("הוספה נכשלה: " + (e instanceof Error ? e.message : String(e)));
          return undefined;
        }
      },

      importFamilies: async (list) => {
        const rows = list.map((input, i) => {
          const f = ensureShape({
            ...(input as Family),
            id: `${newFamilyId()}${i}`,
            createdAt: new Date().toISOString(),
          });
          return { id: f.id, data: familyToData(f) };
        });
        const n = await api.insertFamilies(rows);
        logActivity("import", `יובאו ${n} תלמידים מקובץ`);
        await reload();
        return n;
      },

      updateFamily: async (id, p) => {
        const f = familyRef.current.get(id);
        if (!f) return;
        const changes = diff(f, p as Partial<Family>);
        if (Object.keys(changes).length === 0) return;
        if (await patch(id, changes)) {
          logActivity("student_edited", `עודכנו פרטי תלמיד: ${f.studentName}`, id);
        }
      },

      deleteFamily: async (id) => {
        const f = familyRef.current.get(id);
        commitFamilies((m) => m.delete(id));
        commitAppts((m) => m.delete(id));
        try {
          await api.deleteFamily(id);
          if (f) logActivity("student_deleted", `נמחק לצמיתות: ${f.studentName}`);
        } catch (e) {
          if (f) putFamily(f);
          toast.error("מחיקה נכשלה: " + (e instanceof Error ? e.message : String(e)));
        }
      },

      setArchived: async (id, archived) => {
        const f = familyRef.current.get(id);
        if (!f) return;
        if (await patch(id, { isArchived: archived })) {
          logActivity(
            archived ? "student_archived" : "student_restored",
            archived ? `הועבר לארכיון: ${f.studentName}` : `שוחזר מהארכיון: ${f.studentName}`,
            id,
          );
        }
      },

      getFamily: (id) => familyMap.get(id),
      getAppointment: (familyId) => apptMap.get(familyId),
      getNextAppointment: (familyId) => apptMap.get(familyId),

      scheduleAppointment: async (familyId, dateIso, type = "פגישת רישום") => {
        const f = familyRef.current.get(familyId);
        const prevAppt = apptRef.current.get(familyId);
        const sameTime = prevAppt && dateIso && +new Date(prevAppt.date) === +new Date(dateIso);
        if (sameTime) return;
        if (!prevAppt && !dateIso) return;

        // optimistic: the card moves instantly, never duplicated
        commitAppts((next) => {
          if (dateIso) next.set(familyId, { id: prevAppt?.id ?? `tmp-${familyId}`, familyId, date: dateIso, type });
          else next.delete(familyId);
        });
        if (f && dateIso) {
          putFamily({
            ...f,
            stage: f.stage === "leads" ? "meeting" : f.stage,
            rsvpStatus: "pending",
            hasConfirmedAttendance: false,
          });
        }
        try {
          await api.setAppointment(familyId, dateIso, type);
          if (f) {
            logActivity(
              dateIso ? "meeting_set" : "meeting_cleared",
              dateIso
                ? `נקבעה פגישה ל${f.studentName}: ${new Date(dateIso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : `בוטלה הפגישה של ${f.studentName}`,
              familyId,
            );
          }
        } catch (e) {
          commitAppts((next) => {
            if (prevAppt) next.set(familyId, prevAppt);
            else next.delete(familyId);
          });
          if (f) putFamily(f);
          toast.error("עדכון הפגישה נכשל: " + (e instanceof Error ? e.message : String(e)));
        }
      },
    }),
    [families, activeFamilies, archivedFamilies, appointments, familyMap, apptMap, loading, error, stale, reload, patch, putFamily, commitFamilies, commitAppts],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
};

export const useCrm = () => {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within CrmProvider");
  return ctx;
};
