// Work order → "Assign & edit": priority locked for non-admins (matches the fx10 database guard).
// Production build, Supabase mocked (no real data).  npm run build && node tools/ui_priority_lock.js build
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const BUILD = path.resolve(process.argv[2] || 'build'); const REF = 'haielakcqbsvtpkcszud';
const UID = '11111111-1111-1111-1111-111111111111';
const WO = { id:'w1', title:'HVAC — Air Conditioning — Not Cooling', status:'open', priority:'P2', store_id:'s1', asset_id:null,
  created_at:new Date(Date.now()-3600e3).toISOString(), sla_due_at:new Date(Date.now()+3600e3).toISOString(), assigned_to:null, vendor_id:null,
  duration_hours:1, helper_ids:[], stores:{ name:'Mirdif' }, assets:null };
let PATCHES = [], ROLE = 'operations';
const srv = http.createServer((q, r) => { let f = path.join(BUILD, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  r.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json' })[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const browser = await chromium.launch();
  async function open(role){
    ROLE = role; PATCHES = [];
    const ctx = await browser.newContext({ serviceWorkers:'block' }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await ctx.route('**/*.supabase.co/**', async route => {
      const u = new URL(route.request().url()), m = route.request().method(), t = u.pathname.split('/').pop();
      const J = (b, s = 200) => route.fulfill({ status:s, contentType:'application/json', headers:{ 'content-range':'0-0/*' }, body:JSON.stringify(b) });
      if (u.pathname.startsWith('/auth/')) return J({ id:UID, email:'u@x.com', aud:'authenticated', role:'authenticated' });
      if (m === 'PATCH' && t === 'work_orders') { PATCHES.push(JSON.parse(route.request().postData() || '{}')); return J([{ ...WO }]); }
      const single = /vnd\.pgrst\.object/.test(route.request().headers()['accept'] || '');
      if (t === 'profiles') return J(single ? { id:UID, full_name:'User', role:ROLE, store_id:'s1', email:'u@x.com' } : [{ id:'t1', full_name:'Tech One', role:'technician' }]);
      if (t === 'work_orders') return J(single ? { ...WO } : [{ ...WO }]);
      return J(single ? {} : []);
    });
    await page.addInitScript(([ref, uid]) => { localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({ access_token:'x.eyJzdWIiOiIxIn0.x', refresh_token:'r', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user:{ id:uid, email:'u@x.com', aud:'authenticated' } })); }, [REF, UID]);
    await page.goto('http://localhost:' + port + '/work-orders/w1'); await page.waitForTimeout(2500);
    return { page, ctx, errs };
  }
  // operations: priority locked, save does not send a priority change
  let { page, ctx, errs } = await open('operations');
  await page.click('button:has-text("Assign")'); await page.waitForTimeout(300);
  const sel = page.locator('label:has-text("Priority") + select, label:has-text("Priority") ~ select').first();
  ok(await sel.isDisabled(), 'operations: priority dropdown is locked');
  ok(await page.locator('text=only an admin can change it').count() >= 1, 'operations: told only an admin can change it');
  await page.click('button:has-text("Save")'); await page.waitForTimeout(600);
  ok(PATCHES.length === 1 && (PATCHES[0].priority === undefined || PATCHES[0].priority === 'P2'), 'operations: save keeps the priority (' + JSON.stringify(PATCHES[0] && PATCHES[0].priority) + ')');
  ok(errs.length === 0, 'operations: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();
  // admin: can change it
  ({ page, ctx, errs } = await open('admin'));
  await page.click('button:has-text("Assign")'); await page.waitForTimeout(300);
  const sel2 = page.locator('label:has-text("Priority") + select, label:has-text("Priority") ~ select').first();
  ok(!(await sel2.isDisabled()), 'admin: priority dropdown is open');
  await sel2.selectOption('P1'); await page.click('button:has-text("Save")'); await page.waitForTimeout(600);
  ok(PATCHES.length === 1 && PATCHES[0].priority === 'P1', 'admin: change to P1 is sent');
  ok(errs.length === 0, 'admin: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await browser.close(); srv.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
