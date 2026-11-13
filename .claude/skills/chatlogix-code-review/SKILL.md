---
name: chatlogix-code-review
description: ChatLogix-specific code review of a change (uncommitted work, a commit, a branch, or named files). Checks the change against the project's security rules, traces what else it can break, compares it with the requirement doc it implements, follows every new or changed API/database field from Prisma schema to migration to index to route to frontend, hunts for cross-shop data leaks and other data-breach paths, and applies the project's own conventions (money units, single wallet writer, Lambda batch behavior, ESM, docs to update). Use this whenever the user asks to review code, review a change, check a diff, check a commit or branch before merge or deploy, asks "is this safe to merge", "did I break anything", "does this meet the requirement", "is the migration right", "is this secure", or asks for a security or data-leak check on ChatLogix code, even if they do not say "code review".
---

# ChatLogix code review

A generic review finds generic bugs. This one exists because ChatLogix has rules a generic reviewer cannot know: every row belongs to one shop, wallet money and order money use different units, five Lambdas and the Express API share code, and CI only compiles (no tests or lint run on a pull request, so nothing downstream will catch what this review misses).

The review answers six questions, in this order, and the report gives each one its own verdict:

1. Does the code follow the security rules?
2. Can the change break something it did not mean to touch?
3. Does it do what the requirement asks?
4. If an API or database field was added or changed, is the migration right, is it indexed, and does the frontend use it?
5. Can it leak or corrupt data (another shop's, a customer's, or money)?
6. Does it follow the project's other conventions?

`CLAUDE.md` at the repo root is the living source for architecture and deployed reality. Read it first; where it disagrees with a reference file here, `CLAUDE.md` wins.

## Ground rules

- **Read-only.** Do not edit code, run migrations, or commit. Fix things only if the user asks after seeing the report.
- **Never run `prisma migrate dev`, `prisma migrate deploy` or `prisma db push`.** Local dev can point at the shared database. Reviewing a migration means reading it.
- **Evidence or it is not a finding.** Each finding needs `path:line` and a concrete way it goes wrong (who does what, and what happens). If you suspect something and cannot confirm it from the code, list it under "Could not verify" instead.
- **Review the change, not the codebase.** Pre-existing problems go in a short "Seen nearby, not part of this change" list, and only when they matter to the change. Launch docs already track several known ones (see `docs/launch/`).
- Never read or touch `frontend/`. It is deprecated; a change that edits it is itself a finding.

## Step 1 — Scope the change

Work out what is under review from the user's words:

| User says | Diff to read |
| --- | --- |
| nothing specific, or "my changes" | `git diff HEAD` plus untracked files from `git status --short` |
| a commit sha | `git show <sha>` |
| a branch, or "before merge" | `git diff master...<branch>` |
| "last N commits" | `git diff HEAD~N..HEAD` |
| files or a folder | those files as they stand, plus `git log -5 -- <path>` for context |

The `gh` CLI is not installed here, so a pull-request number means: ask which branch it is, or review the checked-out branch against `master`.

If the diff is empty, say so and stop. Otherwise list the changed files and sort them: schema/migrations, routes, services, conversation pipeline, Lambda handlers, workers, shared frontend packages, vendor app, admin app, tests, docs, config/CI. This sort decides which reference files you need.

Read every changed file in full, not only the hunks. Most review misses come from judging a hunk without the function around it.

## Step 2 — Find the requirement

A review cannot say "meets the requirement" without one. Look, in order:

1. A doc or task the user named.
2. A task doc that names the changed files: grep `docs/launch/`, `docs/admin-portal/`, `docs/payments/`, `docs/shipping/` and the top-level `docs/*.md` for the changed file names and the feature's words.
3. The commit messages and branch name.

If you find a task doc, its **Acceptance checks** (section 6 in the launch template) and **Implementation steps** are the checklist. If nothing matches, say so in the report, state the intent you inferred from the code and commits, and review against that. Do not invent acceptance criteria and then pass the code against them.

## Step 3 — Review

Do these as separate passes. One pass that tries to hold everything finds less.

### 3.1 Security rules

Read [references/security.md](references/security.md) and check each rule that the changed files can touch: authentication on new routes, tenant scoping, input validation, raw SQL, webhook signatures, secrets, logging, rate limits, dev-only shortcuts, anything rendered as HTML, and what goes into the LLM prompt.

### 3.2 What else can break

Read [references/blast-radius.md](references/blast-radius.md). For every exported function, type, route, queue payload, Prisma model or env var the change alters:

