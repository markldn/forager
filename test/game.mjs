// gameplay smoke: land on a nectar flower, drink, fly into the entrance, dance
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/' + (process.argv[2] || 'dev.html')); await p.waitForTimeout(1500);
await p.evaluate(() => __bee.start('fly')); await p.waitForTimeout(800);
await p.evaluate(() => { const P = __bee.play; P.me.pos = [__bee.PATCH[0], __bee.height(__bee.PATCH[0], __bee.PATCH[1]) + 1, __bee.PATCH[1]]; });
await p.waitForTimeout(800);
const f = await p.evaluate(() => { const P = __bee.play, F = __bee.flowers; const fl = F.near(P.me.pos, 20, f => [0, 2, 3, 4].includes(f.sp) && !(f.sp === 3 && false));
  window.__fl = fl; const h = F.head(fl, 0); P.me.pos = [h[0], h[1] + .04, h[2]]; P.me.vel = [0, 0, 0]; return { sp: fl.sp, h }; });
await p.waitForTimeout(100);
await p.evaluate(() => { const P = __bee.play, F = __bee.flowers; const h = F.head(__fl, performance.now()); P.me.pos = [P.me.pos[0], P.me.pos[1], P.me.pos[2]]; });
await p.keyboard.press('KeyF'); await p.waitForTimeout(3000);
const s1 = await p.evaluate(() => ({ landed: !!__bee.play.landed, crop: __bee.play.crop, pollen: __bee.play.pollen, msg: __bee.play.msg }));
console.log('after landing', JSON.stringify(s1));
await p.screenshot({ path: '/tmp/claude-1000/g1.png' });
await p.keyboard.press('KeyF'); await p.waitForTimeout(300);
await p.evaluate(() => { const P = __bee.play; P.crop = Math.max(P.crop, .5); P.me.pos = [0, __bee.HIVE[1] + .348, .26]; P.me.vel = [0, 0, -.3]; });
for (let i = 0; i < 40 && !(await p.evaluate(() => __bee.play.dance > 0)); i++) { await p.evaluate(() => { const P = __bee.play; const E = [0, __bee.HIVE[1] + .348, .215]; P.me.pos = [E[0], E[1], E[2] + .02]; }); await p.waitForTimeout(50); }
await p.waitForTimeout(2500);
const s2 = await p.evaluate(() => ({ dance: __bee.play.dance, delivered: __bee.play.delivered, msg: __bee.play.msg, landed: !!__bee.play.landed, dead: __bee.play.dead, crop: __bee.play.crop, auto: __bee.play.auto, pos: __bee.play.me.pos.map(x => +x.toFixed(3)), hive: __bee.HIVE[1] }));
console.log('at hive', JSON.stringify(s2));
await p.screenshot({ path: '/tmp/claude-1000/g2.png' });
await b.close();
