import * as XLSX from "xlsx";
import {
  Appointment,
  Family,
  Grade,
  GRADE_LABEL,
  REGISTRATION_TRACK_LABELS,
  RegistrationTrack,
  STAGE_LABELS,
  Stage,
  STATION_ORDER,
  getRequiredDocuments,
  emptyStations,
} from "@/types/crm";
import { formatPhone } from "@/lib/whatsapp";
import { normalizeText, onlyDigits } from "@/lib/validation";

/* ============================ EXPORT ============================ */

export const familiesToSheetRows = (families: Family[], apptOf: (id: string) => Appointment | undefined) =>
  families.map((f) => {
    const req = getRequiredDocuments(f);
    const missing = req.filter((d) => !f.documents[d.key]).map((d) => d.label);
    const a = apptOf(f.id);
    return {
      "שם פרטי": f.firstName ?? "",
      "שם משפחה": f.lastName ?? "",
      "ת.ז.": f.studentId ?? "",
      "כיתה": GRADE_LABEL[f.grade] ?? f.grade,
      "מסלול": f.registrationTrack ? REGISTRATION_TRACK_LABELS[f.registrationTrack] : "",
      "סטטוס": STAGE_LABELS[f.stage],
      "עיר": f.city ?? "",
      "שם אבא": f.fatherName ?? "",
      "טלפון אבא": formatPhone(f.fatherPhone),
      "שם אמא": f.motherName ?? "",
      "טלפון אמא": formatPhone(f.motherPhone),
      "תאריך פגישה": a ? new Date(a.date).toLocaleDateString("he-IL") : "",
      "שעת פגישה": a ? new Date(a.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "",
      "אישור הגעה": f.rsvpStatus === "confirmed" ? "אישר" : f.rsvpStatus === "reschedule_requested" ? "ביקש מועד חדש" : "",
      "מסמכים שהתקבלו": `${req.length - missing.length}/${req.length}`,
      "מסמכים חסרים": missing.join(", "),
      "תחנות": `${STATION_ORDER.filter((k) => f.stations[k]).length}/${STATION_ORDER.length}`,
      "סיבת היסוס": f.hesitationReason ?? "",
      "הערות": f.notes ?? "",
      "בארכיון": f.isArchived ? "כן" : "",
      "נוצר": new Date(f.createdAt).toLocaleDateString("he-IL"),
    };
  });

export const exportFamiliesToExcel = (
  families: Family[],
  apptOf: (id: string) => Appointment | undefined,
  fileName = "רישום-מגדל-אור",
) => {
  const rows = familiesToSheetRows(families, apptOf);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Object.keys(rows[0] ?? { a: 1 }).map((k) => ({ wch: Math.max(10, k.length + 4) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "תלמידים");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
};

/* ============================ IMPORT ============================ */

export type ImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "studentId"
  | "grade"
  | "track"
  | "city"
  | "fatherName"
  | "motherName"
  | "fatherPhone"
  | "motherPhone"
  | "phone"
  | "notes"
  | "ignore";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  firstName: "שם פרטי",
  lastName: "שם משפחה",
  fullName: "שם מלא",
  studentId: "ת.ז. תלמיד",
  grade: "כיתה",
  track: "מסלול",
  city: "עיר",
  fatherName: "שם אבא",
  motherName: "שם אמא",
  fatherPhone: "טלפון אבא",
  motherPhone: "טלפון אמא",
  phone: "טלפון (כללי)",
  notes: "הערות",
  ignore: "— לא לייבא —",
};

/** Guess which field a header refers to (Hebrew & English, tolerant to spacing/quotes). */
export const guessField = (header: string): ImportField => {
  const h = normalizeText(header);
  const has = (...w: string[]) => w.some((x) => h.includes(x));
  if (has("ת ז", "תז", "תעודת זהות", "מספר זהות", "id")) {
    if (has("אב", "אם", "אפוטרופוס", "הורה")) return "ignore";
    return "studentId";
  }
  if (has("טלפון", "נייד", "פלאפון", "phone", "טל")) {
    if (has("אמא", "אם ")) return "motherPhone";
    if (has("אבא", "אב ")) return "fatherPhone";
    return "phone";
  }
  if (has("שם פרטי", "first")) return "firstName";
  if (has("שם משפחה", "משפחה", "last")) return "lastName";
  if (has("שם אבא", "אבא", "father")) return "fatherName";
  if (has("שם אמא", "אמא", "mother")) return "motherName";
  if (has("שם תלמיד", "שם מלא", "שם התלמיד", "תלמיד", "name")) return "fullName";
  if (h === "שם") return "fullName";
  if (has("כיתה", "שכבה", "grade")) return "grade";
  if (has("מסלול", "track", "מוסד")) return "track";
  if (has("עיר", "ישוב", "יישוב", "city")) return "city";
  if (has("הערה", "הערות", "notes")) return "notes";
  return "ignore";
};

const GRADE_WORDS: Record<string, Grade> = {
  "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "יא": 11, "יב": 12,
};

export const parseGrade = (v: unknown): Grade | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\D/g, ""));
  if (n >= 6 && n <= 12) return n as Grade;
  const t = normalizeText(String(v)).replace("כיתה", "").trim();
  return GRADE_WORDS[t] ?? null;
};

