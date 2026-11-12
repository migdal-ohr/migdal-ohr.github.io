import { supabase } from "@/integrations/supabase/client";
import type {
  ActivityRow,
  AppointmentRow,
  Backend,
  FamilyRow,
  PotentialRow,
  RealtimeHandlers,
  RsvpInfo,
} from "./types";

/* =====================================================================
 * v3 backend — normalized `students` table in the institution's own
 * Supabase project. The rest of the app speaks the camelCase "Family"
 * shape; this file is the single translation layer.
 * ===================================================================== */

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

const raise = (error: { message: string; code?: string } | null) => {
  if (!error) return;
  if (error.code === "42501" || /not allowed|permission denied|row-level security/i.test(error.message)) {
    throw new Error("אין לך הרשאה לפעולה הזו");
  }
  throw new Error(error.message);
};

/* ---------------- school year scope ---------------- */

let currentYearId: string | null = null;
/** Which school year the app is looking at (null = the current one). */
export const setSchoolYearScope = (id: string | null) => {
  currentYearId = id;
};
export const getSchoolYearScope = () => currentYearId;

/* ---------------- row mapping ---------------- */

export interface StudentRow {
  id: string;
  legacy_id: string | null;
  school_year_id: string;
  first_name: string;
  last_name: string;
  id_number: string | null;
  birth_date: string | null;
  city: string | null;
  grade: number;
  track: string | null;
  stage: string;
  family_status: string;
  father_name: string | null;
  father_phone: string | null;
  father_employment: string;
  father_avrech: boolean;
  mother_name: string | null;
  mother_phone: string | null;
  mother_employment: string;
  optional_docs: string[];
  documents: Record<string, boolean>;
  stations: Record<string, boolean>;
  files: Record<string, unknown>;
  notes: string | null;
  hesitation_reason: string | null;
  photo_path: string | null;
  source: string | null;
  rsvp_status: string;
  rsvp_token: string;
  is_archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

const u = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? undefined : v);

export const studentToFamilyRow = (s: StudentRow): FamilyRow => {
  const fatherName = u(s.father_name);
  const motherName = u(s.mother_name);
  const fatherPhone = u(s.father_phone);
  const motherPhone = u(s.mother_phone);
  return {
    id: s.id,
    created_at: s.created_at,
    updated_at: s.updated_at,
    rsvp_token: s.rsvp_token,
    data: {
      firstName: s.first_name,
      lastName: s.last_name,
      studentName: `${s.first_name} ${s.last_name}`.trim(),
      studentId: u(s.id_number),
      birthDate: u(s.birth_date),
      city: u(s.city),
      grade: s.grade,
      registrationTrack: u(s.track),
      stage: s.stage,
      familyStatus: s.family_status,
      fatherName,
      fatherPhone,
      fatherEmployment: s.father_employment,
      fatherAvrech: s.father_avrech,
      motherName,
      motherPhone,
      motherEmployment: s.mother_employment,
      parentNames: [fatherName, motherName].filter(Boolean).join(" ו"),
      phone: fatherPhone || motherPhone || "",
      phone2: fatherPhone && motherPhone ? motherPhone : undefined,
      optionalDocs: s.optional_docs ?? [],
      documents: s.documents ?? {},
      stations: s.stations ?? {},
      files: s.files ?? {},
      notes: u(s.notes),
      hesitationReason: u(s.hesitation_reason),
      photoPath: u(s.photo_path),
      source: u(s.source),
      rsvpStatus: s.rsvp_status,
      hasConfirmedAttendance: s.rsvp_status === "confirmed",
      isArchived: s.is_archived,
      schoolYearId: s.school_year_id,
      version: s.version,
      createdAt: s.created_at,
      createdBy: s.created_by,
      updatedBy: s.updated_by,
    },
  };
};

/** Keys the server understands in patch_student / insert_students. */
const WRITABLE = new Set([
  "firstName", "lastName", "studentId", "birthDate", "city", "grade", "registrationTrack", "stage",
  "familyStatus", "fatherName", "fatherPhone", "fatherEmployment", "fatherAvrech", "motherName",
  "motherPhone", "motherEmployment", "optionalDocs", "documents", "stations", "files", "notes",
  "hesitationReason", "photoPath", "source", "rsvpStatus", "isArchived", "schoolYearId",
]);

