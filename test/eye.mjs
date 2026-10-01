// "Through her eyes": autopilot first-person, frames every ~2.5 s
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = process.argv[2] || '/tmp/claude-1000/eye';
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/' + (process.argv[3] || 'dev.html')); await p.waitForTimeout(1200);
await p.click('#be'); await p.waitForTimeout(1500);
for (let i = 0; i < 8; i++) { await p.screenshot({ path: `${out}/e${i}.png` }); console.log(i, JSON.stringify(await p.evaluate(() => ({ st: __bee.play.me.state, crop: +__bee.play.crop.toFixed(3), vis: __bee.play.visited })))); await p.waitForTimeout(2500); }
await b.close();
