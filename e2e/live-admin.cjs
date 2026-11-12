// Browser test against the LIVE v3 database with temporary e2e users.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:4173';
const PW = process.env.E2E_PW;
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);
(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;
  const b = await chromium.launch({ proxy });
  const errors = [];
  const login = async (role) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${role}: ${e.message}`));
    await p.goto(BASE + '/auth?demo=0');
    await p.getByLabel('אימייל').fill(`e2e-${role}@test.local`);
    await p.getByLabel('סיסמה').fill(PW);
    await p.getByRole('button', { name: 'כניסה' }).click();
    await p.getByRole('heading', { name: 'המשימות להיום' }).waitFor({ timeout: 30000 });
    return { ctx, p };
  };
  // ADMIN
  const { ctx, p } = await login('admin');
  ok('admin logs in (live DB)', true);
  await p.screenshot({ path: `${SHOTS}/live-01-dashboard.png` });
  ok('role shown in sidebar', await p.getByText('מנהל מערכת').first().isVisible());
  // add a student
  await p.getByRole('button', { name: /הוסף תלמיד חדש/ }).click();
  await p.getByPlaceholder('לדוגמה: משה').fill('בדיקה');
  await p.getByPlaceholder('לדוגמה: כהן').fill('חיה');
  await p.getByPlaceholder('לדוגמה: אבי').fill('אבא');
  await p.locator('input[placeholder="05X-XXXXXXX"]').first().fill('052-0000001');
  await p.locator('button[role=combobox]').filter({ hasText: 'בחר/י מסלול' }).click();
  await p.getByRole('option', { name: 'מתיבתא' }).click();
  await p.getByRole('button', { name: 'הוספת תלמיד' }).click();
  await p.getByText('תלמיד/ה חדש/ה נוסף/ה').first().waitFor({ timeout: 15000 });
  ok('create student on live DB', true);
  // second browser (secretary) sees it live
  const s = await login('secretary');
  await s.p.keyboard.press('Control+k');
  await s.p.getByRole('textbox', { name: 'חיפוש מהיר' }).fill('בדיקה חיה');
  await s.p.waitForTimeout(800);
  ok('other computer sees it (sync)', await s.p.getByRole('option', { name: /בדיקה חיה/ }).first().isVisible());
  await s.p.keyboard.press('Escape');
  ok('secretary has no admin menu', !(await s.p.getByRole('button', { name: /ניהול מערכת/ }).isVisible()));
  // admin edits → secretary sees the change in realtime
  await p.keyboard.press('Control+k');
  await p.getByRole('textbox', { name: 'חיפוש מהיר' }).fill('בדיקה חיה');
  await p.waitForTimeout(500);
  await p.keyboard.press('Enter');
  await p.getByText('פרטי קשר').waitFor();
  const docsBtn = p.getByRole('button', { name: /^מסמכים/ });
  if (!(await p.getByText('סמן כהתקבל').first().isVisible().catch(() => false))) await docsBtn.click();
  await p.getByRole('button', { name: 'סמן כהתקבל' }).first().click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SHOTS}/live-02-profile.png` });
  await p.keyboard.press('Escape');
  // admin screen
  await p.getByRole('button', { name: /ניהול מערכת/ }).click();
  await p.getByText('משתמש חדש').waitFor({ timeout: 15000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${SHOTS}/live-03-users.png`, fullPage: true });
  ok('users admin lists accounts', await p.getByText('e2e-viewer@test.local').isVisible());
  await p.getByRole('tab', { name: /שנות רישום/ }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${SHOTS}/live-04-years.png` });
  ok('school years tab', await p.getByText('שנה נוכחית').isVisible());
  // VIEWER: read-only
  const v = await login('viewer');
  ok('viewer has no add button', !(await v.p.getByRole('button', { name: /הוסף תלמיד חדש/ }).isVisible()));
  await v.p.screenshot({ path: `${SHOTS}/live-05-viewer.png` });
  console.log(res.join('\n')); console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})().catch((e) => { console.log(res.join('\n')); console.log('FATAL', e.message); process.exit(1); });
