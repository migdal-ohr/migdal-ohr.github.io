const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:4173/?demo=1');
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await p.waitForTimeout(2500);
  const m = await p.evaluate(async () => { const r = await fetch('/manifest.json'); return (await r.json()).name; });
  console.log('manifest:', m);
  await ctx.setOffline(true);
  await p.reload();
  await p.getByRole('heading', { name: 'המשימות להיום' }).waitFor({ timeout: 20000 });
  console.log('PASS app opens with no internet (service worker)');
  await b.close();
})().catch((e) => { console.log('FATAL', e.message); process.exit(1); });
