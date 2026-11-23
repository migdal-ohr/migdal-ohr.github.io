// "תיק תלמיד": full screen file with pages + documents shown inline; principal-only user sees nothing else.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const S = path.join(__dirname, 'shots'); const BASE = 'http://127.0.0.1:4173';
(async () => {
  const sb = (await (async () => { const c = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email: 'e2e-manager@test.local', password: process.env.E2E_PW }); return c; })());
  const { data: fx } = await sb.rpc('insert_students', { p_rows: [{ firstName: 'בדיקה', lastName: 'תיק', grade: 8, registrationTrack: 'metivta', city: 'מגדל העמק', fatherName: 'אבי', fatherPhone: '0520000001', notes: 'ילד מקסים, הגיע עם אבא' }] });
  const sid = fx[0].id;
  const up = async (file, type) => { const p = `${sid}/${crypto.randomUUID()}.${file.split('.').pop()}`; const { error } = await sb.storage.from('student-docs').upload(p, fs.readFileSync(path.join(__dirname, 'fixtures', file)), { contentType: type }); if (error) throw error; return p; };
  const pdf = await up('sample.pdf', 'application/pdf'), png = await up('sample.png', 'image/png');
  const now = new Date().toISOString();
  await sb.rpc('patch_student', { p_id: sid, p_patch: { files: { school_cert: [{ path: pdf, name: 'תעודה.pdf', uploadedAt: now }], id_card: [{ path: png, name: 'תז.png', uploadedAt: now }] }, documents: { school_cert: true, id_card: true } } });
  await sb.from('student_log').insert({ student_id: sid, kind: 'interview', subtype: 'social', summary: 'ראיון עו"ס: ילד שמח ומוכשר' });

  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
  const errs = []; let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}`); };
  const open = async (email, ready) => {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'he-IL' }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth'); await p.getByLabel('אימייל').fill(email); await p.getByLabel('סיסמה').fill(process.env.E2E_PW);
    await p.getByRole('button', { name: 'כניסה' }).click(); await ready(p); return p;
  };
  const mgr = await open('e2e-manager@test.local', (p) => p.getByRole('heading', { name: 'המשימות להיום' }).waitFor({ timeout: 30000 }));
  // card → "תיק תלמיד"
  await mgr.getByRole('button', { name: /חיפוש מהיר/ }).click(); await mgr.keyboard.type('בדיקה תיק'); await mgr.waitForTimeout(800); await mgr.keyboard.press('Enter');
  await mgr.getByRole('dialog').getByRole('button', { name: 'תיק תלמיד' }).click();
  await mgr.getByTestId('student-file').waitFor({ timeout: 15000 });
  ok('file opens as its own screen (no popup)', (await mgr.getByRole('dialog').count()) === 0 && mgr.url().includes('#file/'));
  await mgr.screenshot({ path: S + '/file-01-cover.png' });
  ok('cover shows notes', await mgr.getByText('ילד מקסים, הגיע עם אבא').isVisible());
  // flip with the keyboard
  await mgr.keyboard.press('ArrowLeft'); await mgr.getByRole('heading', { name: 'פרטים אישיים' }).waitFor();
  await mgr.keyboard.press('ArrowLeft'); await mgr.getByRole('heading', { name: 'הורים ומשפחה' }).waitFor();
  ok('flips pages with arrow keys', await mgr.getByText('אבי').first().isVisible());
  await mgr.getByRole('button', { name: /ראיונות, שיחות והערות/ }).first().click();
  ok('interview page', await mgr.getByText('ילד שמח ומוכשר').waitFor({ timeout: 10000 }).then(() => true, () => false));
  // documents open on screen
  await mgr.getByRole('navigation', { name: 'תוכן התיק' }).getByRole('button', { name: /תעודת ביה"ס/ }).click();
  const pages = mgr.getByTestId('pdf-pages').locator('canvas');
  ok('PDF shown on screen, all pages', await pages.nth(1).waitFor({ timeout: 20000 }).then(() => true, () => false));
  await mgr.waitForTimeout(800);
  await mgr.screenshot({ path: S + '/file-02-pdf.png' });
  await mgr.getByRole('navigation', { name: 'תוכן התיק' }).getByRole('button', { name: /צילום תעודת זהות/ }).click();
  ok('image shown on screen', await mgr.waitForFunction(() => (document.querySelector('img[alt="תז.png"]')?.naturalWidth ?? 0) > 0, null, { timeout: 20000 }).then(() => true, () => false));
  await mgr.screenshot({ path: S + '/file-03-image.png' });
  // send to the principal from the file
  await mgr.getByRole('button', { name: 'שליחה להחלטת מנהל' }).click();
  await mgr.getByPlaceholder('הערה למנהל (לא חובה)').fill('תעבור על התיק בבקשה');
  const prin = await open('e2e-principal@test.local', (p) => p.getByRole('heading', { name: 'החלטות מנהל' }).waitFor({ timeout: 30000 }));
  await prin.waitForTimeout(2500);
  await mgr.getByRole('button', { name: 'שליחה למנהל' }).click();
  await mgr.getByText('ממתין להחלטת מנהל').waitFor({ timeout: 15000 });
  ok('sent from inside the file', true);
  // principal: nothing but his inbox
  const nav = await prin.locator('aside nav').innerText();
  ok('principal menu has only "החלטות מנהל"', nav.trim().split('\n').filter(Boolean).every((l) => /החלטות מנהל|^\d+$/.test(l.trim())), nav);
  ok('no quick search for principal', (await prin.getByRole('button', { name: /חיפוש מהיר/ }).count()) === 0);
  await prin.goto(BASE + '/#students'); await prin.getByRole('heading', { name: 'החלטות מנהל' }).waitFor({ timeout: 20000 });
  ok('typing another screen address still shows only the inbox', true);
  await prin.getByRole('button', { name: /פתיחת התיק והחלטה/ }).click({ timeout: 20000 });
  await prin.getByTestId('student-file').waitFor({ timeout: 15000 });
  ok('principal got a popup + sees the manager note in the file', await prin.getByTestId('student-file').locator('p', { hasText: 'תעבור על התיק בבקשה' }).first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  await prin.getByRole('navigation', { name: 'תוכן התיק' }).getByRole('button', { name: /תעודת ביה"ס/ }).click();
  ok('principal sees the PDF', await prin.getByTestId('pdf-pages').locator('canvas').first().waitFor({ timeout: 20000 }).then(() => true, () => false));
  await prin.getByLabel('סיכום החלטת מנהל').fill('עברתי על כל התיק. מתקבל.');
  await prin.getByRole('button', { name: 'מתקבל', exact: true }).click();
  await prin.waitForTimeout(400);
  await prin.screenshot({ path: S + '/file-04-principal.png' });
  await prin.getByRole('button', { name: 'שליחה', exact: true }).click();
  await prin.getByText('ההחלטה נשלחה למנהלת הרישום').waitFor({ timeout: 15000 });
  ok('principal decided from the file', true);
  await mgr.getByText(/החלטת מנהל: בדיקה תיק — מתקבל/).waitFor({ timeout: 20000 });
  ok('manager got the decision popup', true);
  await prin.getByRole('button', { name: 'חזרה' }).click();
  await prin.getByRole('heading', { name: 'החלטות מנהל' }).waitFor();
  ok('back returns to the inbox', true);
  await sb.storage.from('student-docs').remove([pdf, png]);
  await sb.from('students').delete().eq('id', sid);
  console.log('ERRORS', errs.length ? errs : 'none'); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message.slice(0, 600)); process.exit(1); });