const cleanPatch = (p: Record<string, unknown>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (WRITABLE.has(k)) out[k] = v === undefined ? null : v;
  // legacy "hasConfirmedAttendance" → rsvpStatus
  if (!("rsvpStatus" in out) && typeof p.hasConfirmedAttendance === "boolean" && p.hasConfirmedAttendance) out.rsvpStatus = "confirmed";
  return out;
};

const apptRow = (a: { id: string; student_id: string; starts_at: string; type: string }): AppointmentRow => ({
  id: a.id,
  family_id: a.student_id,
  date: a.starts_at,
  type: a.type,
});

const activityRow = (r: Record<string, unknown>): ActivityRow => ({
  id: String(r.id),
  action_type: String(r.action_type),
  description: String(r.description),
  created_at: String(r.created_at),
  family_id: (r.student_id as string) ?? null,
  actor_email: (r.actor_email as string) ?? null,
});

const inScope = (yearId: string | undefined | null) => !currentYearId || !yearId || yearId === currentYearId;

/* ---------------- backend ---------------- */

export const supabaseBackend: Backend = {
  kind: "supabase",

  async listFamilies() {
    let yearId = currentYearId;
    if (!yearId) {
      const { data } = await supabase.from("school_years").select("id").eq("is_current", true).maybeSingle();
      yearId = data?.id ?? null;
    }
    const rows = await fetchAll<StudentRow>((a, b) => {
      let q = supabase.from("students").select("*").order("created_at", { ascending: true }).range(a, b);
      if (yearId) q = q.eq("school_year_id", yearId);
      return q as never;
    });
    return rows.map(studentToFamilyRow);
  },

  async listAppointments() {
    const rows = await fetchAll<{ id: string; student_id: string; starts_at: string; type: string }>((a, b) =>
      supabase.from("appointments").select("id, student_id, starts_at, type").order("starts_at", { ascending: true }).range(a, b) as never,
    );
    return rows.map(apptRow);
  },

  async insertFamily(_id, data) {
    const payload = cleanPatch(data);
    if (currentYearId && !payload.schoolYearId) payload.schoolYearId = currentYearId;
    const { data: rows, error } = await supabase.rpc("insert_students", { p_rows: payload });
    raise(error);
    const row = (rows as StudentRow[])[0];
    return studentToFamilyRow(row);
  },

  async insertFamilies(rows) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => {
        const p = cleanPatch(r.data);
        if (currentYearId && !p.schoolYearId) p.schoolYearId = currentYearId;
        return p;
      });
      const { data, error } = await supabase.rpc("insert_students", { p_rows: chunk });
      raise(error);
      n += (data as unknown[])?.length ?? 0;
    }
    return n;
  },

  async patchFamily(id, patch) {
    const p = cleanPatch(patch);
    if (Object.keys(p).length === 0) return {};
    const { data, error } = await supabase.rpc("patch_student", { p_id: id, p_patch: p });
    raise(error);
    return studentToFamilyRow(data as StudentRow).data;
  },

  async deleteFamily(id) {
    const { error } = await supabase.from("students").delete().eq("id", id);
    raise(error);
  },

  async setAppointment(familyId, dateIso, type) {
    const { error } = await supabase.rpc("set_student_appointment", {
      p_student_id: familyId,
      p_starts_at: dateIso,
      p_type: type ?? "פגישת רישום",
    });
    raise(error);
  },

  async listActivity(limit, familyId) {
    let q = supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(limit);
    if (familyId) q = q.eq("student_id", familyId);
    const { data, error } = await q;
    raise(error);
    return (data ?? []).map(activityRow);
  },

  async logActivity(action_type, description, familyId) {
    try {
      await supabase.from("activity_logs").insert({ action_type, description, student_id: familyId ?? null });
    } catch (e) {
      console.error("logActivity failed", e);
    }
  },

  async listPotentials() {
    const { data, error } = await supabase.from("potentials").select("*").order("created_at", { ascending: false });
    raise(error);
    return (data ?? []).map((r: Record<string, unknown>) => ({ ...r, converted_family_id: r.converted_student_id })) as PotentialRow[];
  },

  async insertPotentials(rows) {
    if (rows.length === 0) return 0;
    const { data, error } = await supabase
      .from("potentials")
      .upsert(rows, { onConflict: "id_number", ignoreDuplicates: true })
      .select("id");
    raise(error);
    return data?.length ?? 0;
  },

  async updatePotential(id, patch) {
    const { converted_family_id, ...rest } = patch as Record<string, unknown>;
    const body = converted_family_id !== undefined ? { ...rest, converted_student_id: converted_family_id } : rest;
    const { error } = await supabase.from("potentials").update(body).eq("id", id);
    raise(error);
  },

  async deletePotential(id) {
    const { error } = await supabase.from("potentials").delete().eq("id", id);
    raise(error);
  },

  async scanIdSlip(images, mimeType) {
    const { data, error } = await supabase.functions.invoke("scan-id-slip", { body: { images, mimeType } });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.json();
          if (body?.error) throw new Error(body.error);
        } catch (e) {
          if (e instanceof Error && e.message) throw e;
        }
      }
      throw new Error(error.message);
    }
    return data as { children: never[]; totalDetected?: number };
  },

  async uploadPhoto(familyId, blob) {
    const path = `${familyId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("student-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    raise(error);
    return path;
  },

  async photoUrl(path) {
    const { data } = await supabase.storage.from("student-photos").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  },

  async uploadDoc(familyId, file) {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${familyId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("student-docs").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    raise(error);
    return path;
  },

  async docUrl(path) {
    const { data } = await supabase.storage.from("student-docs").createSignedUrl(path, 60 * 10);
    return data?.signedUrl ?? null;
  },

  async deleteDoc(path) {
    const { error } = await supabase.storage.from("student-docs").remove([path]);
    raise(error);
  },

  async publicRegister(payload) {
    const { data, error } = await supabase.rpc("public_register", { p: payload });
    raise(error);
    return String(data ?? "ok");
  },

  async getRsvp(token): Promise<RsvpInfo | null> {
    const { data, error } = await supabase.rpc("get_rsvp", { p_token: token });
    if (error) return null;
    const row = (data ?? [])[0];
    if (!row) return null;
    return {
      firstName: row.first_name ?? "",
      appointmentDate: row.appointment_date,
      status: (row.rsvp_status as RsvpInfo["status"]) ?? "pending",
    };
  },

  async submitRsvp(token, status) {
    const { error } = await supabase.rpc("submit_rsvp", { p_token: token, p_status: status });
    raise(error);
  },

  subscribe(h: RealtimeHandlers) {
    let connectedOnce = false;
    const ch = supabase
      .channel(`crm-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, (p) => {
        const evt = p.eventType as "INSERT" | "UPDATE" | "DELETE";
        if (evt === "DELETE") {
          h.family?.("DELETE", null, (p.old as { id?: string })?.id);
          return;
        }
        const row = p.new as StudentRow;
        if (!inScope(row.school_year_id)) {
          // moved to another year → disappears from this view
          h.family?.("DELETE", null, row.id);
          return;
        }
        h.family?.(evt, studentToFamilyRow(row));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (p) => {
        const evt = p.eventType as "INSERT" | "UPDATE" | "DELETE";
        const old = p.old as { student_id?: string; id?: string };
        h.appointment?.(
          evt,
          evt === "DELETE" ? null : apptRow(p.new as { id: string; student_id: string; starts_at: string; type: string }),
          old?.student_id,
          old?.id,
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (p) => {
        h.activity?.(activityRow(p.new as Record<string, unknown>));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (connectedOnce) h.reconnect?.();
          connectedOnce = true;
        }
      });
    return () => {
      supabase.removeChannel(ch);
    };
  },

  async currentUserEmail() {
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  },

  async signOut() {
    // shared office computers: wipe the local snapshot on logout
    const { cacheClear } = await import("@/lib/offlineCache");
    await cacheClear();
    await supabase.auth.signOut();
  },
};
