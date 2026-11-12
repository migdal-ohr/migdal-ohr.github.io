export type Stage = "leads" | "meeting" | "documents" | "complete" | "persuasion";

export const STAGE_LABELS: Record<Stage, string> = {
  leads: "מתעניינים",
  meeting: "נקבעה פגישה",
  documents: "חסרים מסמכים",
  complete: "הרישום הושלם",
  persuasion: "תלמידים לשכנוע",
};

/** Active pipeline stages shown on the Kanban board. 'persuasion' is a side-track. */
export const STAGE_ORDER: Stage[] = ["leads", "meeting", "documents", "complete"];
export const ALL_STAGES: Stage[] = [...STAGE_ORDER, "persuasion"];

export type Grade = 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const GRADE_LABEL: Record<Grade, string> = {
  6: "כיתה ו׳",
  7: "כיתה ז׳",
  8: "כיתה ח׳",
  9: "כיתה ט׳",
  10: "כיתה י׳",
  11: "כיתה יא׳",
  12: "כיתה יב׳",
};

export const composeFullName = (firstName?: string, lastName?: string, fallback?: string): string => {
  const a = (firstName ?? "").trim();
  const b = (lastName ?? "").trim();
  const full = [a, b].filter(Boolean).join(" ");
  return full || (fallback ?? "");
};

export const composeParentNames = (fatherName?: string, motherName?: string, fallback?: string): string => {
  const a = (fatherName ?? "").trim();
  const b = (motherName ?? "").trim();
  if (a && b) return `${a} ו${b}`;
  return a || b || (fallback ?? "");
};

/* ---------- Registration Track ---------- */

export type RegistrationTrack = "metivta" | "yeshiva_ketana" | "maor_israel";

export const REGISTRATION_TRACK_LABELS: Record<RegistrationTrack, string> = {
  metivta: "מתיבתא",
  yeshiva_ketana: "ישיבה קטנה",
  maor_israel: "מאור ישראל",
};

export const REGISTRATION_TRACK_ORDER: RegistrationTrack[] = [
  "metivta",
  "yeshiva_ketana",
  "maor_israel",
];

/** Tailwind classes for the prominent track badge */
export const REGISTRATION_TRACK_BADGE: Record<RegistrationTrack, string> = {
  metivta: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700",
  yeshiva_ketana: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700",
  maor_israel: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700",
};

/* ---------- Family selection fields (drive dynamic doc list) ---------- */

export type FamilyStatus = "married" | "divorced" | "single" | "widowed";
export const FAMILY_STATUS_LABELS: Record<FamilyStatus, string> = {
  married: "נשואים",
  divorced: "גרושים",
  single: "הורה יחידני",
  widowed: "אלמנ/ה",
};
export const FAMILY_STATUS_ORDER: FamilyStatus[] = ["married", "divorced", "single", "widowed"];

export type Employment = "salaried" | "self_employed" | "unemployed" | "na";
export const EMPLOYMENT_LABELS: Record<Employment, string> = {
  salaried: "שכיר",
  self_employed: "עצמאי",
  unemployed: "לא עובד",
  na: "לא רלוונטי",
};
export const EMPLOYMENT_ORDER: Employment[] = ["salaried", "self_employed", "unemployed", "na"];

/* ---------- Documents (dynamic) ---------- */

export interface RequiredDoc {
  key: string;
  label: string;
}

/** Always-required documents */
export const FIXED_DOCS: RequiredDoc[] = [
  { key: "id_card", label: "צילום תעודת זהות" },
  { key: "medical_summary", label: "סיכום מידע רפואי" },
  { key: "school_cert", label: 'תעודת ביה"ס' },
  { key: "bank_statements", label: 'תדפיסי עו"ש' },
];

/** Optional docs (added manually via "הוסף מסמך ייעודי") */
export const OPTIONAL_DOCS: RequiredDoc[] = [
  { key: "opt_diagnostics", label: "אבחונים" },
  { key: "opt_eligibility", label: "ועדת זכאות ואיפיון" },
];

const employmentDocs = (parent: "father" | "mother", emp: Employment, avrech: boolean): RequiredDoc[] => {
  const p = parent === "father" ? "אבא" : "אמא";
  const out: RequiredDoc[] = [];
  if (emp === "salaried") out.push({ key: `${parent}_payslips`, label: `תלושי משכורת - ${p}` });
  else if (emp === "self_employed") out.push({ key: `${parent}_self_tax`, label: `שומת מס - ${p}` });
  else if (emp === "unemployed") {
    out.push({ key: `${parent}_unemployed`, label: `מעמד לא עובד מביטוח לאומי - ${p}` });
    out.push({ key: `${parent}_benefits`, label: `ריכוז קצבאות - ${p}` });
  }
  if (avrech) out.push({ key: `${parent}_avrech_cert`, label: `אישור כולל - ${p}` });
  return out;
};

