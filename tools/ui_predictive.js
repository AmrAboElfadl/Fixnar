// Predictive maintenance screen (fx19), production build, Supabase mocked.  npm run build && node tools/ui_predictive.js build [shotDir]
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const BUILD = path.resolve(process.argv[2] || 'build'); const SHOTS = process.argv[3] || ''; const REF = 'haielakcqbsvtpkcszud';
const ADMIN = '00000000-0000-0000-0000-0000000000aa', TECH = '11111111-1111-1111-1111-111111111111';
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const CH = { id:'a-ch', name:'Walk-in chiller', brand:'Foster', model:'EP700', category:'Refrigeration', subcategory:'Walk-in chiller', specs:{ refrigerant:'R404A' } };
const FAN = { id:'a-fan', name:'Exhaust fan', brand:null, model:null, category:'Kitchen Equipment', subcategory:null, specs:{} };
const ALERTS = [
  { id:'al1', asset_id:'a-ch', store_id:'s1', kind:'drift', severity:'warn', score:70, title:'Rising temp_c: expected to pass 5 in about 2.8 days', status:'open', work_order_id:null,
    details:{ metric:'temp_c', value:4.7, hi:5, explain:'Readings are climbing about 0.13 per day.' }, assets:CH, stores:{ name:'Mirdif City Centre' }, updated_at:day(0) },
  { id:'al2', asset_id:'a-fan', store_id:'s1', kind:'drift', severity:'critical', score:85, title:"amps 53% above this machine's normal", status:'open', work_order_id:'w9',
    details:{ metric:'amps', baseline:6, recent:9.2, pct:53, explain:'The motor is drawing 53% more than usual.' }, assets:FAN, stores:{ name:'Mirdif City Centre' }, updated_at:day(0) } ];
