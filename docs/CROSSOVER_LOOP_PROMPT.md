# Maintenance crossover run: 1st, 10th and 20th of every month, 02:00 Dubai

This is the stored prompt of the scheduled task "FBOS ⇄ Fixnar maintenance
crossover". The same file is in `Fixnar/docs/CROSSOVER_LOOP_PROMPT.md`.

---

You are the FBOS ⇄ Fixnar maintenance crossover run. It is a fresh session.
Repos: `BJA4641/fbos-app` (FBOS, live production, follow its `CLAUDE.md`
exactly) and `AmrAboElfadl/Fixnar` (Fixnar CMMS). If either is missing, attach
it with `add_repo` (push access) and clone it.

1. **Concurrency.** If another session pushed to either repo in the last 2
   hours, or an open PR from another session touches the same files, skip
   that repo this cycle and say so.
2. **PENDING first.** Read `PENDING.md` in each repo (FBOS: also the top of
   `PENDING_JAD.md` and `redesign/SESSION_LEDGER.md`). For each item `in PR`:
   check whether it merged and mark it `done (merged <date>)` or leave it.
   Re-check `blocked` items. Do not start anything new until PENDING is
   current.
3. **Health.** `curl https://fbos-app.vercel.app/api/health`. If it is not
   `healthy`, report that at the top and build nothing on FBOS that needs live
   data checks.
4. **Compare.** Read both maintenance modules again: FBOS `index.html`
   maintenance/calendar/equipment code, `api/db.js`, `api/proxy.js`; Fixnar
   `src/pages/*`, `src/lib/*`, `supabase/*.sql`. Use `git log` since the last
   cycle date in `MAINTENANCE_CROSSOVER.md`. Update the matrix and backlog in
   that file (same content in both repos). Add new items to each
   `PENDING.md`, ranked.
5. **Build.** Take the top `todo` item in each repo's PENDING.md, at most
   **one per repo**. Port the idea, not the code.
   - FBOS: every Fixnar feature goes into the **Maintenance module only**,
     never into Inventory, Finance, HR or other modules. Use the release pipeline, one release number, tests, shadow plus kill
     switch for any new restriction, `[HIGH-RISK]` title for proxy/auth/DDL.
     Update the ledger, `PENDING_JAD.md` (human steps), `PENDING.md` and the
     crossover file in the same commit.
   - Fixnar: `npm ci && npm run build` must pass. Add a test for any logic
     you touch. Any migration goes in `supabase/fxNN_*.sql` and is never
     applied. Update `PENDING.md` and the crossover file in the same commit.
   - Branch `crossover/<yyyy-mm-dd>` in each repo, with a PR to `main` via the
     GitHub MCP. **Never merge, never push to `main`, never deploy, never
     apply DDL/DML, never touch secrets.** After 3 failures on an item, mark it
     `blocked: <why>` and stop that item.
6. **Report** in a few lines: health, PENDING changes, PR links (one per repo
   at most), what needs a human, and the next run date.
