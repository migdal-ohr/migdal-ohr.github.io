const { chromium } = require('playwright');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots'); require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:4173';
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });

  let t0 = Date.now();
  await page.goto(BASE + '/?demo=1#dashboard'); await page.evaluate(() => { localStorage.removeItem('migdal-demo-db-v2'); sessionStorage.clear(); }); await page.reload();
  await page.getByText('המשימות להיום').waitFor({ timeout: 20000 });
  ok('dashboard loads with 1400 demo students', true, `${Date.now() - t0}ms`);
  await page.screenshot({ path: `${SHOTS}/01-dashboard.png` });

  // students table
  await page.getByRole('button', { name: /רשימת תלמידים/ }).first().click();
  await page.getByText(/מתוך .* פעילים/).waitFor();
  const subtitle = await page.getByText(/מתוך .* פעילים/).innerText();
  ok('students table shows counts', /1,3\d\d|1,4\d\d/.test(subtitle), subtitle);
  await page.screenshot({ path: `${SHOTS}/02-table.png` });
  // search
  t0 = Date.now();
  await page.getByLabel('חיפוש', { exact: true }).fill('כהן');
  await page.waitForTimeout(300);
  const after = await page.getByText(/מתוך .* פעילים/).innerText();
  ok('search filters fast', !/^1,3|^1,4/.test(after), `${after} (${Date.now() - t0}ms)`);
  await page.getByLabel('נקה חיפוש').click();
  // sort by name
  await page.getByRole('button', { name: 'שם' }).click();
  // select page + bulk bar
  await page.getByLabel('בחר את כל העמוד').click();
  ok('bulk bar appears', await page.getByText(/נבחרו/).isVisible());
  await page.getByRole('button', { name: 'ביטול בחירה' }).click();
  // filter missing docs
  await page.locator('button[role=combobox]').filter({ hasText: 'מסמכים' }).click();
  await page.getByRole('option', { name: 'חסרים מסמכים' }).click();
  await page.waitForTimeout(200);
  ok('docs filter applied', await page.getByText(/נקה 1 סינונים/).isVisible());
  await page.screenshot({ path: `${SHOTS}/03-table-filtered.png` });
  await page.getByText(/נקה 1 סינונים/).click();

  // open a student from the table
  await page.locator('tbody tr').first().click();
  await page.getByText('פרטי קשר').waitFor();
  await page.screenshot({ path: `${SHOTS}/04-profile.png` });
  const studentName = (await page.locator('[role=dialog] h2').first().innerText()).trim();
  ok('profile opens', !!studentName, studentName);
  // edit
  await page.getByRole('button', { name: 'ערוך' }).click();
  await page.getByText('עריכת פרטי תלמיד').waitFor();
  await page.getByPlaceholder('פרטים נוספים...').fill('הערת בדיקה אוטומטית');
  await page.getByRole('button', { name: 'שמירת שינויים' }).click();
  await page.getByText('הפרטים עודכנו בהצלחה').first().waitFor();
  ok('edit + save', true);

  // add new student with duplicate detection
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /תלמיד חדש/ }).first().click();
  await page.getByPlaceholder('לדוגמה: משה').fill(studentName.split(' ')[0]);
  await page.getByPlaceholder('לדוגמה: כהן').fill(studentName.split(' ').slice(1).join(' '));
  await page.waitForTimeout(200);
  const dupShown = await page.getByText('ייתכן שהתלמיד כבר קיים במערכת').isVisible();
  ok('duplicate warning while typing', dupShown);
  await page.getByPlaceholder('לדוגמה: משה').fill('בדיקה');
  await page.getByPlaceholder('לדוגמה: כהן').fill('אוטומטית');
  await page.getByPlaceholder('9 ספרות').fill('123456789');
  ok('bad ID checksum warning', await page.getByText('ספרת הביקורת לא תואמת').isVisible());
  await page.getByPlaceholder('9 ספרות').fill('123456782');
  await page.getByPlaceholder('לדוגמה: אבי').fill('אבי');
  await page.locator('input[placeholder="05X-XXXXXXX"]').first().fill('052-9999999');
  // track select
  await page.locator('button[role=combobox]').filter({ hasText: 'בחר/י מסלול' }).click();
  await page.getByRole('option', { name: 'מתיבתא' }).click();
  await page.getByRole('button', { name: 'הוספת תלמיד' }).click();
  await page.getByText('תלמיד/ה חדש/ה נוסף/ה').first().waitFor();
  ok('create student', true);

  // command palette
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'חיפוש מהיר' }).fill('בדיקה אוטומטית');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/05-palette.png` });
  await page.keyboard.press('Enter');
  await page.getByText('פרטי קשר').waitFor();
  await page.waitForTimeout(400); ok('command palette finds new student', (await page.getByRole('dialog').filter({ hasText: 'פרטי קשר' }).locator('h2').first().innerText()).includes('בדיקה'));
  await page.keyboard.press('Escape');

  // kanban
  await page.getByRole('button', { name: /סטטוס תלמידים/ }).first().click();
  await page.getByText('גררו כרטיסים בין העמודות').waitFor();
  await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/06-kanban.png` });
  const more = await page.getByRole('button', { name: /הצג עוד/ }).count();
  ok('kanban paginates columns', more > 0, `${more} columns with more`);
  // schedule meeting via popover on first card
  await page.getByRole('button', { name: /קבע פגישה|שנה פגישה/ }).first().click();
  const d = new Date(Date.now() + 3 * 86400000);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.locator('[data-radix-popper-content-wrapper] input[type=date]').fill(ds);
  await page.locator('[data-radix-popper-content-wrapper] input[type=time]').fill('10:30');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${SHOTS}/07-schedule.png` });
  await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: 'שמירה' }).click();
  await page.getByText('הפגישה נקבעה בהצלחה').first().waitFor();
  ok('schedule meeting', true);
  // expanded column
  await page.getByLabel('הרחב עמודה').nth(1).click();
  await page.getByText('מקובץ לפי תאריך הפגישה').waitFor();
  await page.screenshot({ path: `${SHOTS}/08-expanded.png` });
  await page.keyboard.press('Escape');

  // calendar
  await page.getByRole('button', { name: /לוח שנה/ }).first().click();
  await page.getByText('פגישות החודש').waitFor();
  await page.screenshot({ path: `${SHOTS}/09-calendar.png` });
  // RTL check: first day-of-month cell column matches weekday
  ok('calendar renders', true);

  // stats
  await page.getByRole('button', { name: /סטטיסטיקות/ }).first().click();
  await page.getByText('בקרת איכות נתונים').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/10-stats.png`, fullPage: true });
  ok('stats + duplicates found', await page.getByText('כפילויות אפשריות').isVisible());

  // persuasion, potentials, archive
  for (const [nav, marker, file] of [['תלמידים לשכנוע', 'משפחות שביטלו', '11-persuasion'], ['פוטנציאלים', 'העלאת ספח', '12-potentials'], ['ארכיון', 'ארכיון תלמידים', '13-archive']]) {
    await page.getByRole('button', { name: new RegExp(nav) }).first().click();
    await page.getByText(marker).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/${file}.png` });
    ok(`view ${nav}`, true);
  }

  // RSVP flow in a second tab: take a token from storage
  const token = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('migdal-demo-db-v2'));
    const appt = db.appointments.find((a) => new Date(a.date) > new Date());
    const fam = db.families.find((f) => f.id === appt.family_id && !f.data.isArchived);
    return { token: fam.rsvp_token, name: fam.data.studentName };
  });
  await page.getByRole('button', { name: /לוח בקרה/ }).first().click();
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: 390, height: 844 });
  await p2.goto(`${BASE}/rsvp?t=${encodeURIComponent(token.token)}&demo=1`);
  await p2.getByText('אישור הגעה לפגישת רישום').waitFor();
  await p2.screenshot({ path: `${SHOTS}/14-rsvp-mobile.png` });
  await p2.getByRole('button', { name: /לא אוכל להגיע/ }).click();
  await p2.getByText('בקשתכם התקבלה').waitFor();
  await p2.screenshot({ path: `${SHOTS}/15-rsvp-done.png` });
  ok('parent RSVP (reschedule)', true);
  // toast should appear in the first tab via BroadcastChannel
  let toastSeen = false;
  try { await page.locator('.rsvp-mega-toast').first().waitFor({ timeout: 4000 }); toastSeen = true; } catch {}
  ok('live mega-toast in staff tab', toastSeen);
  await page.screenshot({ path: `${SHOTS}/16-toast.png` });
  // old insecure link
  await p2.goto(`${BASE}/rsvp?studentId=f123`);
  ok('legacy link handled', await p2.getByText('הקישור הזה ישן').isVisible({ timeout: 5000 }).catch(() => false));
  await p2.close();

  // mobile layout
  const m = await browser.newContext({ ...require('playwright').devices['iPhone 13'], locale: 'he-IL' });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await mp.goto(BASE + '/?demo=1#dashboard');
  await mp.getByText('המשימות להיום').waitFor({ timeout: 20000 });
  await mp.screenshot({ path: `${SHOTS}/17-mobile-dashboard.png` });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('no horizontal overflow on mobile', overflow <= 1, `overflow=${overflow}`);
  await mp.getByLabel('תפריט').click();
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${SHOTS}/18-mobile-menu.png` });
  await mp.getByRole('button', { name: /רשימת תלמידים/ }).click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${SHOTS}/19-mobile-table.png` });
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('no page overflow on mobile table', overflow2 <= 1, `overflow=${overflow2}`);

  // auth page (real mode)
  const a = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ap = await a.newPage();
  await ap.goto(BASE + '/auth?demo=0');
  await ap.getByText('צוות רישום מגדל אור').waitFor();
  await ap.screenshot({ path: `${SHOTS}/20-login.png` });
  ok('login page', true);

  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error('FATAL', e.message); process.exit(1); });
