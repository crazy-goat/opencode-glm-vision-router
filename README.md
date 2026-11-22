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

1. The `prompt` hook checks the prompt files and the admission metadata
   attachments of each new user turn and stores an image flag for that
   session. Client uploads that arrive as metadata attachments are covered.
2. The `context` hook keeps the flag armed for the rest of the turn when the
   assembled request carries images: metadata attachments or image parts of
   the last user message, or image parts in tool results. It runs after model
   resolution, so it can only affect later requests of the same turn.
3. The `experimental.model.resolve` hook rewrites the model for `primary`
   requests when the flag is set and the selected model is
   `opencode-go/glm-5.3`. Auxiliary requests such as titles and compaction
   are skipped.
4. When the text model reads an image file with the `read` tool, the
   `execute.after` tool hook replaces the image result with a short pointer
   text and arms the flag, before the result reaches the model. The pointer
   names the file and the vision model, and asks for the file to be read
   again. The next request then resolves to the vision model, and the repeat
   read returns the image normally.

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
  Tool results that carry an inline image, such as a browser screenshot,
  cannot be rescued this way: OpenCode drops the image part before any hook
  can act on it. Save such an image to a file and read it instead.
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
