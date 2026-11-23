/** Every permission a role can be given. Keys are stored in roles.perms and checked by the database. */
export interface PermissionDef {
  key: string;
  label: string;
  hint?: string;
}

export const PERMISSION_GROUPS: { title: string; items: PermissionDef[] }[] = [
  {
    title: "תלמידים",
    items: [
      { key: "students.view", label: "צפייה בתלמידים", hint: "בלי זה המשתמש לא רואה תלמידים בכלל" },
      { key: "students.add", label: "הוספת תלמידים" },
      { key: "students.edit", label: "עריכת פרטי תלמיד", hint: "פרטים אישיים, הורים, מסמכים ותיעוד שיחות" },
      { key: "students.status", label: "שינוי סטטוס והחלטה", hint: "שלב רישום, התקבל / לא התקבל / לומד / עזב" },
      { key: "students.archive", label: "העברה לארכיון ושחזור" },
      { key: "students.delete", label: "מחיקה סופית" },
    ],
  },
  {
    title: "מידע רגיש",
    items: [
      { key: "sensitive.notes", label: "הערות פנימיות", hint: "צפייה וכתיבה" },
      { key: "sensitive.files", label: "צפייה במסמכים שהועלו", hint: "צילומי ת״ז, תלושים, סיכומים רפואיים" },
      { key: "export", label: "ייצוא לאקסל" },
    ],
  },
  {
    title: "פגישות ויום הרישום",
    items: [
      { key: "appointments.manage", label: "קביעת פגישות, סיורים וראיונות" },
      { key: "appointments.attendance", label: "סימון הגיע / לא הגיע" },
      { key: "stations.mark", label: "סימון תחנות ביום הרישום" },
      { key: "interviews.write", label: "כתיבת סיכומי ראיון" },
    ],
  },
  {
    title: "תקשורת והדפסה",
    items: [
      { key: "whatsapp.send", label: "שליחת וואטסאפ וסבבי תזכורות" },
      { key: "print.forms", label: "הדפסת טפסים" },
      { key: "print.reports", label: "מחולל דוחות" },
    ],
  },
  {
    title: "החלטת מנהל",
    items: [
      { key: "principal.request", label: "שליחת תלמיד להחלטת מנהל", hint: "מנהלת הרישום שולחת, ומקבלת את ההחלטה חזרה" },
      { key: "principal.decide", label: "סיכום החלטת מנהל", hint: "רושם סיכום אחרי הפגישה ומחליט: מתקבל / לא מתקבל" },
    ],
  },
  {
    title: "פוטנציאלים",
    items: [
      { key: "potentials.view", label: "צפייה בפוטנציאלים" },
      { key: "potentials.edit", label: "עריכת פוטנציאלים" },
    ],
  },
  {
    title: "ניהול",
    items: [
      { key: "admin.users", label: "משתמשים ותפקידים" },
      { key: "admin.years", label: "שנות רישום", hint: "פתיחת שנה חדשה ועדכון כיתות" },
      { key: "admin.lists", label: "רשימות", hint: "מוסדות, פעילים, בתי ספר, יישובים, מסמכים וטפסים" },
      { key: "admin.settings", label: "הגדרות המוסד" },
      { key: "admin.audit", label: "היסטוריית שינויים ולוג פעולות" },
      { key: "requests.handle", label: "טיפול בפניות של אחרים" },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export interface RoleRow {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  is_admin: boolean;
  perms: Record<string, boolean>;
  institutions: string[];
  sort: number;
  updated_at?: string;
}
