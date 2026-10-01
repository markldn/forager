// close-up model inspection: film at time T, camera orbiting the first bee
import fs from 'fs';
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const [T = '182', out = '/tmp/claude-1000/bee', dist = '.035', what = 'bee'] = process.argv.slice(2);
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/dev.html'); await p.waitForTimeout(1500);
await p.evaluate(([T]) => { __bee.start('film'); __bee.seek(+T); }, [T]); await p.waitForTimeout(1200);
for (const [i, a] of [[0, 0], [1, 1.57], [2, 3.14], [3, 4.71]]) {
  await p.evaluate(([a, d, what]) => { __bee.seek(__bee.filmT - .05); window.__cam = sc => { const t = what === 'spider' ? sc.spiders[0] : what === 'bird' ? sc.birds[0].pos : sc.bees[0].pos; const pos = [t[0] + Math.cos(a) * d, t[1] + d * .45, t[2] + Math.sin(a) * d]; return { cam: { pos, tgt: t, fov: .5, near: .001, far: 1000 }, dof: { focus: d, ap: 0 }, fade: 1, sub: '' }; }; }, [a, +dist, what]);
  await p.waitForTimeout(700); await p.screenshot({ path: `${out}/b${i}.png` });
}
await b.close();