- Grep for every caller and importer, including tests, scripts, Lambda handlers and both web apps. A changed signature or return shape with an unchanged caller is a finding.
- Check the shared-code list in the reference: some files run in a Lambda and in Express, and a change tested in one runs in both.
- Check behavior the diff does not show: default values, error paths, what happens to data written before this change, what happens to queue messages already in flight during a deploy.

### 3.3 Requirement fit

Go through the acceptance checks one at a time. For each: met (with `path:line` or a test name), not met, or cannot be checked from the repo (needs production data, a real WhatsApp number, AWS). Also flag work the requirement did not ask for; scope creep hides regressions.

### 3.4 Field trace

Only when the change adds, renames, removes or retypes a database field, an API request/response field, or an enum value. Read [references/field-trace.md](references/field-trace.md) and follow each field end to end. Report it as a table, one row per field.

### 3.5 Data leaks and data damage

This pass is adversarial. Rule compliance (3.1) asks "did they follow the pattern"; this asks "how would I abuse this". For each new or changed entry point, try on these roles: a logged-in vendor aiming at another shop, a WhatsApp customer typing into the chat, someone with no login, and a stolen token. The reference's last section lists the attacks worth trying. Also check the quiet failures: a response that returns a whole Prisma row, a log line with a token or a customer's message, a delete that cascades into money tables, two requests racing on one balance.

### 3.6 Conventions

The bottom half of [references/blast-radius.md](references/blast-radius.md) lists them: money units, the single wallet writer, thin routes, Zod, Pino, ESM imports, tests beside the code, docs that must move with the code.

## Step 4 — Run what can be run

Run only what the change touches, and report the real result, including failures and things you skipped.

```bash
# backend changed
cd backend && npx tsc --noEmit -p tsconfig.json
cd backend && npx vitest run <test files for the changed code>
cd backend && npx prisma validate            # only if schema.prisma changed; reads the schema, touches no database

# frontend_v2 changed (run in the touched workspace, e.g. apps/web-vendor)
npm run type-check && npm run lint && npm run test
```

Find the tests with a grep for the changed file's name under `__tests__` folders. If changed code has no test, that is a finding when the code touches money, tenant scoping, auth or the conversation pipeline, and a suggestion otherwise. A test that fails before the change too is not the change's fault; check with `git stash` only if the user agrees, otherwise say you could not tell.

## Step 5 — Check your own findings

Before reporting, reread each finding against the code once more and ask: is the line number right, is the failure real given the callers, does an existing guard already stop it? Drop what does not survive. Ten solid findings are worth more than thirty the author has to disprove.

Severity:

| Level | Meaning |
| --- | --- |
| **Blocker** | Cross-shop data access, missing auth, money written wrong or twice, a migration that loses data or fails on existing rows, a requirement's core check not met, a broken build or failing test caused by the change. |
| **Should fix** | A real bug or risk with a narrower blast radius; missing index on a new query; field added to the API but not wired to the frontend; missing test on risky code; doc that must be updated. |
| **Consider** | Naming, duplication, small cleanups. Keep this list short. |

## Step 6 — Report

In chat, in this shape. Keep the wording plain; the reader is the developer who wrote the change.

```markdown
**Verdict: Ready / Ready after fixes / Not ready** — one sentence saying why.

Reviewed: <what diff>, <N files>, against <requirement doc or "no requirement doc found; inferred intent: …">.

| Question | Result |
| --- | --- |
| 1. Security rules | Pass / Issues (n) |
| 2. Other functionality | Pass / Issues (n) |
| 3. Meets requirement | Yes / Partly / No / No requirement found |
| 4. Fields, migration, index, frontend | Pass / Issues (n) / No field changes |
| 5. Data leak or damage | None found / Issues (n) |
| 6. Conventions | Pass / Issues (n) |

### Blockers
1. **<short title>** — [file.ts:42](path/file.ts#L42). What goes wrong, for whom, and the smallest fix.

### Should fix
…

### Consider
…

### Field trace            (only when Step 3.4 ran)
| Field | Schema | Migration | Index | Backend | API response | Frontend |

### Requirement checks     (only when a requirement was found)
| Acceptance check | Result | Evidence |

### Checks run
- `npx tsc --noEmit` — passed / failed (output)
- tests — which files, how many passed
- Skipped: <what and why>

### Could not verify
- <things that need production, AWS, a live number>

### Seen nearby, not part of this change   (optional, short)
```

Leave out empty sections except the question table and "Checks run". Use markdown links for every file reference. If the user asks for the review as a file, write it to `docs/code-review/<YYYY-MM-DD>-<short-name>.md`; otherwise do not create files.
