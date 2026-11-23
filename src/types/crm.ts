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

export const REGISTRATION_TRACK_LABELS: Record<string, string> = {
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
export const REGISTRATION_TRACK_BADGE: Record<string, string> = {
  metivta: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700",
  yeshiva_ketana: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700",
  maor_israel: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700",
};

/* ---------- Family selection fields (drive dynamic doc list) ---------- */

export type FamilyStatus = "married" | "divorced" | "separated" | "single" | "single_father" | "widowed" | "unknown";
export const FAMILY_STATUS_LABELS: Record<FamilyStatus, string> = {
  married: "נשואים",
  divorced: "גרושים",
  separated: "פרודים",
  single: "חד הורית",
  single_father: "חד הורי",
  widowed: "אלמן/ה",
  unknown: "לא ידוע",
};
export const FAMILY_STATUS_ORDER: FamilyStatus[] = ["married", "divorced", "separated", "single", "single_father", "widowed", "unknown"];

export type Employment = "salaried" | "self_employed" | "unemployed" | "housewife" | "pensioner" | "other" | "na";
export const EMPLOYMENT_LABELS: Record<Employment, string> = {
  salaried: "שכיר/ה",
  self_employed: "עצמאי/ת",
  unemployed: "לא עובד/ת",
  housewife: "עקרת בית",
  pensioner: "פנסיונר/ית",
  other: "אחר",
  na: "לא רלוונטי",
};
export const EMPLOYMENT_ORDER: Employment[] = ["salaried", "self_employed", "unemployed", "pensioner", "other", "na"];
export const MOTHER_EMPLOYMENT_ORDER: Employment[] = ["salaried", "self_employed", "unemployed", "housewife", "pensioner", "other", "na"];

/* ---------- Phase 3: extra student-card fields (stored in students.details) ---------- */

export type Outcome = "in_process" | "accepted" | "rejected" | "not_suitable" | "studying" | "left";
export const OUTCOME_LABELS: Record<Outcome, string> = {
  in_process: "בתהליך",
  accepted: "התקבל",
  rejected: "לא התקבל",
  not_suitable: "לא מתאים",
  studying: "לומד",
  left: "עזב",
};
export const OUTCOME_ORDER: Outcome[] = ["in_process", "accepted", "rejected", "not_suitable", "studying", "left"];
export const OUTCOME_BADGE: Record<Outcome, string> = {
  in_process: "bg-muted text-muted-foreground",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  not_suitable: "bg-orange-100 text-orange-800",
  studying: "bg-sky-100 text-sky-800",
  left: "bg-zinc-200 text-zinc-700",
};

export const HMO_LABELS: Record<string, string> = { clalit: "כללית", maccabi: "מכבי", meuhedet: "מאוחדת", leumit: "לאומית" };
export const RELIGIOUS_LABELS: Record<string, string> = { haredi: "חרדי", dati_leumi: "דתי לאומי", mitchazek: "מתחזק", lo_dati: "לא דתי" };
export const GENDER_LABELS: Record<string, string> = { m: "זכר", f: "נקבה" };
export const CAMP_LABELS: Record<string, string> = { coming: "מגיע", not_coming: "לא מגיע" };

/** Keys stored in students.details (merged key-by-key on the server). */
export const DETAIL_KEYS = [
  "gender", "address", "zip", "mailAddress", "email", "homePhone", "studentMobile", "birthCountry", "aliyahDate", "hmo", "religious",
  "fatherIdNumber", "fatherBirthYear", "fatherSchoolYears", "fatherAddress", "fatherCity", "fatherWhatsapp",
  "motherIdNumber", "motherBirthYear", "motherSchoolYears", "motherAddress", "motherCity", "motherWhatsapp", "motherAvrech",
  "siblingsCount", "prevCity", "prevSchool", "prevSchoolSymbol", "prevGrade",
  "recruiterId", "outcome", "startDate", "endDate", "campStatus", "familyGroup",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];
export type StudentDetails = Partial<Record<DetailKey, string | number | boolean | null>>;

/* ---------- Documents (dynamic) ---------- */

export interface RequiredDoc {
  key: string;
  label: string;
}

/** Document catalog: editable by admins (app_settings.documents_catalog). Keys are never removed, only switched off. */
export type DocMode = "always" | "optional" | "off";
export interface CatalogDoc extends RequiredDoc {
  mode: DocMode;
}
export const DEFAULT_DOCS_CATALOG: CatalogDoc[] = [
  { key: "id_card", label: "צילום תעודת זהות", mode: "always" },
  { key: "medical_summary", label: "סיכום מידע רפואי", mode: "always" },
  { key: "school_cert", label: 'תעודת ביה"ס', mode: "always" },
  { key: "bank_statements", label: 'תדפיסי עו"ש', mode: "always" },
  { key: "opt_diagnostics", label: "אבחונים", mode: "optional" },
  { key: "opt_eligibility", label: "ועדת זכאות ואיפיון", mode: "optional" },
  { key: "opt_residence", label: "אישור מגורים", mode: "optional" },
  { key: "opt_confidentiality", label: "ויתור סודיות", mode: "optional" },
  { key: "opt_standing_order", label: "הוראת קבע", mode: "optional" },
];
let docsCatalog: CatalogDoc[] = DEFAULT_DOCS_CATALOG;
/** Merge the saved catalog with the defaults (new default docs appear automatically). */
export const setDocsCatalog = (saved?: CatalogDoc[] | null) => {
  const list = Array.isArray(saved) ? saved.filter((d) => d && d.key && d.label) : [];
  const keys = new Set(list.map((d) => d.key));
  docsCatalog = [...list, ...DEFAULT_DOCS_CATALOG.filter((d) => !keys.has(d.key))];
};
export const getDocsCatalog = () => docsCatalog;
/** Always-required documents */
export const getFixedDocs = (): RequiredDoc[] => docsCatalog.filter((d) => d.mode === "always");
/** Optional docs (added manually via "הוסף מסמך ייעודי") */
export const getOptionalDocs = (): RequiredDoc[] => docsCatalog.filter((d) => d.mode === "optional");
/** @deprecated use getFixedDocs() */
export const FIXED_DOCS: RequiredDoc[] = DEFAULT_DOCS_CATALOG.filter((d) => d.mode === "always");
/** @deprecated use getOptionalDocs() */
export const OPTIONAL_DOCS: RequiredDoc[] = DEFAULT_DOCS_CATALOG.filter((d) => d.mode === "optional");

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
  const list: RequiredDoc[] = [...getFixedDocs()];
  if (f.familyStatus === "divorced") {
    list.push({ key: "divorce_agreement", label: "הסכם גירושין" });
  }
  list.push(...employmentDocs("father", f.fatherEmployment ?? "na", !!f.fatherAvrech));
  list.push(...employmentDocs("mother", f.motherEmployment ?? "na", false));
  // Optional docs the user explicitly added
  for (const k of f.optionalDocs ?? []) {
    const def = docsCatalog.find((d) => d.key === k && d.mode !== "off");
    if (def && !list.some((x) => x.key === def.key)) list.push(def);
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
  // phase 3 details (see DETAIL_KEYS)
  gender?: string;
  address?: string;
  zip?: string;
  mailAddress?: string;
  email?: string;
  homePhone?: string;
  studentMobile?: string;
  birthCountry?: string;
  aliyahDate?: string;
  birthDate?: string;
  hmo?: string;
  religious?: string;
  fatherIdNumber?: string;
  fatherBirthYear?: number;
  fatherSchoolYears?: number;
  fatherAddress?: string;
  fatherCity?: string;
  fatherWhatsapp?: boolean;
  motherIdNumber?: string;
  motherBirthYear?: number;
  motherSchoolYears?: number;
  motherAddress?: string;
  motherCity?: string;
  motherWhatsapp?: boolean;
  siblingsCount?: number;
  prevCity?: string;
  prevSchool?: string;
  prevSchoolSymbol?: string;
  prevGrade?: string;
  recruiterId?: string;
  outcome?: Outcome;
  startDate?: string;
  endDate?: string;
  campStatus?: string;
  familyGroup?: string;
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

export type EventKind = "registration" | "tour" | "interview" | "registration_day" | "other";
export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  registration: "פגישת רישום",
  tour: "סיור",
  interview: "ראיון",
  registration_day: "יום רישום",
  other: "אחר",
};
export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  registration: "bg-primary/10 text-primary border-primary/30",
  tour: "bg-emerald-50 text-emerald-800 border-emerald-200",
  interview: "bg-violet-50 text-violet-800 border-violet-200",
  registration_day: "bg-amber-50 text-amber-800 border-amber-200",
  other: "bg-muted text-foreground border-border",
};
/** Every calendar event (registration meeting, tour, interview…). */
export interface CalendarEvent {
  id: string;
  familyId: string;
  kind: EventKind;
  date: string;
  type: string;
  attended: boolean | null;
  notes?: string | null;
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

export const TRACK_HEX: Record<string, string> = {
  metivta: "#3b82f6",
  yeshiva_ketana: "#10b981",
  maor_israel: "#f59e0b",
};

/** Docs that are still missing for a family (labels). */
export const getMissingDocuments = (f: Family): RequiredDoc[] =>
  getRequiredDocuments(f).filter((d) => !f.documents?.[d.key]);

export const stationsDoneCount = (f: Family): number =>
  STATION_ORDER.filter((k) => f.stations?.[k]).length;

/* ---------- Institutions (tracks) are a managed list; keep the label maps in sync ---------- */
const EXTRA_BADGES = [
  "bg-rose-100 text-rose-800 border-rose-300",
  "bg-violet-100 text-violet-800 border-violet-300",
  "bg-cyan-100 text-cyan-800 border-cyan-300",
  "bg-lime-100 text-lime-800 border-lime-300",
];
const EXTRA_HEX = ["#f43f5e", "#8b5cf6", "#06b6d4", "#84cc16"];
/** Called once the institutions table is loaded: new institutions get labels, colours and a place in the order. */
export const setInstitutionNames = (list: { key: string; name: string; is_active: boolean; sort: number }[]) => {
  if (!list.length) return;
  let extra = 0;
  for (const i of list) {
    REGISTRATION_TRACK_LABELS[i.key] = i.name;
    if (!REGISTRATION_TRACK_BADGE[i.key]) REGISTRATION_TRACK_BADGE[i.key] = EXTRA_BADGES[extra % EXTRA_BADGES.length];
    if (!TRACK_HEX[i.key]) TRACK_HEX[i.key] = EXTRA_HEX[extra++ % EXTRA_HEX.length];
  }
  const active = [...list].filter((i) => i.is_active).sort((a, b) => a.sort - b.sort).map((i) => i.key as RegistrationTrack);
  REGISTRATION_TRACK_ORDER.splice(0, REGISTRATION_TRACK_ORDER.length, ...active);
};
