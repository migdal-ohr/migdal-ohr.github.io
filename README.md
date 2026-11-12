# רישום מגדל אור — מערכת ניהול רישום תלמידים (v2)

מערכת CRM בעברית לצוות הרישום של מוסדות מגדל אור (מתיבתא · ישיבה קטנה · מאור ישראל).
React + TypeScript + Tailwind + shadcn/ui, עם Supabase (Lovable Cloud) כצד שרת.

📄 **דוח השדרוג המלא:** [`docs/דוח-שדרוג.md`](docs/דוח-שדרוג.md)

## הרצה מקומית

```bash
npm install
npm run dev        # http://localhost:8080
npm run demo       # מצב הדגמה עם 1,400 תלמידים פיקטיביים (לא נוגע בנתונים אמיתיים)
```

| פקודה | מה עושה |
|---|---|
| `npm run build` | בנייה לפרודקשן |
| `npm test` | 25 בדיקות לוגיקה |
| `npm run typecheck` | בדיקת טיפוסים |
| `npm run e2e` | בדיקות דפדפן מלאות במצב הדגמה (דורש `npx vite preview --host 127.0.0.1 --port 4173` ו-Playwright) |

## מבנה

```
src/
  lib/api/            שכבת נתונים: supabaseBackend (אמיתי) · demoBackend (הדגמה) · demoData (1,400 פיקטיביים)
  store/crmStore.tsx  מצב מרכזי: עדכונים אופטימיים, מיזוג שינויים, עדכון חי (realtime) לפי שורה
  components/crm/     מסכים: לוח בקרה, רשימת תלמידים, סטטוס (קנבן), לוח שנה, שכנוע, פוטנציאלים, סטטיסטיקות, ארכיון
  lib/                וואטסאפ, אקסל, ולידציה (ת"ז), תאריכים עבריים
supabase/
  migrations/         כולל 20261108120000_v2_scale_security.sql (חובה להריץ לפני העלאת v2)
  functions/          scan-id-slip (סורק ספח AI), mcp (אוטומטי), confirm-attendance (הוצא משימוש)
```

## לפני העלאה לאוויר
1. להריץ את המיגרציה `20261108120000_v2_scale_security.sql` (מוסיפה בלבד, לא מוחקת נתונים).
2. להעלות את הקוד.
3. לוודא שהרשמה ציבורית כבויה ב-Auth.

> הערה: קבצי הלוגו (`public/favicon.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`) נמצאים בפרויקט ב-Lovable ולא הורדו לכאן. בסנכרון דרך GitHub הם נשמרים.
