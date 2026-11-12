/**
 * Synthetic data generator for DEMO MODE ONLY.
 * Every name / phone / ID here is randomly generated — no real people.
 * Used to stress-test the system with 1,400 students and to show it off safely.
 */
import type { AppointmentRow, ActivityRow, FamilyRow, PotentialRow } from "./types";

const FIRST = [
  "אברהם", "יצחק", "יעקב", "משה", "אהרן", "דוד", "שלמה", "יוסף", "בנימין", "שמואל", "אליהו", "מנחם",
  "נתנאל", "אריאל", "יהודה", "שמעון", "לוי", "נחמן", "חיים", "מאיר", "ישראל", "עזריאל", "אלחנן", "נועם",
  "אליעזר", "רפאל", "מרדכי", "אהרון", "יונתן", "אליה", "הלל", "שניאור", "עקיבא", "צבי", "דניאל", "יאיר",
  "אורי", "ברוך", "יחזקאל", "זאב", "שלום", "אביעד", "נתן", "גבריאל", "מיכאל", "עמרם", "יוסי", "חנוך",
];
const LAST = [
  "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "דהן", "אברהם", "פרידמן", "אזולאי", "מלכה", "אוחיון", "חדד",
  "גבאי", "עמר", "יוסף", "בן דוד", "שפירא", "גולדברג", "רוזנברג", "אלמקייס", "בוסקילה", "אדרי", "טולדנו",
  "סויסה", "אלבז", "מימון", "שטרן", "וייס", "קליין", "הלוי", "שושן", "אסולין", "ממן", "בוזגלו", "אטיאס",
  "רבינוביץ", "זילברמן", "חזן", "נחום", "סבג", "טל", "אשכנזי", "ברגר", "אלון", "בן חמו", "קקון", "ששון",
];
const FATHER = ["אבי", "יוסי", "משה", "דוד", "שמעון", "חיים", "יעקב", "אליהו", "רפאל", "מאיר", "ציון", "שלמה", "אהרן", "נסים", "מרדכי"];
const MOTHER = ["רחל", "לאה", "שרה", "רבקה", "מרים", "אסתר", "חנה", "יעל", "רות", "נעמי", "תמר", "אורית", "מיכל", "שירה", "אפרת", "מוריה"];
const CITIES = [
  "מגדל העמק", "מגדל העמק", "מגדל העמק", "עפולה", "נוף הגליל", "טבריה", "צפת", "חיפה", "רכסים", "בית שמש",
  "בני ברק", "ירושלים", "אלעד", "מודיעין עילית", "נתניה", "אשדוד", "קרית טבעון", "יבניאל", "חדרה", "קרית ביאליק",
];
const HESITATIONS = [
  "מתלבטים בין שני מוסדות",
  "ממתינים לתשובה לגבי האח הגדול",
  "שאלות לגבי עלות שכר הלימוד",
  "רחוק מהבית — שוקלים הסעות",
  "האבא רוצה לפגוש את ראש הישיבה קודם",
];
const NOTES = ["הגיע עם האח הגדול", "צריך סיוע בהסעות", "לבדוק ועדת זכאות", "בוגר ת״ת חיים", "לחזור אחרי החגים", ""];

