import { describe, it, expect } from "vitest";
import { isValidIsraeliId, normalizeId, normalizeText } from "@/lib/validation";
import { toWhatsAppNumber, waLink, formatPhone, isValidIsraeliPhone, buildRemindDocsMessage, buildMeetingReminderMessage } from "@/lib/whatsapp";
import { getRequiredDocuments, Family, emptyStations } from "@/types/crm";
import { matchesSearch } from "@/components/crm/SearchBar";
import { matchGrade } from "@/components/crm/PotentialsView";
import { guessField, parseGrade, parseTrack, buildFamiliesFromSheet } from "@/lib/excel";
import { ensureShape } from "@/store/crmStore";
import { generateDemoData } from "@/lib/api/demoData";

const fam = (over: Partial<Family> = {}): Family =>
  ensureShape({
    id: "f1",
    studentName: "משה כהן",
    firstName: "משה",
    lastName: "כהן",
    grade: 7,
    parentNames: "",
    fatherName: "אבי",
    motherName: "רחל",
    phone: "",
    fatherPhone: "052-1234567",
    motherPhone: "054-7654321",
    city: "מגדל העמק",
    studentId: "000000018",
    stage: "leads",
    documents: {},
    stations: emptyStations(),
    createdAt: new Date().toISOString(),
    ...over,
  } as Family);

describe("Israeli ID", () => {
  it("accepts valid check digits", () => {
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("18")).toBe(false); // too short
    expect(isValidIsraeliId("123456782")).toBe(true);
  });
  it("treats all-zero placeholders as no ID", () => {
    expect(isValidIsraeliId("000000000")).toBe(false);
    expect(normalizeId("00000000")).toBe("");
  });
  it("rejects bad check digits", () => {
    expect(isValidIsraeliId("123456789")).toBe(false);
  });
  it("normalizes with leading zeros", () => {
    expect(normalizeId("12345678-2")).toBe("123456782");
    expect(normalizeId("18")).toBe("000000018");
  });
});

describe("WhatsApp helpers", () => {
  it("converts Israeli numbers to 972", () => {
    expect(toWhatsAppNumber("052-123-4567")).toBe("972521234567");
    expect(toWhatsAppNumber("+972 52 1234567")).toBe("972521234567");
    expect(toWhatsAppNumber("521234567")).toBe("972521234567");
  });
  it("encodes Hebrew + newlines", () => {
    const l = waLink("0521234567", "שלום\nעולם");
    expect(l.startsWith("https://wa.me/972521234567?text=")).toBe(true);
    expect(decodeURIComponent(l.split("text=")[1])).toBe("שלום\nעולם");
  });
  it("formats and validates phones", () => {
    expect(formatPhone("0521234567")).toBe("052-123-4567");
    expect(formatPhone("972521234567")).toBe("052-123-4567");
    expect(isValidIsraeliPhone("052-1234567")).toBe(true);
    expect(isValidIsraeliPhone("04-6541234")).toBe(true);
    expect(isValidIsraeliPhone("12345")).toBe(false);
  });
  it("builds the docs message as a dashed list with signature", () => {
    const m = buildRemindDocsMessage("אבי", ["תעודת זהות", "תלושי משכורת"]);
    expect(m).toContain("שלום אבי");
    expect(m).toContain("- תעודת זהות\n- תלושי משכורת");
    expect(m).toContain("צוות רישום מגדל אור");
  });
  it("builds the meeting message with address, items and RSVP link", () => {
    const m = buildMeetingReminderMessage("רחל", "2026-11-10T08:30:00.000Z", "https://x/rsvp?t=abc");
    expect(m).toContain("שלום רחל");
    expect(m).toContain("רחוב הרב בוסקילה 10");
    expect(m).toContain("להביא תעודת זהות ותעודת בית ספר");
    expect(m).toContain("https://x/rsvp?t=abc");
  });
});

describe("Dynamic required documents", () => {
  it("always has the 4 fixed docs", () => {
    expect(getRequiredDocuments({}).map((d) => d.key)).toEqual(["id_card", "medical_summary", "school_cert", "bank_statements"]);
  });
  it("adds per status/employment exactly as specified", () => {
    const keys = getRequiredDocuments({
      familyStatus: "divorced",
      fatherEmployment: "unemployed",
      motherEmployment: "self_employed",
      fatherAvrech: true,
      motherAvrech: true, // must be ignored (removed feature)
      optionalDocs: ["opt_diagnostics"],
    }).map((d) => d.key);
    expect(keys).toContain("divorce_agreement");
    expect(keys).toContain("father_unemployed");
    expect(keys).toContain("father_benefits");
    expect(keys).toContain("father_avrech_cert");
    expect(keys).toContain("mother_self_tax");
    expect(keys).not.toContain("mother_avrech_cert");
    expect(keys).toContain("opt_diagnostics");
  });
});

describe("Search", () => {
  const f = fam();
  it("finds by name in any order and with geresh/quotes", () => {
    expect(matchesSearch(f, "כהן משה")).toBe(true);
    expect(matchesSearch(f, "מש")).toBe(true);
    expect(matchesSearch(f, "לוי")).toBe(false);
  });
  it("finds by phone in any format", () => {
    expect(matchesSearch(f, "0547654321")).toBe(true);
    expect(matchesSearch(f, "054-765")).toBe(true);
    expect(matchesSearch(f, "972521234567")).toBe(true);
  });
  it("finds by ID and city", () => {
    expect(matchesSearch(f, "000000018")).toBe(true);
    expect(matchesSearch(f, "מגדל")).toBe(true);
  });
  it("normalizes text", () => {
    expect(normalizeText("  ת\"ז  ")).toBe("תז");
  });
});

