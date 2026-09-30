# AGENTS.md

> **⛔ THIS FOLDER IS NOT A GIT WORKING COPY. DO NOT USE GIT HERE.**
>
> This is the user's single source-of-truth project folder. **Git is not part
> of the workflow in this folder.** The user updates a *separate* GitHub repo
> folder manually, by copying this folder's contents into it. There is no
> branch, commit, push, pull, or PR step for you to run here — ever.
>
> - **Never** run `git` commands in this folder (no `commit`, `push`, `pull`,
>   `branch`, `checkout`, `stash`, `add`, `status`, etc.), and never suggest the
>   user do so. If a task seems to call for version control, stop and explain
>   that the user handles that manually elsewhere.
> - The git metadata you may see is incidental. Do not treat a "current branch",
>   "uncommitted changes", or "recent commits" as something to act on.
> - Just edit files in place. The user takes it from there.

This project uses a persistent Markdown memory system in **`project-docs/`**.

## Source-of-truth folder rule

The user periodically wipes a separate GitHub repo folder and copies this folder
into it wholesale, so this folder must stay repo-ready at all times — but the
copying and version control happen **outside** this folder and **outside** your
responsibility (see the no-git banner above).

- Do **not** leave stray archives, temp files, one-off scripts, reports, logs,
  or generated cleanup artifacts behind.
- Keep `.gitignore` accurate for dependencies, build output, caches, logs, and
  secrets/env files — it travels with the wholesale copy, even though you never
  run git here.
- Work only inside this project folder unless the user explicitly says
  otherwise.

## At the start of every session

Read these first and summarize the current state before making changes:

1. `project-docs/PROJECT_OVERVIEW.md` (read first)
2. `project-docs/CURRENT_STATUS.md`
3. `project-docs/TASKS.md`
4. `project-docs/DECISIONS.md`

See `project-docs/README.md` for the full index and conventions.

## Build structure & integrity

The active app lives in **`next-app/`**.

- `project-docs/STRUCTURE.md` - canonical repo map, single sources of truth,
  and structural invariants.
- `project-docs/INTEGRITY.md` - concrete integrity rules and pre-publish
  checklist.

After app code, route, schema-contract, or config changes, verify from
`next-app/`:

```bash
npm run build
```

Run `npm run lint` as well when touching TypeScript, React components, routing,
or shared UI behavior.

## During the task

- Keep the folder pristine as you work; clean up scratch files before ending.
- Cite file:line evidence for factual claims about code, schema, config, and
  docs.
- Never mark something done without verification you can cite. If a step was
  skipped or unverifiable, say so and explain how to verify it.

## Before ending a session

Keep the memory current - never leave project state undocumented:

- Update `project-docs/CURRENT_STATUS.md` and `project-docs/TASKS.md`.
- Record decisions in `project-docs/DECISIONS.md`.
- Add meaningful changes to `project-docs/CHANGELOG.md`.
- Update `project-docs/ARCHITECTURE.md` if architecture changed.
- Update `project-docs/CLIENTS.md` / `project-docs/features/` as relevant.
- Record the exact verification commands run and their results
  (`npx tsc --noEmit`, `npm run lint`, `npm run build`, smoke tests, etc.).
- Flag pending manual steps loudly, especially SQL migrations to run in
  Supabase or environment variables to set.
- Leave the folder repo-ready: no stray files, and ignore rules still correct.

## Destructive-operation safety

For any destructive action, including deleting local files, deleting Storage
objects, or bulk database updates:

1. Dry-run or report the planned impact first.
2. Archive/back up when practical.
3. Verify the reference set or selection criteria.
4. Act only after confirmation or explicit user request.
5. Re-verify afterward and report the result.

## Optimization defaults

- Images/files live in object storage or app assets; database rows store URL/path
  strings only, never base64/blob payloads.
- New uploads should downscale and encode to WebP with a longest-edge cap near
  2048px. ⛔ **Verify the encode actually happened — do not assume it.**
  `canvas.toBlob` silently substitutes PNG when it cannot produce the requested
  type, so `blob.type` must be checked and the filename/`contentType` derived
  from it. This rule was stated here and silently violated for months (46+ live
  product images were PNG under `.webp` names); see `project-docs/DECISIONS.md`
  → *"Media"*.
- Uploaded objects should use immutable cache headers where appropriate.
- Every responsive/fill image should have accurate `sizes`.
- Remove orphaned objects on remove/replace/delete paths, and keep the Storage
  GC reference set current. Any new upload destination table must be added to
  the GC reference scan.
- List/grid queries should select only needed columns, avoid `select('*')` for
  heavy views, and push filtering/sorting/pagination to the database where it
  preserves visible behavior.

## Hard rules

- Never commit secrets. Record only *where* credentials live, never the values.
  `.env` / `.env.local` are gitignored. Only public Supabase anon keys belong
  in browser-facing config.
- Prefer updating existing docs over creating new files.
- Documentation quality is part of the implementation, not optional.
