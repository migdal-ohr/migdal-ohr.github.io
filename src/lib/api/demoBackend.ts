import { generateDemoData, type DemoDataset } from "./demoData";
import type { ActivityRow, AppointmentRow, Backend, FamilyRow, RealtimeHandlers } from "./types";

/**
 * In-browser backend used in DEMO MODE (?demo=1).
 * - 1,400 synthetic students, persisted to localStorage
 * - mimics the server semantics (atomic patch, single appointment, RSVP tokens)
 * - "realtime" across tabs through BroadcastChannel
 */
const KEY = "migdal-demo-db-v2";
const CHANNEL = "migdal-demo-realtime";

let db: DemoDataset | null = null;
const handlers = new Set<RealtimeHandlers>();
let bc: BroadcastChannel | null = null;

type Msg =
  | { t: "family"; evt: "INSERT" | "UPDATE" | "DELETE"; row: FamilyRow | null; oldId?: string }
  | { t: "appt"; evt: "INSERT" | "UPDATE" | "DELETE"; row: AppointmentRow | null; oldFamilyId?: string; oldId?: string }
  | { t: "log"; row: ActivityRow };

const deliver = (m: Msg) => {
  for (const h of handlers) {
    if (m.t === "family") h.family?.(m.evt, m.row, m.oldId);
    else if (m.t === "appt") h.appointment?.(m.evt, m.row, m.oldFamilyId, m.oldId);
    else h.activity?.(m.row);
  }
};

const channel = () => {
  if (bc || typeof BroadcastChannel === "undefined") return bc;
  bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = (e) => {
    // another tab changed the data: reload from storage, then deliver
    db = null;
    load();
    deliver(e.data as Msg);
  };
  return bc;
};

let outbox: Msg[] = [];
const emit = (m: Msg) => {
  deliver(m);
  outbox.push(m);
  save();
};

/** Persist, THEN tell other tabs (so they read fresh data). */
const flush = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full / private mode — keep in memory */
  }
  const msgs = outbox;
  outbox = [];
  const ch = channel();
  if (ch) for (const m of msgs.slice(-200)) {
    try {
      ch.postMessage(m);
    } catch {
      /* ignore */
    }
  }
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
};
const saveNow = () => {
  if (saveTimer) clearTimeout(saveTimer);
  flush();
};

const load = (): DemoDataset => {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) db = JSON.parse(raw) as DemoDataset;
  } catch {
    db = null;
  }
  if (!db) {
    db = generateDemoData();
    save();
  }
  return db;
};