describe("Age → grade brackets (potentials scanner)", () => {
  const dob = (years: number) => new Date(Date.now() - years * 365.25 * 86400000).toISOString().slice(0, 10);
  it("maps continuous brackets", () => {
    expect(matchGrade(dob(10.8))).toBeNull();
    expect(matchGrade(dob(11.2))).toBe(6);
    expect(matchGrade(dob(12.2))).toBe(7);
    expect(matchGrade(dob(13.9))).toBe(8);
    expect(matchGrade(dob(14.7))).toBe(9);
    expect(matchGrade(dob(15.5))).toBe(10);
    expect(matchGrade(dob(16.5))).toBe(11);
    expect(matchGrade(dob(18.0))).toBe(12);
    expect(matchGrade(dob(19))).toBeNull();
  });
});

describe("Excel import", () => {
  it("guesses Hebrew headers", () => {
    expect(guessField("שם פרטי")).toBe("firstName");
    expect(guessField("שם משפחה")).toBe("lastName");
    expect(guessField('ת"ז')).toBe("studentId");
    expect(guessField("טלפון אמא")).toBe("motherPhone");
    expect(guessField("טל' אבא")).toBe("fatherPhone");
    expect(guessField("שם תלמיד")).toBe("fullName");
    expect(guessField("עיר")).toBe("city");
    expect(guessField("כיתה")).toBe("grade");
    expect(guessField("מספר זהות אפוטרופוס 1")).toBe("ignore");
  });
  it("parses grades and tracks", () => {
    expect(parseGrade("ז")).toBe(7);
    expect(parseGrade("כיתה יא")).toBe(11);
    expect(parseGrade(9)).toBe(9);
    expect(parseGrade("")).toBeNull();
    expect(parseTrack("ישיבה קטנה")).toBe("yeshiva_ketana");
    expect(parseTrack("מאור ישראל")).toBe("maor_israel");
  });
  it("builds families and skips rows without a name", () => {
    const { families, skipped } = buildFamiliesFromSheet(
      {
        headers: ["שם תלמיד", "טלפון", "כיתה"],
        rows: [
          { "שם תלמיד": "כהן משה", טלפון: "521234567", כיתה: "ח" },
          { "שם תלמיד": "", טלפון: "0500000000", כיתה: "ז" },
        ],
      },
      { "שם תלמיד": "fullName", טלפון: "phone", כיתה: "grade" },
      { grade: 7, stage: "leads" },
    );
    expect(skipped).toBe(1);
    expect(families).toHaveLength(1);
    expect(families[0].lastName).toBe("כהן");
    expect(families[0].firstName).toBe("משה");
    expect(families[0].grade).toBe(8);
    expect(families[0].fatherPhone).toBe("0521234567");
  });
});

describe("Data shape", () => {
  it("backfills legacy fields and drops mother-avrech", () => {
    const f = ensureShape({ id: "x", studentName: "יוסי לוי", grade: 8, phone: "0521111111", motherAvrech: true } as unknown as Family);
    expect(f.firstName).toBe("יוסי");
    expect(f.lastName).toBe("לוי");
    expect(f.fatherPhone).toBe("0521111111");
    expect(f.motherAvrech).toBe(false);
    expect(f.stage).toBe("leads");
    expect(Object.keys(f.stations)).toHaveLength(5);
  });
});

describe("Demo data", () => {
  it("generates 1,400+ consistent students", () => {
    const d = generateDemoData();
    expect(d.families.length).toBeGreaterThanOrEqual(1400);
    const ids = new Set(d.families.map((f) => f.id));
    expect(ids.size).toBe(d.families.length);
    for (const a of d.appointments) expect(ids.has(a.family_id)).toBe(true);
    const perFamily = new Set(d.appointments.map((a) => a.family_id));
    expect(perFamily.size).toBe(d.appointments.length); // one per family
    const tokens = new Set(d.families.map((f) => f.rsvp_token));
    expect(tokens.size).toBe(d.families.length);
    const sample = d.families.slice(0, 50).filter((f) => f.data.studentId);
    for (const f of sample) expect(isValidIsraeliId(String(f.data.studentId))).toBe(true);
  });
});

import { toHebrewNumeral, hebrewDate } from "@/lib/dates";
describe("Hebrew numerals", () => {
  it("formats years and days", () => {
    expect(toHebrewNumeral(5787)).toBe("תשפ״ז");
    expect(toHebrewNumeral(5788)).toBe("תשפ״ח");
    expect(toHebrewNumeral(15)).toBe("ט״ו");
    expect(toHebrewNumeral(16)).toBe("ט״ז");
    expect(toHebrewNumeral(1)).toBe("א׳");
    expect(toHebrewNumeral(26)).toBe("כ״ו");
  });
  it("builds a Hebrew calendar date", () => {
    const s = hebrewDate(new Date("2026-11-08T12:00:00Z"));
    expect(s).toMatch(/^[א-ת״׳]+ ב[א-ת]+ תשפ״ז$/);
  });
});
