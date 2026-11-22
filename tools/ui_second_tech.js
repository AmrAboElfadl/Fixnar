// Second technician (fx10) screens, production build, Supabase mocked.  npm run build && node tools/ui_second_tech.js build
// Work order header + Assign & edit picker, list "A + B", dispatch board helper chip (not draggable),
// My Schedule asks for own + helping jobs and falls back when a workspace database has no helper_ids.
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const BUILD = path.resolve(process.argv[2] || 'build'); const REF = 'haielakcqbsvtpkcszud';
const ADMIN = '00000000-0000-0000-0000-0000000000aa', T1 = '11111111-1111-1111-1111-111111111111', T2 = '22222222-2222-2222-2222-222222222222';
const today = new Date(); if (today.getDay() === 0) today.setDate(today.getDate() - 1);   // Sunday is Fixnar's day off: use Saturday (same Mon–Sun week)
const ymd = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const WO = { id:'w1', title:'Refrigeration — Chiller — Temperature High', status:'open', priority:'P2', store_id:'s1', assigned_to:T1, helper_ids:[T2],
  created_at:new Date(Date.now()-3600e3).toISOString(), sla_due_at:new Date(Date.now()+3600e3).toISOString(), scheduled_date: ymd(today), scheduled_time:'10:00:00', duration_hours:2,
  stores:{ name:'Mirdif City Centre' }, assets:null };
