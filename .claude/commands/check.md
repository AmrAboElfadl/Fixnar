---
description: Bug check — build the app and scan the code for Fixnar's known bug patterns
---
Run a bug check on Fixnar and report findings as a table (file, problem, fix). Fix clear bugs; ask before large changes.

1. `CI=false npx react-scripts build` — must compile.
2. Search for known bug patterns:
   - `.catch(` chained on a Supabase query (crashes — Supabase queries have no `.catch`)
   - `if (error)` on Supabase results instead of `if (error && Object.keys(error).length)`
   - `.from('work_orders')` / `.from('assets')` list loads without `fetchAllRows` (silently cut at 1000 rows)
   - hard-coded dark colours (`#0d1117`, `#161b22`, `#e6edf3`, `#21262d`) instead of CSS variables
   - components with inputs defined inside another component (inputs lose focus)
   - `setSaving(true)` / busy flags that are not reset on every path
   - weekend logic that is not "Sunday only"
3. If the Supabase MCP is connected: list tables with RLS disabled, and run the security advisors.
4. Summarise: what was fixed, what still needs a decision.
