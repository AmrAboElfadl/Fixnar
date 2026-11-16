---
description: Put the current changes on a claude/ branch, check the build, and open a pull request for Amr to merge
argument-hint: [short title of the change]
---
Ship the current work as a pull request. Title: $ARGUMENTS

1. Run `git status` and `git diff --stat`. If there are no changes, stop and say so.
2. Make sure you are on a branch named `claude/<short-kebab-title>` (create it from the latest `main` if you are on `main`). Never commit to `main`.
3. Build: `CI=false npx react-scripts build`. If it fails, fix the error and build again. Do not open a PR with a failing build.
4. Review the diff against the rules in CLAUDE.md (Supabase error check, no `.catch()` on queries, `fetchAllRows` for big lists, theme CSS variables, RLS on new tables, Sunday off). Fix anything that breaks them.
5. Commit with a clear message, then `git push -u origin <branch>`.
6. Open the PR with `gh pr create --base main` using this body:
   - **What changed** (plain language, for a facility manager)
   - **Database changes** (SQL file names, or "none") and whether they are already applied in Supabase
   - **How it was tested** (build result, roles tested)
   - **What to check after merging**
7. Reply with the PR link. Do not merge it — Amr merges.
