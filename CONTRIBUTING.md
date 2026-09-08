# Contributing

We'd like to try something a little different with this repo.

Given that coding agents write most underlying code now, we'd prefer contributions in the form of
_human-written_ text. Run your idea by us the same way you would a coworker — informally, over
Slack. If we're aligned on the change, we're happy to burn our tokens on the implementation.

Please don't have AI expand a one-paragraph idea into a formal proposal. The paragraph was the
useful part.

Submit changes as a PR adding a `.txt` or `.md` file to the [`adrs/`](./adrs/) folder.

If you'd rather just send the code, that's fine too — but lead with why, and keep the diff small
enough that a person can hold it in their head.

PS: Report security vulnerabilities privately — see [`SECURITY.md`](./SECURITY.md), not a public
issue.

---

## Running it

Everything you need is in the [README](./README.md#quick-start). Short version:

```sh
cp .env.example .env      # fill in ALLOWED_SIGN_IN and the two Google values
bun install
docker compose up -d
bun run db:deploy && bun run db:seed
bun run dev
```

## Before you push

```sh
bun run check-types
bun run lint
bun run lint:slop
bun run test
```

All four run on CI, and `bun run format` fixes most of what `lint` complains about.

`lint:slop` is [anti-slop](https://github.com/dmmulroy/anti-slop) over Oxlint, and it holds one
line: **data crossing an I/O boundary is parsed into a domain type at the point it arrives.** No
`Record<string, unknown>` standing in for a contract, no `typeof` check standing in for a parser,
no `unknown` parameter without a schema, no `as unknown as` around a `Json` column. Shapes that
cross a package boundary live in `packages/validation/src`, one module per shape. It was taken to
zero in one pass; the gate is what keeps it there. A genuinely open map — a telemetry property
bag, a log field, a user-defined custom field value — is scoped off in `.oxlintrc.json` with its
reason, and that is the only sanctioned way past it.

**A `pre-push` hook runs them for you**, so a push that would fail CI fails on your machine
instead, where the feedback is in seconds rather than minutes. `bun install` wires it up — the
hooks live in `.githooks/` and `prepare` points `core.hooksPath` at them, so there is nothing to
install and no hook manager in the dependency tree. Turbo caches, so a second push that changed
nothing relevant is nearly free.

The hook resolves Bun from `CRM_BUN`, `PATH`, `BUN_INSTALL`, or `~/.bun/bin/bun`, in that
order. Set `CRM_BUN` to the executable path when a managed shell does not expose Bun on `PATH`.

It needs the Postgres from `docker compose up -d`, because the API and telemetry tests are real
integration tests. When you need to push past it — a WIP branch, a docker-less machine, a red test
you are deliberately pushing to ask about — `git push --no-verify` skips it, and `CRM_SKIP_HOOKS=1`
skips it for a whole shell.

**The suite runs against `TEST_DATABASE_URL`, never `DATABASE_URL`, and refuses to start without
it.** `bun run db:test` creates the database and migrates it; the name has to end in `_test`.
These tests write and delete real rows, and the hook above runs them on every push — so without
that split, one `git push` reaches whatever database your `.env` happens to name, which for a
self-hoster is production. That is not hypothetical: a run that was interrupted between deleting
the workspace's members and putting them back left the developer locked out of their own
workspace, with the app reporting only "Only an owner or an admin can change this".

**A test may not delete a row it did not create.** Snapshot-and-restore is not a substitute: it
only holds if the process reaches the end, and a crashed run leaves the hole. Where a spec needs
state it cannot own — `ensureWorkspaceMembership` only backfills an owner into an *empty*
workspace — it asserts the precondition and fails, rather than clearing whatever is in the way.

**`test` runs one package at a time (`turbo run test --concurrency=1`), and that is not an
oversight.** `apps/api`, `apps/agent`, `packages/auth` and `packages/telemetry` all have real
integration tests and they all point at the *same* database, so running them at once lets one
package's fixtures land inside another package's assertions. The specs mutate global singletons —
the workspace `organization` row, `AppSetting`'s reporting currency, the exchange-rate table — and
none of that is namespaced per package. Left parallel it failed roughly three runs in four, on a
different test each time, which reads as "flaky tests" and trains everyone to hit re-run. Serial
costs about ten seconds. **Do not raise the concurrency without giving each package its own
database.**

A few things that trip people up:

- **The tRPC router type is generated, and committed.** If the app can't see a procedure you just
  added, run `bun run --filter=api trpc:generate` and commit `apps/api/src/generated/server.ts`
  alongside the router change. `bun run dev` keeps it in watch mode.
- **Schema changes need a migration**, not `db:push`. `bun run db:migrate` creates one.
- **New environment variables need a home.** Add them to `.env.example` and, if the API reads them,
  to `apps/api/src/config/env.validation.ts`. A variable that only exists in someone's shell is a
  variable that breaks the next person's clone.

## Shipping a change

Start from `release`, which is the integration and production branch. Run `git switch release && git pull` before branching.

Push a feature branch. Automation opens its pull request against `release` and keeps its generated conventional title current. Pull requests opened against another base are retargeted to `release`.

Merging a feature pull request into `release` runs CI and feeds release-please. Release-please maintains a separate release pull request against `release`. Merging that release pull request updates `CHANGELOG.md`, bumps the version, creates the tag, and publishes the GitHub Release.

The pull request title becomes the squash commit subject and release note. Use a Conventional Commit title such as `feat(app): add approval queue` or `fix(db): enforce tenant scope`.

## Releases

The release workflow runs on `release`. It uses `AUTOMATION_TOKEN`, `RELEASE_PLEASE_TOKEN`, or `GITHUB_TOKEN`, in that order. `workflow_dispatch` can rerun the workflow after a corrected configuration or repository rule.

Release branch protection should require the `check-types, lint, test, build` and conventional-title checks. An `AUTOMATION_TOKEN` lets automation-created pull requests trigger those checks.

## House style

The repo has opinions, and they're written down where the work happens rather than in a style
guide:

- [`AGENTS.md`](./AGENTS.md) — the rules that apply to everything, and where the others live.
- [`docs/design.md`](./docs/design.md) — UI. Short version: `packages/ui` is the only place
  components come from, and you don't override its styles at the call site.
- [`docs/api.md`](./docs/api.md) — logging, tRPC, caching, and why intelligence never lives in the
  API.

Two that are worth stating here because they explain most review comments:

**Comments say why, not what.** The code already says what it does. A comment earns its place by
recording the thing that isn't in the diff — the bug that made this necessary, the obvious approach
that turned out wrong, the constraint that looks arbitrary until you know.

**Nothing about a person is guessed.** This is a CRM: a confidently wrong fact about a real customer
is worse than a blank field, because nobody can tell it's wrong. Code that fills a gap with a
plausible value is a bug here even when it's convenient.

## Reporting a bug

Include what you expected, what happened, and enough to reproduce it. If it involves the agent, the
session transcript is worth more than a description of it — but read it first and redact anything
that belongs to a real customer.
