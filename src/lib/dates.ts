const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];

/** Number → Hebrew numerals with geresh/gershayim (1–999). 15→ט״ו, 16→ט״ז, 787→תשפ״ז */
export const toHebrewNumeral = (n: number): string => {
  n = Math.floor(n) % 1000;
  if (n <= 0) return "";
  let s = HUNDREDS[Math.floor(n / 100)];
  const rest = n % 100;
  if (rest === 15) s += "טו";
  else if (rest === 16) s += "טז";
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
};

/** Hebrew (Jewish calendar) date, e.g. "כ״ו בחשוון תשפ״ז". Falls back to "" if unsupported. */
export const hebrewDate = (d: Date, withYear = true): string => {
  try {
    const parts = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric", month: "long", year: "numeric" }).formatToParts(d);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const year = Number(parts.find((p) => p.type === "year")?.value);
    if (!day || !month) return "";
    return `${toHebrewNumeral(day)} ב${month.replace(/^ב/, "")}${withYear && year ? ` ${toHebrewNumeral(year)}` : ""}`;
  } catch {
    return "";
  }
};

/** Current Hebrew year as letters, e.g. "תשפ״ז" */
export const hebrewYear = (d: Date): string => {
  try {
    const y = Number(new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { year: "numeric" }).formatToParts(d).find((p) => p.type === "year")?.value);
    return y ? toHebrewNumeral(y) : "";
  } catch {
    return "";
  }
};

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (iso: string | Date) => `${fmtDate(iso)} ${fmtTime(iso)}`;

export const fmtLongDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** yyyy-mm-dd + hh:mm in local time → ISO */
export const localToIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

export const isoToLocalParts = (iso?: string | null) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

export const daysAgo = (iso?: string) => (iso ? Math.floor((Date.now() - +new Date(iso)) / 86400000) : null);