/** Deterministic PRNG so the demo looks the same on every load. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const makeId = (rnd: () => number) => {
  // valid-checksum fake ID that starts with 9 (never assigned to real citizens' common ranges)
  const base = "9" + String(Math.floor(rnd() * 1e7)).padStart(7, "0");
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let n = Number(base[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return base + String((10 - (sum % 10)) % 10);
};

const makePhone = (rnd: () => number) => {
  const pre = ["050", "052", "053", "054", "055", "058"][Math.floor(rnd() * 6)];
  return `${pre}-${String(Math.floor(rnd() * 1e7)).padStart(7, "0")}`;
};

export interface DemoDataset {
  families: FamilyRow[];
  appointments: AppointmentRow[];
  activity: ActivityRow[];
  potentials: PotentialRow[];
}

export function generateDemoData(count = 1400, seed = 20261108): DemoDataset {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const now = new Date();
  const families: FamilyRow[] = [];
  const appointments: AppointmentRow[] = [];
  const activity: ActivityRow[] = [];

  const tracks = ["metivta", "metivta", "metivta", "yeshiva_ketana", "yeshiva_ketana", "maor_israel"];
  const stages = ["leads", "leads", "meeting", "meeting", "documents", "documents", "documents", "complete", "complete", "persuasion"];
  const employment = ["salaried", "salaried", "self_employed", "unemployed", "na"];

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST);
    const lastName = pick(LAST);
    const track = pick(tracks);
    const grade = track === "maor_israel" ? 9 + Math.floor(rnd() * 4) : track === "yeshiva_ketana" ? 9 + Math.floor(rnd() * 3) : 6 + Math.floor(rnd() * 4);
    const stage = pick(stages);
    const fatherName = pick(FATHER);
    const motherName = pick(MOTHER);
    const fatherPhone = rnd() < 0.92 ? makePhone(rnd) : "";
    const motherPhone = rnd() < 0.75 ? makePhone(rnd) : "";
    const familyStatus = rnd() < 0.9 ? "married" : pick(["divorced", "single", "widowed"]);
    const fatherEmployment = pick(employment);
    const motherEmployment = pick(employment);
    const fatherAvrech = rnd() < 0.3;
    const created = new Date(now.getTime() - Math.floor(rnd() * 120) * 86400000 - Math.floor(rnd() * 86400000));
    const updated = new Date(Math.min(now.getTime(), created.getTime() + Math.floor(rnd() * 40) * 86400000));

    const docKeys = ["id_card", "medical_summary", "school_cert", "bank_statements"];
    if (familyStatus === "divorced") docKeys.push("divorce_agreement");
    const empDocs = (p: string, e: string) =>
      e === "salaried" ? [`${p}_payslips`] : e === "self_employed" ? [`${p}_self_tax`] : e === "unemployed" ? [`${p}_unemployed`, `${p}_benefits`] : [];
    docKeys.push(...empDocs("father", fatherEmployment), ...empDocs("mother", motherEmployment));
    if (fatherAvrech) docKeys.push("father_avrech_cert");
    const docRatio = stage === "complete" ? 1 : stage === "leads" ? 0.1 : rnd();
    const documents: Record<string, boolean> = {};
    for (const k of docKeys) documents[k] = rnd() < docRatio;
    const stationRatio = stage === "complete" ? 1 : stage === "documents" ? 0.7 : 0;
    const stations = {
      forms: rnd() < stationRatio,
      exam: rnd() < stationRatio,
      social: rnd() < stationRatio,
      principal: rnd() < stationRatio,
      tour: rnd() < stationRatio,
    };

    const id = `f${created.getTime()}${String(i).padStart(4, "0")}`;
    const rsvp = stage === "meeting" ? pick(["pending", "pending", "confirmed", "reschedule_requested"]) : "pending";
    const data: Record<string, unknown> = {
      firstName,
      lastName,
      studentName: `${firstName} ${lastName}`,
      studentId: rnd() < 0.85 ? makeId(rnd) : "",
      city: pick(CITIES),
      grade,
      fatherName,
      motherName,
      fatherPhone,
      motherPhone,
      parentNames: `${fatherName} ו${motherName}`,
      phone: fatherPhone || motherPhone,
      phone2: fatherPhone && motherPhone ? motherPhone : "",
      stage,
      registrationTrack: track,
      familyStatus,
      fatherEmployment,
      motherEmployment,
      fatherAvrech,
      motherAvrech: false,
      optionalDocs: rnd() < 0.08 ? ["opt_diagnostics"] : [],
      documents,
      stations,
      notes: pick(NOTES),
      hesitationReason: stage === "persuasion" ? pick(HESITATIONS) : undefined,
      rsvpStatus: rsvp,
      hasConfirmedAttendance: rsvp === "confirmed",
      isArchived: rnd() < 0.02,
      createdAt: created.toISOString(),
    };
    families.push({
      id,
      data,
      created_at: created.toISOString(),
      updated_at: updated.toISOString(),
      rsvp_token: `demo-${i.toString(36)}-${Math.floor(rnd() * 1e9).toString(36)}`,
    });

    if (stage !== "leads" && rnd() < 0.85) {
      // meetings between 20 days ago and 25 days ahead, Sun–Thu, 08:30–15:30 every 30 min
      const d = new Date(now);
      d.setDate(d.getDate() + Math.floor(rnd() * 45) - 20);
      while (d.getDay() === 5 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      d.setHours(8 + Math.floor(rnd() * 8), rnd() < 0.5 ? 0 : 30, 0, 0);
      if (stage === "meeting" && d < now) d.setDate(d.getDate() + 21);
      appointments.push({ id: `a${i}`, family_id: id, date: d.toISOString(), type: "פגישת רישום" });
    }

    if (i % 9 === 0) {
      activity.push({
        id: `l${i}`,
        action_type: "student_added",
        description: `נוסף תלמיד חדש: ${firstName} ${lastName}`,
        created_at: created.toISOString(),
        family_id: id,
        actor_email: "demo@migdal-ohr.local",
      });
    }
  }

  // A handful of intentional duplicates so the duplicates report has something to show
  for (let k = 0; k < 4; k++) {
    const src = families[k * 37];
    const dup = JSON.parse(JSON.stringify(src)) as FamilyRow;
    dup.id = `${src.id}d${k}`;
    dup.rsvp_token = `${src.rsvp_token}-d${k}`;
    families.push(dup);
  }

  activity.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const potentials: PotentialRow[] = Array.from({ length: 12 }, (_, i) => {
    const age = 11 + rnd() * 6;
    const dob = new Date(now.getTime() - age * 365.25 * 86400000);
    const grade = age < 12 ? 6 : age < 13 ? 7 : age < 14.5 ? 8 : age < 15 ? 9 : age < 16 ? 10 : 11;
    return {
      id: `p${i}`,
      full_name: `${pick(FIRST)} ${pick(LAST)}`,
      id_number: makeId(rnd),
      date_of_birth: dob.toISOString().slice(0, 10),
      grade,
      source: "ספח_לדוגמה.pdf",
      converted: false,
      converted_family_id: null,
      created_at: new Date(now.getTime() - i * 3600000).toISOString(),
    };
  });

  return { families, appointments, activity, potentials };
}