/** Compute the dynamic required-document list for a family. */
export const getRequiredDocuments = (f: {
  familyStatus?: FamilyStatus;
  fatherEmployment?: Employment;
  motherEmployment?: Employment;
  fatherAvrech?: boolean;
  motherAvrech?: boolean;
  optionalDocs?: string[];
}): RequiredDoc[] => {
  const list: RequiredDoc[] = [...FIXED_DOCS];
  if (f.familyStatus === "divorced") {
    list.push({ key: "divorce_agreement", label: "הסכם גירושין" });
  }
  list.push(...employmentDocs("father", f.fatherEmployment ?? "na", !!f.fatherAvrech));
  list.push(...employmentDocs("mother", f.motherEmployment ?? "na", false));
  // Optional docs the user explicitly added
  for (const k of f.optionalDocs ?? []) {
    const def = OPTIONAL_DOCS.find((d) => d.key === k);
    if (def) list.push(def);
  }
  return list;
};

/* ---------- Stations ---------- */

export type StationKey = "forms" | "exam" | "social" | "principal" | "tour";

export const STATION_LABELS: Record<StationKey, string> = {
  forms: "מילוי טפסים",
  exam: "מבחן",
  social: 'ראיון עו"ס',
  principal: "ראיון מנהל",
  tour: "סיור",
};

export const STATION_ORDER: StationKey[] = ["forms", "exam", "social", "principal", "tour"];

export const emptyStations = (): Record<StationKey, boolean> => ({
  forms: false,
  exam: false,
  social: false,
  principal: false,
  tour: false,
});

/* ---------- RSVP ---------- */

export type RsvpStatus = "pending" | "confirmed" | "reschedule_requested";

/* ---------- Family ---------- */

export interface Family {
  id: string;
  /** Derived: `${firstName} ${lastName}`. Kept for backward compatibility. */
  studentName: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  /** Legacy inline base64 photo (v1). New photos live in Storage → photoPath. */
  photoUrl?: string;
  /** Storage object path in the `student-photos` bucket (v2). */
  photoPath?: string;
  city?: string;
  grade: Grade;
  /** Derived from fatherName + motherName. Kept for backward compatibility. */
  parentNames: string;
  fatherName?: string;
  motherName?: string;
  /** Derived: fatherPhone (primary). Kept for backward compatibility. */
  phone: string;
  /** Derived: motherPhone (secondary). Kept for backward compatibility. */
  phone2?: string;
  fatherPhone?: string;
  motherPhone?: string;
  stage: Stage;

  // New conditional fields
  familyStatus?: FamilyStatus;
  fatherEmployment?: Employment;
  motherEmployment?: Employment;
  fatherAvrech?: boolean;
  motherAvrech?: boolean;
  optionalDocs?: string[]; // keys of OPTIONAL_DOCS user added

  /** Map of doc key -> received status. Keys correspond to dynamically computed required docs. */
  documents: Record<string, boolean>;
  stations: Record<StationKey, boolean>;
  registrationTrack?: RegistrationTrack;
  notes?: string;
  hesitationReason?: string;
  /** Archived students are hidden from all active views. */
  isArchived?: boolean;
  hasConfirmedAttendance?: boolean;
  rsvpStatus?: RsvpStatus;
  /** Uploaded scans per document key (Storage paths in `student-docs`). */
  files?: Record<string, DocFile[]>;
  /** Where the lead came from, e.g. "web_form" */
  source?: string;
  /** Secret token used in the parent RSVP link (from families.rsvp_token). */
  rsvpToken?: string;
  createdAt: string;
  /** Last DB update timestamp (from row.updated_at). Used for persuasion staleness. */
  updatedAt?: string;
}

export interface DocFile {
  path: string;
  name: string;
  uploadedAt: string;
}

export interface Appointment {
  id: string;
  familyId: string;
  date: string;
  type: string;
}

/** Dot colour per stage (used by board, table, stats). */
export const STAGE_DOT: Record<Stage, string> = {
  leads: "bg-info",
  meeting: "bg-[hsl(270_60%_55%)]",
  documents: "bg-warning",
  complete: "bg-success",
  persuasion: "bg-rose-400",
};

/** Chart colour per stage (hex, for recharts). */
export const STAGE_HEX: Record<Stage, string> = {
  leads: "#3b8beb",
  meeting: "#8b5cf6",
  documents: "#f5a524",
  complete: "#22a06b",
  persuasion: "#f472b6",
};

export const TRACK_HEX: Record<RegistrationTrack, string> = {
  metivta: "#3b82f6",
  yeshiva_ketana: "#10b981",
  maor_israel: "#f59e0b",
};

/** Docs that are still missing for a family (labels). */
export const getMissingDocuments = (f: Family): RequiredDoc[] =>
  getRequiredDocuments(f).filter((d) => !f.documents?.[d.key]);

export const stationsDoneCount = (f: Family): number =>
  STATION_ORDER.filter((k) => f.stations?.[k]).length;
