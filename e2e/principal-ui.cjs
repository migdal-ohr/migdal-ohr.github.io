// Two browsers: registration manager sends a student → metivta principal gets a popup, decides → manager gets a popup.
const { chromium } = require('playwright'); const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const S = path.join(__dirname, 'shots'); const BASE = 'http://127.0.0.1:4173';
const NAME = 'בדיקה החלטה';
(async () => {
  const adm = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
  await adm.auth.signInWithPassword({ email: 'e2e-admin@test.local', password: process.env.E2E_PW });
  const { data: fx } = await adm.rpc('insert_students', { p_rows: [{ firstName: 'בדיקה', lastName: 'החלטה', grade: 8, registrationTrack: 'metivta', city: 'מגדל העמק', notes: 'הגיע עם אבא לפגישה' }] });
  const sid = fx[0].id;
  await adm.from('student_log').insert({ student_id: sid, kind: 'interview', subtype: 'social', summary: 'ראיון עו"ס: ילד שמח ומוכשר' });
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
  const errs = []; let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}`); };
  const open = async (email) => {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, locale: 'he-IL' }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth'); await p.getByLabel('אימייל').fill(email); await p.getByLabel('סיסמה').fill(process.env.E2E_PW);
    await p.getByRole('button', { name: 'כניסה' }).click(); await p.getByRole('button', { name: /החלטות מנהל/ }).waitFor({ timeout: 30000 });
    return p;
  };
  const mgr = await open('e2e-manager@test.local');
  const prin = await open('e2e-interviewer@test.local');
  await prin.waitForTimeout(2500);
  // manager: open card via quick search → send to principal
  await mgr.getByRole('button', { name: /חיפוש מהיר/ }).click();
  await mgr.keyboard.type(NAME); await mgr.waitForTimeout(800); await mgr.keyboard.press('Enter');
  const card = mgr.getByRole('dialog');
  await card.getByRole('button', { name: 'שליחה להחלטת מנהל' }).click();
  await card.getByPlaceholder('הערה למנהל (לא חובה)').fill('הגיע לפגישה, אבא רוצה תשובה מהר');
  await mgr.screenshot({ path: S + '/principal-01-send.png' });
  await card.getByRole('button', { name: 'שליחה למנהל' }).click();
  await card.getByText('ממתין להחלטת מנהל').waitFor({ timeout: 15000 });
  ok('manager sent from the card', true);
  // principal: popup arrives
  await prin.getByText(`תלמיד חדש ממתין להחלטתך: ${NAME}`).waitFor({ timeout: 20000 });
  ok('principal got a popup', true);
  await prin.screenshot({ path: S + '/principal-02-popup.png' });
  await prin.getByRole('button', { name: 'לפתיחה' }).first().click();
  await prin.getByRole('heading', { name: 'החלטות מנהל' }).waitFor();
  await prin.getByRole('button', { name: /לפתיחה ולהחלטה/ }).first().click();
  await prin.getByText('ילד שמח ומוכשר').waitFor({ timeout: 15000 });
  ok('principal sees the student sheet (interview + notes)', await prin.getByText('הגיע עם אבא לפגישה').isVisible());
  ok('principal sees the manager note', await prin.getByText('אבא רוצה תשובה מהר').isVisible());
  await prin.getByLabel('סיכום החלטת מנהל').fill('נפגשתי עם הבחור. בחור רציני ומתמיד, מתקבל בתנאי שיגיע לקייטנה.');
  await prin.getByRole('button', { name: 'מתקבל', exact: true }).click();
  await prin.screenshot({ path: S + '/principal-03-decide.png' });
  await prin.getByRole('button', { name: 'שליחה', exact: true }).click();
  await prin.getByText('ההחלטה נשלחה למנהלת הרישום').waitFor({ timeout: 15000 });
  ok('principal sent decision', true);
  // manager: popup + inbox
  await mgr.getByText(`החלטת מנהל: ${NAME} — מתקבל`).waitFor({ timeout: 20000 });
  ok('manager got the decision popup', true);
  await mgr.screenshot({ path: S + '/principal-04-back.png' });
  ok('card updates live with the summary', await mgr.getByRole('dialog').getByText('בחור רציני ומתמיד').first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  await mgr.screenshot({ path: S + '/principal-04b-card.png' });
  await mgr.keyboard.press('Escape');
  await mgr.getByRole('button', { name: /החלטות מנהל/ }).click();
  await mgr.getByRole('tab', { name: /תשובות המנהל/ }).click();
  await mgr.getByRole('button', { name: 'עדכן בכרטיס: התקבל' }).click();
  await mgr.getByText('עודכן בכרטיס: התקבל').waitFor({ timeout: 15000 });
  await mgr.screenshot({ path: S + '/principal-05-inbox.png' });
  const { data: st } = await adm.from('students').select('details').eq('id', sid).single();
  ok('outcome saved as accepted', st?.details?.outcome === 'accepted');
  const { data: rv } = await adm.from('principal_reviews').select('seen_at').eq('student_id', sid).single();
  ok('marked as read', !!rv?.seen_at);
  await adm.from('students').delete().eq('id', sid);
  console.log('ERRORS', errs.length ? errs : 'none'); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message.slice(0, 500)); process.exit(1); });
