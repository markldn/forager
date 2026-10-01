// Headless real-GPU check: page errors + screenshots at film times and in fly mode.
// node test/shots.mjs [page] [outdir] [times...]   e.g. node test/shots.mjs dev.html /tmp/x 5 30 60
import fs from 'fs';
const { chromium } = await import(process.env.PLAYWRIGHT || '/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const [page0 = 'dev.html', out = '/tmp/bee-shots', ...ts] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 400)); });
await p.goto('http://127.0.0.1:9050/' + page0);
await p.waitForTimeout(2500);
await p.screenshot({ path: out + '/menu.png' });
const times = ts.length ? ts.map(Number) : [6, 20, 40, 60, 75, 90, 105, 125, 140, 155, 175, 190, 205, 220, 235, 250];
if (!process.env.FLY) {
  await p.evaluate(() => __bee.start('film'));
  await p.evaluate(() => __bee.setRes(1));
  for (const t of times) {
    await p.evaluate(t => __bee.seek(t), t); await p.waitForTimeout(1600);
    await p.screenshot({ path: `${out}/f${String(t).padStart(3, '0')}.png` });
  }
} else {
  await p.evaluate(() => __bee.start('fly'));
  await p.waitForTimeout(1500); await p.screenshot({ path: out + '/fly0.png' });
  await p.keyboard.down('KeyW'); await p.waitForTimeout(2500); await p.screenshot({ path: out + '/fly1.png' });
  await p.keyboard.up('KeyW');
  await p.evaluate(() => { const P = __bee.play; P.me.pos = [262 - 3, P.me.pos[1], -275 + 3]; P.me.pos[1] = 0; P.yaw = 2.3; });
  await p.waitForTimeout(2000); await p.screenshot({ path: out + '/fly2.png' });
  await p.keyboard.press('KeyV'); await p.waitForTimeout(2000); await p.screenshot({ path: out + '/fly3.png' });
  await p.keyboard.press('KeyE'); await p.waitForTimeout(1500); await p.screenshot({ path: out + '/fly4.png' });
}
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fps, 'res', await p.evaluate(() => __bee.res));
console.log(errs.length ? [...new Set(errs)].slice(0, 20).join('\n') : 'NO ERRORS');
await b.close();
