// Fixnar new work-order form on the production build, Supabase mocked (no real data). npm run build && node tools/ui_workorder_form.js build
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const BUILD = path.resolve(process.argv[2]); const REF = 'haielakcqbsvtpkcszud';
let ROLE = 'operations'; const UID = '11111111-1111-1111-1111-111111111111';
const STORE = { id:'s1', name:'Mirdif' };
const OPEN = { id:'w1', title:'HVAC — Air Conditioning — Not Cooling', status:'open', priority:'P2', store_id:'s1', asset_id:'a1', created_at:new Date(Date.now()-3600e3).toISOString(), sla_due_at:new Date(Date.now()+3600e3).toISOString(), stores:{name:'Mirdif'}, assets:{name:'AC 1'} };
const INSERTS = [];
const srv = http.createServer((q, r) => { let f = path.join(BUILD, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  r.setHeader('Content-Type', ({'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c?'PASS':'FAIL') + ' | ' + m); c ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const browser = await chromium.launch();
  async function open(role){
    ROLE = role; const ctx = await browser.newContext({ serviceWorkers:'block' }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await ctx.route('**/*.supabase.co/**', async route => {
      const u = new URL(route.request().url()), m = route.request().method(), t = u.pathname.split('/').pop();
      const J = (b, s=200) => route.fulfill({ status:s, contentType:'application/json', headers:{ 'content-range':'0-0/*' }, body: JSON.stringify(b) });
      if (u.pathname.startsWith('/auth/')) return J({ id:UID, email:'u@x.com', aud:'authenticated', role:'authenticated' });
      if (m === 'POST' && t === 'work_orders') { INSERTS.push(JSON.parse(route.request().postData()||'{}')); return J({ id:'new1', ...INSERTS[INSERTS.length-1] }, 201); }
      const single = /vnd\.pgrst\.object/.test(route.request().headers()['accept']||'');
      const data = { profiles: single ? { id:UID, full_name:'Ops User', role:ROLE, store_id:'s1', email:'u@x.com' } : [{ id:'t1', full_name:'Tech One' }],
        stores:[STORE], assets:[{ id:'a1', name:'AC 1', store_id:'s1' }], work_orders:[OPEN], vendors:[], notifications:[] }[t];
      return J(data === undefined ? (single ? {} : []) : data);
    });
    await page.addInitScript(([ref, uid]) => { localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({ access_token:'x.eyJzdWIiOiIxIn0.x', refresh_token:'r', token_type:'bearer', expires_in:3600, expires_at: Math.floor(Date.now()/1000) + 3600, user:{ id:uid, email:'u@x.com', aud:'authenticated' } })); }, [REF, UID]);
    await page.goto('http://localhost:' + port + '/work-orders?new=1'); await page.waitForTimeout(2500);
    return { page, ctx, errs };
  }
  // operations user: priority locked, duplicate warning, draft
  let { page, ctx, errs } = await open('operations');
  const formUp = await page.locator('text=Create New Work Order').count();
  ok(formUp === 1, 'new work order form opens');
  const sel = page.locator('select');
  await page.selectOption('select >> nth=0', 'HVAC'); await page.selectOption('select >> nth=1', 'Air Conditioning'); await page.selectOption('select >> nth=2', 'Not Cooling');
  await page.waitForTimeout(200);
  const p1 = page.locator('button:has-text("P1")'); 
  ok(await p1.isDisabled(), 'operations: P1 (not the fault\'s priority) is disabled');
  ok(await page.locator('text=only an admin can change it').count() === 1, 'operations: told only an admin can change priority');
  await page.selectOption('select >> nth=3', 's1'); await page.waitForTimeout(300);
  ok(await page.locator('text=already open for this store').count() === 1, 'duplicate warning shows for the same store + fault');
  const draft = await page.evaluate(uid => localStorage.getItem('fixnar_wo_draft_' + uid), UID);
  ok(!!draft && /Not Cooling/.test(draft), 'draft saved while typing');
  page.once('dialog', d => d.dismiss());
  await page.click('button:has-text("Create & Go")'); await page.waitForTimeout(500);
  ok(INSERTS.length === 0, 'cancel on the duplicate question → nothing created');
  page.once('dialog', d => d.accept());
  await page.click('button:has-text("Create & Go")'); await page.waitForTimeout(800);
  ok(INSERTS.length === 1 && INSERTS[0].priority === 'P2', 'confirm → created with the fault\'s priority P2');
  ok(!(await page.evaluate(uid => localStorage.getItem('fixnar_wo_draft_' + uid), UID)), 'draft cleared after create');
  ok(errs.length === 0, 'operations: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();
  // draft restore
  ({ page, ctx, errs } = await open('operations'));
  await page.evaluate(uid => localStorage.setItem('fixnar_wo_draft_' + uid, JSON.stringify({ at: Date.now(), form:{ category:'HVAC', subcategory:'Air Conditioning', fault:'Not Cooling', priority:'P2', store_id:'', asset_id:'', assigned_to:'', description:'leaking', status:'open', scheduled_date:'', duration_hours:1, vendor_id:'' } })), UID);
  await page.reload(); await page.waitForTimeout(2500);
  ok(await page.locator('text=unsent work order').count() === 1, 'draft offered when the form opens');
  await page.click('button:has-text("Restore")'); await page.waitForTimeout(200);
  ok(await page.locator('text=Title: HVAC').count() === 1, 'restore fills the form');
  await ctx.close();
  // admin: may change priority; SLA badge on the list
  ({ page, ctx, errs } = await open('admin'));
  await page.selectOption('select >> nth=0', 'HVAC'); await page.selectOption('select >> nth=1', 'Air Conditioning'); await page.selectOption('select >> nth=2', 'Not Cooling');
  ok(!(await page.locator('button:has-text("P1")').isDisabled()), 'admin: can pick any priority');
  ok(await page.locator('text=/\\dh( \\d+m)? left|\\d+m left/').count() >= 1, 'list shows a live SLA badge (from sla_due_at)');
  ok(errs.length === 0, 'admin: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await browser.close(); srv.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
