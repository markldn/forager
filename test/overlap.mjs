// log comb-bee body overlaps (two-circle bodies) during the opening seconds of the film
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/' + (process.argv[2] || 'dev.html')); await p.waitForTimeout(800);
await p.evaluate(() => { window.__ov = {}; window.__cam = sc => { if (!sc.interior) return;
  const B = sc.bees, c = b => { const f = b.fwd; return [[b.pos[0] + f[0] * .0032 * b.scale / .013, b.pos[1] + f[1] * .0032 * b.scale / .013], [b.pos[0] - f[0] * .0038 * b.scale / .013, b.pos[1] - f[1] * .0038 * b.scale / .013]]; };
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { if (Math.abs(B[i].pos[0] - B[j].pos[0]) > .015 || Math.abs(B[i].pos[1] - B[j].pos[1]) > .015) continue;
    let m = 9; for (const a of c(B[i])) for (const q of c(B[j])) m = Math.min(m, Math.hypot(a[0] - q[0], a[1] - q[1]));
    if (m < .0045) { const k = i + '-' + j + (B[i] === sc.bees[0] ? ' dancer' : '') + (B[i].follow || B[j].follow ? ' follower' : ''); __ov[k] = Math.min(__ov[k] ?? 9, m); } } }; });
await p.evaluate(() => __bee.start('film')); await p.waitForTimeout(9000);
for (const t of (process.argv[3] || '').split(',').filter(Boolean)) { await p.evaluate(t => __bee.seek(+t), t); await p.waitForTimeout(700); await p.evaluate(() => { window.__ov = {}; }); await p.waitForTimeout(6000); }
const ov = await p.evaluate(() => window.__ov);
console.log(Object.keys(ov).length, 'overlapping pairs (min circle gap < 4.5 mm; touching = 6.8 mm)');
console.log(Object.entries(ov).sort((a, b) => a[1] - b[1]).slice(0, 12).map(([k, v]) => k + ' ' + (v * 1000).toFixed(1) + 'mm').join('\n'));
await b.close();