export const resetDemoData = () => {
  db = generateDemoData();
  saveNow();
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

export const demoBackend: Backend = {
  kind: "demo",

  async listFamilies() {
    await delay(120);
    return clone(load().families);
  },
  async listAppointments() {
    return clone(load().appointments);
  },

  async insertFamily(id, data) {
    await delay();
    const d = load();
    if (d.families.some((f) => f.id === id)) throw new Error("duplicate key");
    const row: FamilyRow = { id, data: clone(data), created_at: nowIso(), updated_at: nowIso(), rsvp_token: `demo-${crypto.randomUUID()}` };
    d.families.push(row);
    save();
    emit({ t: "family", evt: "INSERT", row: clone(row) });
    return clone(row);
  },

  async insertFamilies(rows) {
    for (const r of rows) await demoBackend.insertFamily(r.id, r.data);
    return rows.length;
  },

  async patchFamily(id, patch) {
    await delay(40);
    const d = load();
    const row = d.families.find((f) => f.id === id);
    if (!row) throw new Error("family not found");
    const { documents, stations, ...rest } = patch as Record<string, unknown>;
    const next: Record<string, unknown> = { ...row.data, ...rest };
    if (documents) next.documents = { ...((row.data.documents as object) ?? {}), ...(documents as object) };
    if (stations) next.stations = { ...((row.data.stations as object) ?? {}), ...(stations as object) };
    for (const k of Object.keys(next)) if (next[k] === null || next[k] === undefined) delete next[k];
    row.data = next;
    row.updated_at = nowIso();
    save();
    emit({ t: "family", evt: "UPDATE", row: clone(row) });
    return clone(next);
  },

  async deleteFamily(id) {
    await delay();
    const d = load();
    d.families = d.families.filter((f) => f.id !== id);
    const removed = d.appointments.filter((a) => a.family_id === id);
    d.appointments = d.appointments.filter((a) => a.family_id !== id);
    save();
    emit({ t: "family", evt: "DELETE", row: null, oldId: id });
    for (const a of removed) emit({ t: "appt", evt: "DELETE", row: null, oldFamilyId: id, oldId: a.id });
  },

  async setAppointment(familyId, dateIso, type = "פגישת רישום") {
    await delay();
    const d = load();
    const old = d.appointments.find((a) => a.family_id === familyId);
    d.appointments = d.appointments.filter((a) => a.family_id !== familyId);
    if (old) emit({ t: "appt", evt: "DELETE", row: null, oldFamilyId: familyId, oldId: old.id });
    if (dateIso) {
      const row: AppointmentRow = { id: `a${crypto.randomUUID().replace(/-/g, "")}`, family_id: familyId, date: dateIso, type };
      d.appointments.push(row);
      emit({ t: "appt", evt: "INSERT", row: clone(row) });
      const fam = d.families.find((f) => f.id === familyId);
      if (fam) {
        const changed = !old || +new Date(old.date) !== +new Date(dateIso);
        if (changed) fam.data = { ...fam.data, rsvpStatus: "pending", hasConfirmedAttendance: false };
        if (fam.data.stage === "leads") fam.data = { ...fam.data, stage: "meeting" };
        fam.updated_at = nowIso();
        emit({ t: "family", evt: "UPDATE", row: clone(fam) });
      }
    }
    save();
  },

  async listActivity(limit, familyId) {
    const rows = load().activity.filter((a) => !familyId || a.family_id === familyId);
    return clone(rows.slice(0, limit));
  },

  async logActivity(action_type, description, familyId) {
    const row: ActivityRow = {
      id: crypto.randomUUID(),
      action_type,
      description,
      family_id: familyId ?? null,
      created_at: nowIso(),
      actor_email: "demo@migdal-ohr.local",
    };
    load().activity.unshift(row);
    if (load().activity.length > 2000) load().activity.length = 2000;
    save();
    emit({ t: "log", row });
  },

  async listPotentials() {
    return clone(load().potentials).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  },
  async insertPotentials(rows) {
    const d = load();
    let n = 0;
    for (const r of rows) {
      if (r.id_number && d.potentials.some((p) => p.id_number === r.id_number)) continue;
      d.potentials.push({ ...r, id: crypto.randomUUID(), converted: false, converted_family_id: null, created_at: nowIso() });
      n++;
    }
    save();
    return n;
  },
  async updatePotential(id, patch) {
    const p = load().potentials.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
    save();
  },
  async deletePotential(id) {
    const d = load();
    d.potentials = d.potentials.filter((p) => p.id !== id);
    save();
  },

  async scanIdSlip() {
    await delay(1200);
    const now = Date.now();
    const dob = (years: number) => new Date(now - years * 365.25 * 86400000).toISOString().slice(0, 10);
    return {
      totalDetected: 5,
      children: [
        { fullName: "שמחה", idNumber: "900000018", dateOfBirth: dob(12.4), idValid: true },
        { fullName: "בנימין", idNumber: "900000026", dateOfBirth: dob(13.6), idValid: true },
        { fullName: "יהודה", idNumber: "900000034", dateOfBirth: dob(8.2), idValid: true },
      ],
    };
  },

  async uploadPhoto(_familyId, blob) {
    // keep photos inline in demo mode
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  },
  async photoUrl(path) {
    return path;
  },

  async uploadDoc(_familyId, file) {
    return await new Promise<string>((resolve, reject) => {
      if (file.size > 1.5 * 1024 * 1024) return reject(new Error("במצב הדגמה ניתן להעלות קבצים עד 1.5MB"));
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  },
  async docUrl(path) {
    return path;
  },
  async deleteDoc() {
    /* inline in demo */
  },

  async publicRegister(payload) {
    await delay(400);
    const p = payload as Record<string, string>;
    const d = load();
    if (p.studentId && d.families.some((f) => f.data.studentId === p.studentId)) return "exists";
    const id = `f${Date.now()}w`;
    const name = `${p.firstName} ${p.lastName}`;
    await demoBackend.insertFamily(id, {
      ...p,
      grade: Number(p.grade),
      studentName: name,
      parentNames: [p.fatherName, p.motherName].filter(Boolean).join(" ו"),
      phone: p.fatherPhone || p.motherPhone,
      stage: "leads",
      source: "web_form",
      notes: `נרשם דרך טופס ההרשמה באתר. ${p.notes ?? ""}`.trim(),
      documents: {},
      stations: {},
      createdAt: new Date().toISOString(),
    });
    await demoBackend.logActivity("web_registration", `נרשם דרך הטופס באתר: ${name}`, id);
    return "ok";
  },

  async getRsvp(token) {
    await delay(200);
    const d = load();
    const f = d.families.find((x) => x.rsvp_token === token && !x.data.isArchived);
    if (!f) return null;
    const a = d.appointments.find((x) => x.family_id === f.id);
    return {
      firstName: String(f.data.firstName ?? ""),
      appointmentDate: a?.date ?? null,
      status: (f.data.rsvpStatus as "pending") ?? "pending",
    };
  },

  async submitRsvp(token, status) {
    await delay(300);
    const d = load();
    const f = d.families.find((x) => x.rsvp_token === token);
    if (!f) throw new Error("invalid token");
    f.data = { ...f.data, rsvpStatus: status, hasConfirmedAttendance: status === "confirmed" };
    f.updated_at = nowIso();
    saveNow();
    emit({ t: "family", evt: "UPDATE", row: clone(f) });
    const name = String(f.data.studentName ?? "");
    await demoBackend.logActivity(
      status === "confirmed" ? "rsvp_confirmed" : "rsvp_reschedule",
      status === "confirmed" ? `${name} אישר/ה הגעה!` : `משפחת ${name} ביקשה מועד חדש`,
      f.id,
    );
    saveNow();
  },

  subscribe(h) {
    handlers.add(h);
    channel();
    return () => {
      handlers.delete(h);
    };
  },

  async currentUserEmail() {
    return "demo@migdal-ohr.local";
  },
  async signOut() {
    try {
      localStorage.removeItem("migdal-demo-mode");
    } catch {
      /* ignore */
    }
    window.location.href = "/auth";
  },
};
