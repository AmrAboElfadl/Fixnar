---
description: Investigate and fix a reported bug end to end, then open a PR
argument-hint: [what is going wrong, as the user described it]
---
Bug report: $ARGUMENTS

1. Find the cause before changing code: read the relevant page/component, and if the Supabase MCP is connected check the live data, audit_log and logs for the affected records.
2. Explain the cause in one or two plain sentences.
3. Fix the cause (not just the symptom). Check if the same mistake exists in other pages and fix those too.
4. Build with `CI=false npx react-scripts build`.
5. If data was damaged by the bug, say exactly what and propose (don't silently run) a correction.
6. Run /pr with a short title for the fix.
