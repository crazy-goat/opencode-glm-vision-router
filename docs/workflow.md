# Workflow

This repository follows the [crazy-goat repository
standard](https://github.com/crazy-goat/.github). The canonical process lives in
[`standard/workflow.md`](https://github.com/crazy-goat/.github/blob/main/standard/workflow.md)
of the `.github` repository.

Summary:

1. Pick an issue from the lowest open milestone with `bin/pick-issue.sh`.
2. Create a worktree with `bin/worktree.sh <issue>`.
3. Write code and tests in the worktree. Run `bash bin/lint.sh`.
4. Get a review from a separate subagent through `review.md`.
5. Push the branch, open a PR and wait for the `ci-ok` job.
6. Squash merge on green CI.
7. Turn findings into issues.
8. Clean up with `bin/worktree-done.sh`.

Write everything in English: code, comments, commit messages, documentation,
issues and pull requests. Use Conventional Commits. Add a `CHANGELOG.md` entry
under `[Unreleased]` for every user-visible change.

Build, lint and test commands live in [`AGENTS.md`](../AGENTS.md).
