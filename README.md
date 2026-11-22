# @crazy-goat/opencode-glm-vision-router

An [OpenCode](https://opencode.ai) V2 plugin that routes image turns from a
text-only GLM 5.3 model to the vision-capable GLM 5.3 Flash model of the same
provider.

The rewrite applies to one request only. The session keeps showing the selected
model. The assistant message records the model actually used. A text-only user
turn restores the selected model.

## Requirements

- OpenCode V2, version 2.2.7 or newer. Tested on 2.3.2.
- Two models under the same provider: one text-only, one with image input.

The default pair targets [OpenCode Go](https://opencode.ai/docs/console/go/):

| Role  | Model                       | Input              |
| ----- | --------------------------- | ------------------ |
| text  | `opencode-go/glm-5.3`       | text               |
| image | `opencode-go/glm-5.3-flash` | text, image, video |

Both offer the `low`, `high` and `max` variants. On the Go flat plan, requests
report a cost of zero and consume the per-5-hour request allowance instead.

## Install

```sh
opencode plugin add github:crazy-goat/opencode-glm-vision-router
```

When `opencode-go/glm-5.3` handles a turn with an image, the plugin uses
`opencode-go/glm-5.3-flash` for that one request. Other models are left
unchanged. No options are needed.

## How it works

1. The `prompt` hook checks the attachments of each new user turn and stores
   an image flag for that session.
2. The `context` hook detects images returned by tools after the last user
   message, for example the `read` tool on a PNG file.
3. The `experimental.model.resolve` hook rewrites the model for `primary`
   requests when the flag is set and the selected model is
   `opencode-go/glm-5.3`. Auxiliary requests such as titles and compaction
   are skipped.

Images in older turns do not keep the router armed. A new user turn without an
image clears the flag.

## Limitations

- `experimental.model.resolve` is experimental. Its name or event shape may
  change in a future OpenCode release.
- A rewrite can only select another model from the **same provider**. A model
  from another provider resolves as unavailable.
- A variant is carried over only when it appears in `variants`.
- OpenCode replaces unsupported image parts with a short note when the active
  model has no image input. The router avoids that by switching beforehand.
- The plugin does not change the session's selected model. `/models` still
  shows the text model.

## Development

```sh
bun install
bun test
bash bin/lint.sh
```

The repository follows the [crazy-goat repository
standard](https://github.com/crazy-goat/.github). Write everything in English.
Use Conventional Commits and add a `CHANGELOG.md` entry for user-visible
changes.

## License

MIT. See [LICENSE](LICENSE).
