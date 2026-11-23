/** Phase-3 data: reference lists, calendar events and the per-student log. Talks to Supabase directly (demo mode: read-only samples). */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import type { CalendarEvent, EventKind } from "@/types/crm";

const demo = () => isDemoMode();
const chan = (name: string) => `${name}-${Math.random().toString(36).slice(2)}`;
const fail = (error: { message: string; code?: string } | null) => {
  if (!error) return;
  if (error.code === "42501" || /not allowed|permission|row-level/i.test(error.message)) throw new Error("אין לך הרשאה לפעולה הזו");
  throw new Error(error.message);
};

/* ------------------------------ reference lists ------------------------------ */

export interface Institution {
  key: string;
  name: string;
  phone: string | null;
  principal: string | null;
  principal_mobile: string | null;
  city: string | null;
  sort: number;
  is_active: boolean;
}
export interface Recruiter {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
}
export interface School {
  id: string;
  symbol: string | null;
  name: string;
  city: string | null;
}

const DEMO_INSTITUTIONS: Institution[] = [
  { key: "metivta", name: "מתיבתא", phone: null, principal: null, principal_mobile: null, city: "מגדל העמק", sort: 1, is_active: true },
  { key: "yeshiva_ketana", name: "ישיבה קטנה", phone: null, principal: null, principal_mobile: null, city: "מגדל העמק", sort: 2, is_active: true },
  { key: "maor_israel", name: "מאור ישראל", phone: null, principal: null, principal_mobile: null, city: "מגדל העמק", sort: 3, is_active: true },
];

/** Generic live table hook. */
function useLiveTable<T>(table: string, order: string, demoRows: T[] = []) {
  const [rows, setRows] = useState<T[]>(demo() ? demoRows : []);
  const [loading, setLoading] = useState(!demo());
  const load = useCallback(async () => {
    if (demo()) return;
    const { data } = await supabase.from(table).select("*").order(order).limit(5000);
    setRows((data as T[]) ?? []);
    setLoading(false);
  }, [table, order]);
  useEffect(() => {
    if (demo()) return;
    load();
    const ch = supabase
      .channel(chan(table))
      .on("postgres_changes", { event: "*", schema: "public", table }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, table]);
  return { rows, loading, reload: load };
}

export const useInstitutionsList = () => {
  const r = useLiveTable<Institution>("institutions", "sort", DEMO_INSTITUTIONS);
  return { ...r, institutions: r.rows };
};
export const useRecruiters = () => {
  const r = useLiveTable<Recruiter>("recruiters", "name");
  return { ...r, recruiters: r.rows };
};
export const useSchools = () => {
  const r = useLiveTable<School>("schools", "name");
  return { ...r, schools: r.rows };
};
export const useCityNames = () => {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (demo()) return;
    supabase
      .from("cities")
      .select("name_he")
      .order("name_he")
      .limit(3000)
      .then(({ data }) => setNames(((data as { name_he: string }[]) ?? []).map((c) => c.name_he)));
  }, []);
  return names;
};

export const addSchool = async (name: string, city?: string, symbol?: string) => {
  const { data, error } = await supabase
    .from("schools")
    .insert({ name: name.trim(), city: city?.trim() || null, symbol: symbol?.trim() || null })
    .select()
    .single();
  fail(error);
  return data as School;
};

/* ------------------------------ calendar events ------------------------------ */

type EventRow = { id: string; student_id: string; kind: EventKind; starts_at: string; type: string; attended: boolean | null; notes: string | null };
const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id,
  familyId: r.student_id,
  kind: r.kind,
  date: r.starts_at,
  type: r.type,
  attended: r.attended,
  notes: r.notes,
});

