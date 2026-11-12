const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://127.0.0.1:4173';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'} ${n} ${x}`);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?demo=1#dashboard');
  await page.getByText('המשימות להיום').waitFor({ timeout: 20000 });

  // 1. WhatsApp round
  await page.getByRole('button', { name: /סבב תזכורות לפגישות מחר/ }).click();
  await page.getByText(/סבב וואטסאפ:/).waitFor();
  const reqs = []; ctx.on('request', (r) => reqs.push(r.url()));
  const popupP = ctx.waitForEvent('page');
  await page.getByRole('button', { name: /שלח לבא בתור/ }).click();
  const popup = await popupP; await popup.waitForTimeout(800); await popup.close();
  const url = decodeURIComponent(reqs.find((u) => u.includes('wa.me')) || '');
  ok('whatsapp round opens wa.me with message', /wa\.me\/972\d+\?text=שלום/.test(url) && url.includes('/rsvp?t='), url.slice(0, 70));
  ok('round progress updates', await page.getByText(/נשלחו 1 מתוך/).isVisible());
  await page.screenshot({ path: `${SHOTS}/21-wa-round.png` });
  await page.keyboard.press('Escape');

  // 2. document upload
  await page.goto(BASE + '/?demo=1#students');
  await page.locator('tbody tr').first().click();
  await page.getByText('פרטי קשר').waitFor();
  const coll = page.getByRole('button', { name: /^מסמכים/ });
  if (!(await page.getByText('סמן כהתקבל').first().isVisible().catch(() => false))) await coll.click();
  const file = path.join(__dirname, 'shots', 'sample.pdf');
  fs.writeFileSync(file, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await page.locator('input[type=file][multiple]').first().setInputFiles(file);
  await page.getByText(/הקובץ נשמר וסומן כהתקבל/).first().waitFor({ timeout: 8000 });
  ok('document upload marks received', await page.getByText('sample.pdf').first().isVisible());
  await page.screenshot({ path: `${SHOTS}/22-doc-upload.png` });
  await page.keyboard.press('Escape');

  // 3. public registration form → live toast for staff
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 390, height: 844 });
  await p2.goto(BASE + '/register?demo=1');
  await p2.getByText('הרשמה למוסדות מגדל אור').waitFor();
  const inputs = p2.locator('form input:not([aria-hidden])');
  await inputs.nth(0).fill('נתנאל'); await inputs.nth(1).fill('טסטר');
  await p2.locator('button[role=combobox]').first().click(); await p2.getByRole('option', { name: /כיתה ז/ }).click();
  await p2.locator('input[placeholder="05X-XXXXXXX"]').first().fill('052-1112233');
  await p2.screenshot({ path: `${SHOTS}/23-register-form.png`, fullPage: true });
  await p2.getByRole('button', { name: 'שליחת פרטים' }).click();
  await p2.getByText('תודה! הפרטים התקבלו').waitFor();
  ok('public registration submitted', true);
  let toast = false; try { await page.getByText(/נרשם דרך הטופס באתר: נתנאל טסטר/).first().waitFor({ timeout: 5000 }); toast = true; } catch {}
  ok('staff sees live registration toast', toast);
  await page.screenshot({ path: `${SHOTS}/24-register-toast.png` });
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'חיפוש מהיר' }).fill('נתנאל טסטר');
  await page.waitForTimeout(300);
  ok('new lead is in the system', await page.getByRole('option', { name: /נתנאל טסטר/ }).first().isVisible());
  console.log(res.join('\n')); console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
})().catch((e) => { console.log(res.join('\n')); console.log('FATAL', e.message); process.exit(1); });
