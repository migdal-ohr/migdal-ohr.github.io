import { hebrewDate } from "@/lib/dates";

/**
 * Normalize an Israeli phone number to international E.164 digits for wa.me.
 */
export const toWhatsAppNumber = (phone: string): string => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.length === 9) return "972" + digits;
  return digits;
};

export const waLink = (phone: string, message: string) => {
  const number = toWhatsAppNumber(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};

/* ---------------- institution settings (editable in the Settings screen) ---------------- */

export interface InstitutionSettings {
  name: string;
  city: string;
  address: string;
  signature: string;
}

export const DEFAULT_INSTITUTION: InstitutionSettings = {
  name: "מוסדות מגדל אור",
  city: "מגדל העמק",
  address: "רחוב הרב בוסקילה 10, מגדל העמק",
  signature: "צוות רישום מגדל אור",
};

let institution: InstitutionSettings = DEFAULT_INSTITUTION;
export const setInstitutionSettings = (s: InstitutionSettings) => {
  institution = s;
};
export const getInstitution = () => institution;

const signature = () => `בברכה,\n${institution.signature}`;
const addressLine = () => `כתובת: ${institution.address}.`;

/**
 * Public website base (parents' RSVP / registration pages). The desktop app runs
 * from a local origin, so links must always point at the public site.
 */
export const publicBaseUrl = (): string => {
  const env = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && /^https?:/.test(window.location.origin))
    return (window.location.origin + import.meta.env.BASE_URL).replace(/\/$/, "");
  return "";
};

/** Public RSVP link — uses the secret per-family token (never the guessable id). */
export const buildRsvpUrl = (token?: string): string | undefined => {
  if (!token) return undefined;
  const demo = token.startsWith("demo-") ? "&demo=1" : "";
  return `${publicBaseUrl()}/rsvp?t=${encodeURIComponent(token)}${demo}`;
};

/** Dynamic: missing-documents reminder with the family's actual missing docs. */
export const buildRemindDocsMessage = (parentName: string, missingDocLabels: string[]): string => {
  const list = missingDocLabels.length
    ? missingDocLabels.map((d) => `- ${d}`).join("\n")
    : "- המסמכים הנדרשים";
  return `שלום ${parentName},\n\nלצורך השלמת תהליך הרישום נא לשלוח את המסמכים החסרים הבאים:\n\n${list}\n\n${signature()}`;
};

/** Dynamic: meeting reminder with the scheduled date (+ Hebrew date) and time. */
export const buildMeetingReminderMessage = (
  parentName: string,
  appointmentISO: string,
  confirmationUrl?: string,
): string => {
  const d = new Date(appointmentISO);
  const date = d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const heb = hebrewDate(d);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const confirmSection = confirmationUrl
    ? `\n\nאנא עדכנו אותנו האם תוכלו להגיע או אם תרצו לתאם מועד חדש בקישור הבא:\n${confirmationUrl}`
    : "";
  return `שלום ${parentName},\n\nמזכירים לכם את פגישת הרישום שנקבעה לתאריך ${date}${heb ? ` (${heb})` : ""} בשעה ${time}.\n\n${addressLine()}\n\nלהביא תעודת זהות ותעודת בית ספר.\n\nנשמח לראותכם.${confirmSection}\n\n${signature()}`;
};

export const buildFollowUpMessage = (parentName: string, studentName: string) =>
  `שלום ${parentName},\nרצינו להתעדכן איתכם לגבי הרישום של ${studentName}.\nנשמח לעמוד לרשותכם לכל שאלה או התלבטות.\n\n${signature()}`;

/** Display Israeli phone in friendly local format. */
export const formatPhone = (phone: string | undefined): string => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  let local = digits;
  if (digits.startsWith("972")) local = "0" + digits.slice(3);
  else if (!digits.startsWith("0") && digits.length === 9) local = "0" + digits;

  if (local.length === 10) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  if (local.length === 9) {
    return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  }
  return local || phone;
};

export const isValidIsraeliPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.length === 11 || digits.length === 12;
  if (digits.startsWith("0")) return digits.length === 9 || digits.length === 10;
  return false;
};
