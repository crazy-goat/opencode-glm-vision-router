# AGENTS.md

## Commands

| Task                  | Command                  |
| --------------------- | ------------------------ |
| Install dependencies  | `bun install`            |
| Unit tests            | `bun test`               |
| Lint and format check | `bash bin/lint.sh`       |
| Auto-fix formatting   | `bash bin/lint.sh --fix` |
| End-to-end harness    | `bash bin/e2e.sh`        |

The end-to-end harness is optional. CI does not run it. It starts a mock OpenAI-compatible
provider and an isolated `opencode serve` that loads the plugin from the working tree. It
checks the model of each request in six scenarios: image upload, next text turn, image
read, steered prompt, queued prompt and auxiliary requests. It prints a JSON summary and
exits non-zero if a check fails. It prints `skipped` and exits 0 if no `opencode` binary is
found. If `OPENCODE_BIN` is set but is not an executable file, it exits 1. Set `OPENCODE_BIN` to choose the binary. The child process gets a temporary HOME,
TMPDIR and XDG directories, so it never reads your user config or sessions. System and
MDM-managed OpenCode config still applies. Set `E2E_DEBUG=1` to
print the server log.

`bin/lint.sh` runs ESLint, Prettier and the unit tests. It runs every step even
when one fails, and exits non-zero if any step failed. CI runs the same script
in the `ci-ok` job.

## Layout

| Path                  | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `src/index.js`        | Plugin definition and hook registration                                  |
| `src/detect.js`       | Pure detection and routing helpers, no OpenCode imports                  |
| `test/detect.test.js` | Unit tests for `src/detect.js`                                           |
| `test/index.test.js`  | Unit tests for the hooks in `src/index.js`, with a fake OpenCode context |
| `test/fixtures.js`    | Stored message and model fixtures, checked with the OpenCode schema      |
| `bin/lint.sh`         | The repository lint contract                                             |
| `bin/e2e.sh`          | Optional end-to-end harness, starts `test/e2e/run.mjs`                   |
| `test/e2e/run.mjs`    | Mock provider, isolated `opencode serve` and the six scenarios           |
| `docs/workflow.md`    | Development process                                                      |

There is no build step. The package ships plain ESM JavaScript.

## Conventions

- Write everything in English: code, comments, commits, docs, issues and PRs.
- Use Conventional Commits.
- Add a `CHANGELOG.md` entry under `[Unreleased]` for user-visible changes.
- Keep `src/detect.js` free of OpenCode imports so its decisions stay testable.
- `experimental.model.resolve` is an experimental OpenCode hook. Check the
  installed OpenCode version before changing hook names.
