// Launch the real Electron desktop app and log in against the live database.
const { _electron: electron } = require('playwright');
const path = require('path');
(async () => {
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env } });
  const w = await app.firstWindow();
  const errors = []; w.on('pageerror', (e) => errors.push(e.message));
  await w.waitForLoadState('domcontentloaded');
  console.log('URL', w.url());
  const email = w.getByLabel('אימייל');
  const home = w.getByRole('heading', { name: 'המשימות להיום' });
  await Promise.race([email.waitFor({ timeout: 30000 }), home.waitFor({ timeout: 30000 })]);
  if (await email.isVisible()) {
    await email.fill('e2e-secretary@test.local');
    await w.getByLabel('סיסמה').fill(process.env.E2E_PW);
    await w.getByRole('button', { name: 'כניסה' }).click();
  } else console.log('PASS login remembered between launches');
  await w.getByRole('heading', { name: 'המשימות להיום' }).waitFor({ timeout: 30000 });
  console.log('PASS desktop app logs in to live DB as secretary');
  const font = await w.evaluate(() => document.fonts.check('16px Heebo', 'שלום'));
  console.log(font ? 'PASS' : 'FAIL', 'bundled Hebrew font loaded');
  await w.screenshot({ path: path.join(__dirname, 'shots', 'desktop-01.png') });
  // deep route works through app:// fallback
  await w.evaluate(() => { window.location.href = 'app://migdal/register'; });
  await w.getByText('הרשמה למוסדות מגדל אור').first().waitFor({ timeout: 15000 });
  console.log('PASS deep link route served by app:// fallback');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await app.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
