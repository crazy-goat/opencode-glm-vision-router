# AGENTS.md

## Commands

| Task                  | Command                  |
| --------------------- | ------------------------ |
| Install dependencies  | `bun install`            |
| Unit tests            | `bun test`               |
| Lint and format check | `bash bin/lint.sh`       |
| Auto-fix formatting   | `bash bin/lint.sh --fix` |

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
| `docs/workflow.md`    | Development process                                                      |

There is no build step. The package ships plain ESM JavaScript.

## Conventions

- Write everything in English: code, comments, commits, docs, issues and PRs.
- Use Conventional Commits.
- Add a `CHANGELOG.md` entry under `[Unreleased]` for user-visible changes.
- Keep `src/detect.js` free of OpenCode imports so its decisions stay testable.
- `experimental.model.resolve` is an experimental OpenCode hook. Check the
  installed OpenCode version before changing hook names.