let ME = { id:ADMIN, role:'admin', full_name:'Amr' }, PATCHES = [], WOQ = [], NO_COLUMN = false;
const srv = http.createServer((q, r) => { let f = path.join(BUILD, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(BUILD, 'index.html');
  r.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json' })[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(r); });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' | ' + m); c ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port; const browser = await chromium.launch();
  async function open(url, me, opts = {}){
    ME = me; PATCHES = []; WOQ = []; NO_COLUMN = !!opts.noColumn;
    const ctx = await browser.newContext({ serviceWorkers:'block', viewport:{ width:1400, height:900 } }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await ctx.route('**/fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
    await ctx.route('**/*.supabase.co/**', async route => {
      const u = new URL(route.request().url()), m = route.request().method(), t = u.pathname.split('/').pop();
      const J = (b, s = 200) => route.fulfill({ status:s, contentType:'application/json', headers:{ 'content-range':'0-0/*' }, body:JSON.stringify(b) });
      if (u.pathname.startsWith('/auth/')) return J({ id:ME.id, email:'u@x.com', aud:'authenticated', role:'authenticated' });
      const single = /vnd\.pgrst\.object/.test(route.request().headers()['accept'] || '');
      if (t === 'work_orders' && m === 'PATCH') { PATCHES.push(JSON.parse(route.request().postData() || '{}')); return J([{ ...WO }]); }
      if (t === 'work_orders') {
        WOQ.push(decodeURIComponent(u.search));
        if (NO_COLUMN && /helper_ids/.test(decodeURIComponent(u.search))) return J({ code:'42703', message:'column work_orders.helper_ids does not exist' }, 400);
        const row = NO_COLUMN ? (({ helper_ids, ...rest }) => rest)(WO) : { ...WO };
        return J(single ? row : [row]);
      }
      if (t === 'profiles') return J(single ? { id:ME.id, full_name:ME.full_name, role:ME.role, store_id:'s1', email:'u@x.com' }
                                            : [{ id:T1, full_name:'Nazir Anwar', role:'technician' }, { id:T2, full_name:'Shadab Khan', role:'technician' }]);
      if (t === 'stores') return J([{ id:'s1', name:'Mirdif City Centre' }]);
      return J(single ? {} : []);
    });
    await page.addInitScript(([ref, uid]) => { localStorage.setItem('sb-' + ref + '-auth-token', JSON.stringify({ access_token:'x.eyJzdWIiOiIxIn0.x', refresh_token:'r', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, user:{ id:uid, email:'u@x.com', aud:'authenticated' } })); }, [REF, me.id]);
    await page.goto('http://localhost:' + port + url); await page.waitForTimeout(2300);
    return { page, ctx, errs };
  }
  const admin = { id:ADMIN, role:'admin', full_name:'Amr' };

  // 1. work order: header + picker
  let { page, ctx, errs } = await open('/work-orders/w1', admin);
  ok(await page.locator('text=👥 + Shadab Khan').count() === 1, 'work order header shows the second technician');
  await page.click('button:has-text("Assign")'); await page.waitForTimeout(300);
  const helperSel = page.locator('label:has-text("Second technician") ~ select').first();
  ok(await helperSel.count() === 1, 'Assign & edit has a Second technician picker');
  const opts = await helperSel.locator('option').allInnerTexts();
  ok(!opts.includes('Nazir Anwar') && opts.includes('Shadab Khan'), 'picker never offers the main technician (' + opts.join(' / ') + ')');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(500);
  ok(PATCHES.length === 1 && !('helper_ids' in PATCHES[0]), 'saving without a change does not send helper_ids');
  await page.click('button:has-text("Assign")'); await page.waitForTimeout(300);
  await page.locator('label:has-text("Second technician") ~ select').first().selectOption('');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(500);
  ok(PATCHES.length === 2 && JSON.stringify(PATCHES[1].helper_ids) === '[]', 'removing the second technician sends helper_ids []');
  ok(errs.length === 0, 'work order: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();

  // 2. old workspace database without the column: no picker, nothing sent
  ({ page, ctx, errs } = await open('/work-orders/w1', admin, { noColumn:true }));
  await page.click('button:has-text("Assign")'); await page.waitForTimeout(300);
  ok(await page.locator('label:has-text("Second technician")').count() === 0, 'database without helper_ids: picker hidden');
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(500);
  ok(PATCHES.length === 1 && !('helper_ids' in PATCHES[0]), 'database without helper_ids: save never sends helper_ids');
  await ctx.close();

  // 3. list
  ({ page, ctx, errs } = await open('/work-orders', admin));
  ok(await page.locator('text=Nazir Anwar + Shadab Khan').count() >= 1, 'work order list shows "Nazir Anwar + Shadab Khan"');
  await ctx.close();

  // 4. dispatch board, week view: helper chip in Shadab's row, not draggable
  ({ page, ctx, errs } = await open('/schedule', admin));
  await page.click('button:has-text("week")').catch(() => {}); await page.locator('button', { hasText:/^week$/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  const chips = await page.evaluate(() => [].map.call(document.querySelectorAll('[title*="Mirdif"]'), function(c){ return { draggable: c.getAttribute('draggable'), helper: /👥/.test(c.textContent) }; }));
  ok(chips.some(c => c.helper && c.draggable === 'false') && chips.some(c => !c.helper && c.draggable === 'true'), 'week view: main chip draggable, helper chip 👥 not draggable (' + JSON.stringify(chips) + ')');
  ok(errs.length === 0, 'dispatch board: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();

  // 5. My Schedule as the helper
  ({ page, ctx, errs } = await open('/my-schedule', { id:T2, role:'technician', full_name:'Shadab Khan' }));
  ok(WOQ.some(q => q.includes('or=(assigned_to.eq.' + T2 + ',helper_ids.cs.{' + T2 + '})')), 'My Schedule asks for own jobs + jobs helping on');
  ok(await page.locator('text=Mirdif City Centre').count() >= 1, 'My Schedule shows the job the technician helps on');
  ok(errs.length === 0, 'My Schedule: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await ctx.close();
  ({ page, ctx, errs } = await open('/my-schedule', { id:T2, role:'technician', full_name:'Shadab Khan' }, { noColumn:true }));
  ok(WOQ.some(q => q.includes('or=(')) && WOQ.some(q => q.includes('assigned_to=eq.' + T2)), 'database without helper_ids: falls back to own jobs (as before)');
  ok(errs.length === 0, 'My Schedule fallback: no page errors' + (errs.length ? ' — ' + errs.join(' | ') : ''));
  await browser.close(); srv.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