export const parseTrack = (v: unknown): RegistrationTrack | undefined => {
  const t = normalizeText(String(v ?? ""));
  if (!t) return undefined;
  if (t.includes("מתיבתא")) return "metivta";
  if (t.includes("ישיבה")) return "yeshiva_ketana";
  if (t.includes("מאור")) return "maor_israel";
  return undefined;
};

const cleanPhone = (v: unknown) => {
  const d = onlyDigits(String(v ?? ""));
  if (!d) return "";
  if (d.length === 9 && d.startsWith("5")) return "0" + d;
  return d;
};

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

export const readSpreadsheet = async (file: File): Promise<ParsedSheet> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
  // header row = first row that has at least 2 non-empty text cells
  const headerIdx = Math.max(0, matrix.findIndex((r) => (r as unknown[]).filter((c) => String(c).trim()).length >= 2));
  const headers = (matrix[headerIdx] as unknown[]).map((h, i) => String(h || `עמודה ${i + 1}`).trim());
  const rows = matrix.slice(headerIdx + 1).map((r) => {
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => (o[h] = (r as unknown[])[i]));
    return o;
  });
  return { headers, rows: rows.filter((r) => Object.values(r).some((v) => String(v ?? "").trim())) };
};

export interface ImportDefaults {
  grade: Grade;
  track?: RegistrationTrack;
  stage: Stage;
}

export const buildFamiliesFromSheet = (
  sheet: ParsedSheet,
  mapping: Record<string, ImportField>,
  defaults: ImportDefaults,
): { families: Omit<Family, "id" | "createdAt">[]; skipped: number } => {
  const out: Omit<Family, "id" | "createdAt">[] = [];
  let skipped = 0;
  for (const r of sheet.rows) {
    const get = (f: ImportField) => {
      const h = Object.keys(mapping).find((k) => mapping[k] === f);
      return h ? String(r[h] ?? "").trim() : "";
    };
    let firstName = get("firstName");
    let lastName = get("lastName");
    const full = get("fullName");
    if (!firstName && !lastName && full) {
      // Israeli lists are usually "family first"; keep it simple: last word = first name if 2 words
      const parts = full.split(/\s+/);
      if (parts.length >= 2) {
        lastName = parts[0];
        firstName = parts.slice(1).join(" ");
      } else firstName = full;
    }
    if (!firstName && !lastName) {
      skipped++;
      continue;
    }
    const fatherPhone = cleanPhone(get("fatherPhone") || get("phone"));
    const motherPhone = cleanPhone(get("motherPhone"));
    const fatherName = get("fatherName");
    const motherName = get("motherName");
    out.push({
      firstName,
      lastName,
      studentName: `${firstName} ${lastName}`.trim(),
      studentId: onlyDigits(get("studentId")) || undefined,
      grade: parseGrade(get("grade")) ?? defaults.grade,
      registrationTrack: parseTrack(get("track")) ?? defaults.track,
      city: get("city") || undefined,
      fatherName: fatherName || undefined,
      motherName: motherName || undefined,
      fatherPhone: fatherPhone || undefined,
      motherPhone: motherPhone || undefined,
      parentNames: [fatherName, motherName].filter(Boolean).join(" ו"),
      phone: fatherPhone || motherPhone,
      phone2: fatherPhone && motherPhone ? motherPhone : undefined,
      notes: get("notes") || undefined,
      stage: defaults.stage,
      documents: {},
      stations: emptyStations(),
    });
  }
  return { families: out, skipped };
};
