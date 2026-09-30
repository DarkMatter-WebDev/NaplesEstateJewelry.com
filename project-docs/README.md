# Project Docs - Persistent Memory System

This folder is the project's **long-term memory**. It exists so that any AI
session, chat reset, or new contributor can quickly understand the project
without re-explaining it. Treat documentation quality as part of the
implementation, not an optional extra.

Project operating rules live in the root `AGENTS.md`. Read it before working:
this folder is the source-of-truth repo-ready copy, git operations are not part
of this workflow, and every session must leave the folder clean with current
docs and evidence-backed verification.

## Files

| File | Purpose |
|------|---------|
| `PROJECT_OVERVIEW.md` | **Read first.** Purpose, business goals, audience, tech stack, deployment. |
| `CURRENT_STATUS.md` | Concise present-state snapshot: what works, deployment state, blockers, and immediate priorities. |
| `ARCHITECTURE.md` | System design, folder structure, DB schema, integrations, auth, hosting. |
| `STRUCTURE.md` | Canonical repo map + structural **invariants** that keep the site consistent. |
| `INTEGRITY.md` | Next.js integrity rules + pre-publish checklist. |
| `COMPLIANCE_AUDIT.md` | 2026-06-19 website compliance audit and implementation report. |
| `SEO_LEAD_AUDIT.md` | 2026-09-10 seller-call evidence and authorized implementation: Naples OpenAI targeting, saved/pending GBP/Yelp changes, seller copy/phone availability, verification and deployment limits. |
| `DECISIONS.md` | Current durable technical/design/business decisions and rationale. |
| `TASKS.md` | Open work plus a short recent-completions summary. |
| `CHANGELOG.md` | The one full-history, dated log of meaningful changes. |
| `CLIENTS.md` | Client/hosting/maintenance tracking for Surette Systems (no secrets). |
| `features/` | One file per feature with deeper detail (incl. `discount-codes.md`). |

## Session Startup Behavior

At the start of every session:

1. Read root `AGENTS.md`.
2. Read `PROJECT_OVERVIEW.md` and `CURRENT_STATUS.md` in full — start with
   CURRENT_STATUS's **"Start Here"** block, which states what is waiting and
   where to look. Then `TASKS.md` for open work.
3. `DECISIONS.md` is the exception to "read it all": it is ~136 KB of durable
   rationale and is meant to be **consulted by section, not read front to
   back**. Read the entries covering the area you are about to change — the
   hero-stack entry carries its own rule index at the top. Its length is
   deliberate; those entries have repeatedly prevented regressions.
4. Build an understanding of the project and **summarize current state** before
   making changes.
5. Ask for clarification only if required.

## Session Shutdown Behavior

Before ending a work session, never leave project state undocumented:

1. Update `CURRENT_STATUS.md` only when the present system or its immediate
   priorities changed; do not append a session diary.
2. Update `TASKS.md` by removing completed items and adding only still-open
   work. Keep no more than a short recent-completions summary.
3. Record important decisions in `DECISIONS.md`.
4. Add significant changes to `CHANGELOG.md`.
5. Update `ARCHITECTURE.md` if the architecture changed.
6. Update `CLIENTS.md` / `features/` as relevant.
7. Record exact verification commands and results.
8. Leave the source-of-truth folder repo-ready: no stray temp/archive/report
   files, and ignore rules still cover build output, caches, logs, and secrets.

## Working Rules

- Treat these Markdown files as the source of truth for project context.
- Keep docs concise but current; prefer updating existing files over creating new
  ones.
- Keep historical detail in `CHANGELOG.md`, not duplicated in the three startup
  files. Feature implementation detail belongs in `features/` or an existing
  dedicated runbook.
- If unsure whether something matters, document it.
- Write for both humans and AI agents.
- Do not run git operations in this source-of-truth folder; the human handles
  version control by wholesale copy elsewhere.
- For destructive work, dry-run/report first, archive or back up when practical,
  verify the reference set, then re-verify after the action.
- Keep image/data optimization defaults in mind: DB rows store URL/path strings,
  uploads use object storage + WebP/downscale/cache headers, and list queries
  select only needed columns.
- After app code, route, config, or schema-contract changes, run
  `npm run build` from `next-app/` - see `INTEGRITY.md`.
- **Never commit secrets.** In `CLIENTS.md`, record only where credentials live,
  never the credentials themselves. (`.env` / `.env.local` are gitignored.)

## Memory Maintenance

- `CURRENT_STATUS.md` is a replace-in-place snapshot, organized by system.
- `TASKS.md` is an open-work queue, not a permanent completed archive.
- `DECISIONS.md` contains only decisions that still govern the project.
  Superseded decisions stay discoverable in `CHANGELOG.md`.
- `CHANGELOG.md` may grow because it is the intentional historical record and
  is not part of routine session startup.
- Before deleting a plan, runbook, report, or root asset, verify references in
  code, SQL, config, and docs. Ambiguous source artwork is retained and added to
  `TASKS.md` for an owner decision.