const READINGS = [9,8,7,6,5,4,3,2,1,0].map((d, i) => ({ asset_id:'a-ch', metric:'temp_c', value:(2.5 + i * 0.25).toFixed(2), recorded_at:day(d * 2) }));
let ME, CALLS;
const srv = http.createServer((q, r) => { let f = path.join(BUILD, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  r.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json' })[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const browser = await chromium.launch();
  async function open(url, me, opts = {}){
    ME = me; CALLS = [];
    const ctx = await browser.newContext({ serviceWorkers:'block', viewport:{ width:1300, height:950 }, deviceScaleFactor: SHOTS ? 2 : 1 }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
    await ctx.route('**/*.supabase.co/**', async route => {
      const req = route.request(), u = new URL(req.url()), m = req.method(), seg = u.pathname.split('/'), t = seg.pop();
      const J = (b, s = 200) => route.fulfill({ status:s, contentType:'application/json', headers:{ 'content-range':'0-0/*' }, body:JSON.stringify(b) });
      if (u.pathname.startsWith('/auth/')) return J({ id:ME.id, email:'u@x.com', aud:'authenticated', role:'authenticated' });
      const single = /vnd\.pgrst\.object/.test(req.headers()['accept'] || '');
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (m !== 'GET' || u.pathname.includes('/rpc/') || u.pathname.includes('/functions/')) CALLS.push({ m, path:u.pathname, q:decodeURIComponent(u.search), body });
      if (u.pathname.includes('/functions/v1/asset-ai')) {
        if (opts.aiMissing) return J({ error:'Unknown action' }, 400);
        return J({ ok:true, data:{ summary:'The condenser coil is probably clogged with kitchen grease.', likely_causes:['Dirty condenser coil','Low refrigerant'], checks:['Clean the condenser coil','Check the door gasket','Measure the compressor current'], parts:['Door gasket'], urgency:'this_week' } });
      }
      if (u.pathname.endsWith('/rpc/run_predictive_scan')) return J(2);
      if (u.pathname.endsWith('/rpc/simulate_readings')) return J(10);
      if (t === 'profiles') return J(single ? { id:ME.id, full_name:ME.name, role:ME.role, store_id:null, email:'u@x.com' } : []);
      if (t === 'predictive_settings') return m === 'PATCH' ? J([{ id:1, enabled:true, auto_work_orders:true }]) : J({ id:1, enabled:!!opts.enabled, auto_work_orders:true });
      if (t === 'asset_alerts') return m === 'PATCH' ? J([]) : J(/status=in\.\(open/.test(decodeURIComponent(u.search)) ? ALERTS : []);
      if (t === 'asset_readings') return m === 'POST' ? J([{ id:'r1' }], 201) : J(READINGS);
      if (t === 'work_orders' && m === 'POST') return J({ id:'w-new' }, 201);
      if (t === 'work_orders') { const w = { id:'w1', title:'Chiller — Not cooling', status:'in_progress', priority:'P2', store_id:'s1', asset_id:'a-ch', assigned_to:ME.id, helper_ids:[],
        created_at:day(1), sla_due_at:day(-1), stores:{ name:'Mirdif City Centre' }, assets:{ id:'a-ch', name:'Walk-in chiller' } };
        return J(single ? w : (/id=eq\.w1/.test(decodeURIComponent(u.search)) ? [w] : [])); }
      if (t === 'stores') return J([{ id:'s1', name:'Mirdif City Centre' }]);
      if (t === 'assets') return J([CH, FAN]);
      return J(single ? {} : []);
    });
    await page.addInitScript(([ref, uid]) => { localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({ access_token:'x.eyJzdWIiOiIxIn0.x', refresh_token:'r', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user:{ id:uid, email:'u@x.com', aud:'authenticated' } })); }, [REF, me.id]);
    await page.goto('http://localhost:' + port + url); await page.waitForTimeout(2300);
    return { page, ctx, errs };
  }
  const admin = { id:ADMIN, role:'admin', name:'Amr' }, tech = { id:TECH, role:'technician', name:'Nazir' };

  // admin, switched off
  let { page, ctx, errs } = await open('/predictive', admin);
  ok(await page.locator('text=Switched off').count() === 1 && await page.locator('button', { hasText:'Switch on' }).count() === 1, 'shows OFF with a Switch on button (admin)');
  await page.locator('button', { hasText:'Switch on' }).click(); await page.waitForTimeout(400);
  ok(CALLS.some(c => c.m === 'PATCH' && c.path.endsWith('/predictive_settings') && c.body.enabled === true), 'Switch on saves enabled = true');
  ok(await page.locator('[data-alert]').count() === 2, 'two alerts listed');
  ok(await page.locator('[data-alert="al1"] svg[aria-label="Recent readings"]').count() === 1, 'chiller alert shows its trend line with the limit');
  ok(await page.locator('text=Rising Temperature (°C): expected to pass 5 in about 2.8 days').count() === 1, 'early-warning text shown with readable names (no "temp_c")');
  ok(await page.locator('[data-alert="al2"] a', { hasText:'Open work order' }).count() === 1, 'critical alert links to its predicted work order');
  await page.locator('[data-alert="al1"] button', { hasText:'Acknowledge' }).click(); await page.waitForTimeout(300);
  ok(CALLS.some(c => c.m === 'PATCH' && c.path.endsWith('/asset_alerts') && c.body.status === 'acknowledged' && c.body.handled_by === ADMIN), 'Acknowledge saves status + who');
  await page.locator('[data-alert="al1"] button', { hasText:'Create work order' }).click(); await page.waitForTimeout(400);
  const wo = CALLS.find(c => c.m === 'POST' && c.path.endsWith('/work_orders'));
  ok(wo && wo.body.wo_type === 'predictive' && wo.body.asset_id === 'a-ch' && /⚠ Predicted: Walk-in chiller/.test(wo.body.title) && wo.body.priority === 'P3', 'Create work order: predictive, on the machine, P3 for a warning');
  await page.locator('[data-alert="al1"] button', { hasText:'What should we check' }).click(); await page.waitForTimeout(500);
  ok(await page.locator('[data-alert="al1"] [data-ai]').count() === 1 && await page.locator('text=condenser coil is probably clogged').count() === 1, 'AI advice shows summary, causes and steps');
  ok(CALLS.some(c => c.path.endsWith('/asset-ai') && c.body.action === 'advise' && c.body.asset.model === 'EP700' && c.body.readings.length >= 3), 'AI is sent the machine, the alert and its readings');
  await page.locator('button', { hasText:'Run scan now' }).click(); await page.waitForTimeout(400);
  ok(CALLS.some(c => c.path.endsWith('/rpc/run_predictive_scan')), 'Run scan now calls the scan');
  await page.locator('select[aria-label="Store"]').last().selectOption('s1'); await page.waitForTimeout(300);
  await page.locator('select[aria-label="Machine"]').last().selectOption('a-ch');
  await page.locator('select[aria-label="Pattern"]').selectOption('breach');
  await page.locator('button', { hasText:'Add test readings' }).click(); await page.waitForTimeout(300);
  ok(CALLS.some(c => c.path.endsWith('/rpc/simulate_readings') && c.body.p_asset === 'a-ch' && c.body.p_pattern === 'breach'), 'admin test data: simulate_readings called');
  ok(errs.length === 0, 'admin: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fixnar-predictive.png'), fullPage:true });
  await ctx.close();

  // AI function not deployed yet: friendly message
  ({ page, ctx, errs } = await open('/predictive', admin, { enabled:true, aiMissing:true }));
  await page.locator('[data-alert="al1"] button', { hasText:'What should we check' }).click(); await page.waitForTimeout(500);
  ok(await page.locator('text=AI advice is not switched on yet').count() === 1, 'AI not deployed yet → clear message, no crash');
  await ctx.close();

  // technician: sees alerts and can ask AI / add readings, no admin or staff controls
  ({ page, ctx, errs } = await open('/predictive', tech, { enabled:true }));
  ok(await page.locator('[data-alert]').count() === 2, 'technician sees the alerts');
  ok(await page.locator('button', { hasText:/Switch (on|off)/ }).count() === 0 && await page.locator('button', { hasText:'Run scan now' }).count() === 0 && await page.locator('text=Test data').count() === 0, 'technician: no switch, no scan button, no test data');
  ok(await page.locator('[data-alert="al1"] button', { hasText:/Acknowledge|False alarm|Create work order/ }).count() === 0, 'technician: cannot acknowledge / dismiss / create');
  await page.locator('select[aria-label="Store"]').first().selectOption('s1'); await page.waitForTimeout(300);
  await page.locator('select[aria-label="Machine"]').first().selectOption('a-ch');
  await page.locator('input[aria-label="Value"]').first().fill('4.9');
  await page.locator('button', { hasText:'Save reading' }).first().click(); await page.waitForTimeout(300);
  ok(CALLS.some(c => c.m === 'POST' && c.path.endsWith('/asset_readings') && c.body.asset_id === 'a-ch' && c.body.metric === 'temp_c' && c.body.value === 4.9), 'technician adds a reading');
  ok(errs.length === 0, 'technician: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();

  // work order on a machine: reading box, linked to the job
  ({ page, ctx, errs } = await open('/work-orders/w1', tech, { enabled:true }));
  ok(await page.locator('[data-readings]').count() === 1, 'work order on a machine shows "Machine readings"');
  await page.locator('[data-readings] select[aria-label="Measurement"]').selectOption('amps');
  await page.locator('[data-readings] input[aria-label="Value"]').fill('7.8');
  await page.locator('[data-readings] button', { hasText:'Save reading' }).click(); await page.waitForTimeout(300);
  ok(CALLS.some(c => c.m === 'POST' && c.path.endsWith('/asset_readings') && c.body.work_order_id === 'w1' && c.body.metric === 'amps'), 'reading saved against the work order');
  ok(errs.length === 0, 'work order: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await browser.close(); srv.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
