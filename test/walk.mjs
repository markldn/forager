// frame strip of one walking bee on the comb (camera tracks it from the side/top)
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = process.argv[2] || '/tmp/claude-1000/walk';
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 400 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/dev.html'); await p.waitForTimeout(1200);
await p.evaluate(() => { __bee.start('film'); __bee.seek(15); }); await p.waitForTimeout(1000);
await p.evaluate(() => { window.__cam = sc => { if (!window.__wb) window.__wb = sc.bees.filter(b => b.st === 'walk' && !b.follow)[3]; const w = __wb; w.st = 'walk'; w.want = .02; w.tm = 9; w.spin = 0;
  const t = w.pos, f = w.fwd, side = [f[1], -f[0], 0];
  return { cam: { pos: [t[0] + side[0] * .022 + f[0] * .008, t[1] + side[1] * .022 + f[1] * .008, t[2] + .012], tgt: t, fov: .55, near: .001, far: 10 }, dof: { focus: .026, ap: 0 }, sub: '', bars: 0, title: 0 }; }; });
await p.waitForTimeout(500);
for (let i = 0; i < 8; i++) { await p.screenshot({ path: `${out}/w${i}.png` }); await p.waitForTimeout(30); }
console.log(await p.evaluate(() => window.__wb && { gait: __wb.gait, walk: __wb.walk, sp: __wb.sp }));
await b.close();
