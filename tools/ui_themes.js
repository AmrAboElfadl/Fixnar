// Themes: DM Sans requested, every theme applies, text/button contrast passes WCAG AA (4.5:1) in Light and
// Professional, no page errors. Production build, Supabase mocked.  npm run build && node tools/ui_themes.js build [shotDir]
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const BUILD = path.resolve(process.argv[2] || 'build'); const SHOTS = process.argv[3] || ''; const REF = 'haielakcqbsvtpkcszud';
const UID = '11111111-1111-1111-1111-111111111111';
const WOS = [
  { id:'w1', title:'HVAC — Air Conditioning — Not Cooling', status:'open', priority:'P1', store_id:'s1', created_at:new Date(Date.now()-2*3600e3).toISOString(), sla_due_at:new Date(Date.now()+2*3600e3).toISOString(), stores:{ name:'Mirdif City Centre' }, assets:{ name:'AC 1' } },
  { id:'w2', title:'Refrigeration — Chiller — Temperature High', status:'in_progress', priority:'P2', store_id:'s1', created_at:new Date(Date.now()-5*3600e3).toISOString(), sla_due_at:new Date(Date.now()+3*3600e3).toISOString(), stores:{ name:'Dubai Mall' }, assets:{ name:'Walk-in chiller' } },
  { id:'w3', title:'Plumbing — Drainage — Drain Blocked', status:'completed', priority:'P3', store_id:'s1', created_at:new Date(Date.now()-30*3600e3).toISOString(), sla_due_at:new Date(Date.now()-3600e3).toISOString(), stores:{ name:'Raha Mall' }, assets:null } ];
const srv = http.createServer((q, r) => { let f = path.join(BUILD, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  r.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json' })[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++; };
function lum(rgb){ const m = rgb.match(/\d+(\.\d+)?/g).slice(0,3).map(Number).map(v => v/255).map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4)); return 0.2126*m[0] + 0.7152*m[1] + 0.0722*m[2]; }
function ratio(a, b){ const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); }
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const browser = await chromium.launch();
  for (const theme of ['light','dark','retro','pro']) {
    const ctx = await browser.newContext({ serviceWorkers:'block', viewport:{ width:1366, height:860 }, deviceScaleFactor: SHOTS ? 2 : 1 });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));   // offline sandbox
    await ctx.route('**/*.supabase.co/**', async route => {
      const u = new URL(route.request().url()), t = u.pathname.split('/').pop();
      const J = b => route.fulfill({ status:200, contentType:'application/json', headers:{ 'content-range':'0-0/*' }, body:JSON.stringify(b) });
      if (u.pathname.startsWith('/auth/')) return J({ id:UID, email:'u@x.com', aud:'authenticated', role:'authenticated' });
      const single = /vnd\.pgrst\.object/.test(route.request().headers()['accept'] || '');
      if (t === 'profiles') return J(single ? { id:UID, full_name:'Amr', role:'admin', store_id:'s1', email:'u@x.com' } : [{ id:'t1', full_name:'Nazir' }]);
      if (t === 'work_orders') return J(single ? WOS[0] : WOS);
      if (t === 'stores') return J([{ id:'s1', name:'Mirdif City Centre' }]);
      return J(single ? {} : []);
    });
    await page.addInitScript(([ref, uid, th]) => { localStorage.setItem('fixnar_theme', th); localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({ access_token:'x.eyJzdWIiOiIxIn0.x', refresh_token:'r', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user:{ id:uid, email:'u@x.com', aud:'authenticated' } })); }, [REF, UID, theme]);
    await page.goto('http://localhost:' + port + '/work-orders'); await page.waitForTimeout(2200);
    const info = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
      const probe = (color, bg) => { const d = document.createElement('div'); d.style.color = color; d.style.background = bg; document.body.appendChild(d); const s = getComputedStyle(d); const o = [s.color, s.backgroundColor]; d.remove(); return o; };
      return { attr: document.documentElement.getAttribute('data-theme'), font: getComputedStyle(document.body).fontFamily,
        link: !!document.querySelector('link[href*="DM+Sans"]'),
        pairs: { 'white on --green': probe('#ffffff', 'var(--green)'), '--green on surface': probe('var(--green)', 'var(--surface)'), '--blue on surface': probe('var(--blue)', 'var(--surface)'),
                 '--amber on surface': probe('var(--amber)', 'var(--surface)'), '--red on surface': probe('var(--red)', 'var(--surface)'), '--text3 on surface': probe('var(--text3)', 'var(--surface)'),
                 '--text on bg': probe('var(--text)', 'var(--bg)') },
        green: v('--green') };
    });
    ok(info.attr === theme, theme + ': theme applied (data-theme=' + info.attr + ')');
    if (theme === 'light') ok(info.link && /DM Sans/.test(info.font), 'light: DM Sans is requested from Google Fonts and used (' + info.font.split(',')[0] + ')');
    if (theme === 'pro') ok(/apple-system|Segoe UI|Roboto/.test(info.font), 'pro: system font stack like Salesforce (' + info.font.split(',').slice(0,2).join(',') + ')');
    if (theme === 'light' || theme === 'pro') {
      const bad = Object.entries(info.pairs).map(([k, [fg, bg]]) => [k, ratio(fg, bg)]).filter(([, r]) => r < 4.5);
      ok(bad.length === 0, theme + ': all text colours ≥ 4.5:1' + (bad.length ? ' — ' + bad.map(([k, r]) => k + ' ' + r.toFixed(2)).join(', ') : ''));
    }
    ok(await page.locator('text=HVAC').count() >= 1, theme + ': work orders render');
    ok(errs.length === 0, theme + ': no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
    if (theme === 'pro') {
      const opts = await page.locator('[role="radio"]').count();
      ok(opts === 0 || opts >= 4, 'theme picker offers 4 themes where shown (' + opts + ')');
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fixnar-' + theme + '.png') });
    await ctx.close();
  }
  await browser.close(); srv.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