/** All events (meetings, tours, interviews…), live. */
export const useEvents = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const load = useCallback(async () => {
    if (demo()) return;
    const out: CalendarEvent[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, student_id, kind, starts_at, type, attended, notes")
        .order("starts_at")
        .range(from, from + 999);
      if (error) break;
      out.push(...((data as EventRow[]) ?? []).map(toEvent));
      if ((data ?? []).length < 1000) break;
    }
    setEvents(out);
  }, []);
  useEffect(() => {
    if (demo()) return;
    load();
    const ch = supabase
      .channel(chan("events"))
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { events, reload: load, setEvents };
};

/** Events of one student, live. */
export const useStudentEvents = (studentId: string | null) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const load = useCallback(async () => {
    if (!studentId || demo()) return setEvents([]);
    const { data } = await supabase
      .from("appointments")
      .select("id, student_id, kind, starts_at, type, attended, notes")
      .eq("student_id", studentId)
      .order("starts_at");
    setEvents(((data as EventRow[]) ?? []).map(toEvent));
  }, [studentId]);
  useEffect(() => {
    load();
    if (!studentId || demo()) return;
    const ch = supabase
      .channel(chan("sevents"))
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `student_id=eq.${studentId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, studentId]);
  return { events, reload: load };
};

/** Active staff for @mentions. */
export const useStaff = () => {
  const [staff, setStaff] = useState<{ user_id: string; name: string }[]>([]);
  useEffect(() => {
    if (demo()) return;
    supabase
      .from("profiles")
      .select("user_id, full_name, email, is_active")
      .eq("is_active", true)
      .then(({ data }) =>
        setStaff(((data as { user_id: string; full_name: string; email: string }[]) ?? []).map((p) => ({ user_id: p.user_id, name: p.full_name || p.email }))),
      );
  }, []);
  return staff;
};

export const addEvent = async (familyId: string, kind: EventKind, startsAt: string, title?: string, notes?: string) => {
  if (kind === "registration") {
    const { error } = await supabase.rpc("set_student_appointment", { p_student_id: familyId, p_starts_at: startsAt, p_type: title || "פגישת רישום" });
    return fail(error);
  }
  const { error } = await supabase
    .from("appointments")
    .insert({ student_id: familyId, kind, starts_at: startsAt, type: title || kind, notes: notes || null });
  fail(error);
};
export const updateEvent = async (id: string, patch: { starts_at?: string; type?: string; notes?: string | null; attended?: boolean | null }) => {
  const { error } = await supabase.from("appointments").update(patch).eq("id", id);
  fail(error);
};
export const deleteEvent = async (id: string) => {
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  fail(error);
};

/* ------------------------------ student log ------------------------------ */

export type LogKind = "call" | "interview" | "note";
export interface LogEntry {
  id: string;
  student_id: string;
  kind: LogKind;
  at: string;
  subtype: string | null;
  participant: string | null;
  summary: string;
  followup_on: string | null;
  mentions: string[];
  author_id: string | null;
  author_name: string | null;
}

export const useStudentLog = (studentId: string | null) => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const load = useCallback(async () => {
    if (!studentId || demo()) return setEntries([]);
    const { data } = await supabase.from("student_log").select("*").eq("student_id", studentId).order("at", { ascending: false }).limit(300);
    setEntries((data as LogEntry[]) ?? []);
  }, [studentId]);
  useEffect(() => {
    load();
    if (!studentId || demo()) return;
    const ch = supabase
      .channel(chan("log"))
      .on("postgres_changes", { event: "*", schema: "public", table: "student_log", filter: `student_id=eq.${studentId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, studentId]);
  return { entries, reload: load };
};

export const addLogEntry = async (e: { student_id: string; kind: LogKind; at?: string; subtype?: string; participant?: string; summary: string; followup_on?: string | null; mentions?: string[] }) => {
  const { error } = await supabase.from("student_log").insert({ ...e, mentions: e.mentions ?? [] });
  fail(error);
};
export const deleteLogEntry = async (id: string) => {
  const { error } = await supabase.from("student_log").delete().eq("id", id);
  fail(error);
};

/* ------------------------------ principal decisions ------------------------------ */

export interface PrincipalReview {
  id: string;
  student_id: string;
  status: "pending" | "decided" | "cancelled";
  request_note: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  decision: "accept" | "reject" | null;
  summary: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  seen_at: string | null;
}
export const DECISION_LABELS: Record<"accept" | "reject", string> = { accept: "מתקבל", reject: "לא מתקבל" };

/** All principal reviews visible to me (RLS scopes by permission + institution), live. */
export const usePrincipalReviews = (enabled = true) => {
  const [reviews, setReviews] = useState<PrincipalReview[]>([]);
  const load = useCallback(async () => {
    if (!enabled || demo()) return;
    const { data } = await supabase.from("principal_reviews").select("*").neq("status", "cancelled").order("requested_at", { ascending: false }).limit(2000);
    setReviews((data as PrincipalReview[]) ?? []);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || demo()) return;
    load();
    const ch = supabase
      .channel(chan("reviews"))
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_reviews" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, enabled]);
  return { reviews, reload: load };
};

export const requestPrincipalReview = async (studentId: string, note?: string) => {
  const { error } = await supabase.from("principal_reviews").insert({ student_id: studentId, request_note: note?.trim() || null });
  if (error?.code === "23505") throw new Error("התלמיד כבר ממתין להחלטת מנהל");
  fail(error);
};
export const decidePrincipalReview = async (id: string, decision: "accept" | "reject", summary: string) => {
  const { error } = await supabase.from("principal_reviews").update({ status: "decided", decision, summary: summary.trim() || null }).eq("id", id);
  fail(error);
};
export const cancelPrincipalReview = async (id: string) => {
  const { error } = await supabase.from("principal_reviews").update({ status: "cancelled" }).eq("id", id);
  fail(error);
};
export const markReviewSeen = async (id: string) => {
  const { error } = await supabase.from("principal_reviews").update({ seen_at: new Date().toISOString() }).eq("id", id);
  fail(error);
};
