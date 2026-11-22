# @crazy-goat/opencode-glm-vision-router

An [OpenCode](https://opencode.ai) V2 plugin that routes image turns from a
text-only GLM 5.3 model to the vision-capable GLM 5.3 Flash model of the same
provider.

The rewrite applies to one request at a time. The session keeps showing the
selected model. The assistant message records the model actually used. The
next turn without an image uses the selected model again.

## Requirements

- OpenCode V2, version 2.2.7 or newer. Tested on 2.3.2.
- Two models under the same provider: one text-only, one with image input.
- The vision model must be in the OpenCode model list. A disabled model is not
  in this list.

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

When `opencode-go/glm-5.3` handles a turn with an image, the plugin sends the
requests of that turn to `opencode-go/glm-5.3-flash`. Other models stay
unchanged. The default setup needs no options.

## Options

Set the options in the plugin entry of `opencode.jsonc`:

```jsonc
{
  "plugins": [
    {
      "package": "github:crazy-goat/opencode-glm-vision-router",
      "options": {
        "variants": ["low", "high"],
        "screenshotTools": ["capture_screen"],
      },
    },
  ],
}
```

| Option            | Type     | Default           | Description                                                                                                                        |
| ----------------- | -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `provider`        | string   | `"opencode-go"`   | The provider of both models.                                                                                                       |
| `text`            | string   | `"glm-5.3"`       | The text-only model. The plugin changes only requests on this model.                                                               |
| `vision`          | string   | `"glm-5.3-flash"` | The model with image input. It must be in the model list of `provider`.                                                            |
| `variants`        | string[] | not set           | The variants that the plugin carries over to the vision model. If not set, it carries over each variant that the vision model has. |
| `rescue`          | boolean  | `true`            | Route the request after a tool result with an image. If `false`, only user images route, and `screenshotTools` has no effect.      |
| `screenshotTools` | string[] | `[]`              | Tools that save a screenshot to a file and return no image. The plugin adds a read instruction to their result.                    |

## How it works

The plugin keeps no state. It decides from the messages that OpenCode stores
for the session.

1. Before each `primary` request on the text model, the
   `experimental.model.resolve` hook reads the stored messages with
   `ctx.session.context()`.
2. The plugin takes the messages after the last `idle` marker. These messages
   are the current turn. OpenCode writes the marker when the session stops.
3. The plugin looks for an image in the current turn:
   - an image file in a user message;
   - an image path attachment from a desktop client, in the message metadata;
   - an image file in a tool result, for example from a `read` of an image or
     from a screenshot tool. The `rescue` option controls this check.
4. If the turn has an image, the request uses the vision model. The plugin
   carries over the variant only if the vision model has it and `variants`
   allows it.
5. If the vision model is not in the model list, or if the check fails, the
   request keeps the selected model. The plugin writes a warning to the log
   once.

OpenCode stores a new prompt before the first request of a turn. It stores the
tool results of a step before the next request. Because of this order, a user
image routes the first request of its turn. A tool image routes the request
after the tool step.

A text prompt that you steer into a running image turn stays in that turn. The
next requests of the turn still use the vision model.

Requests of other kinds, such as titles and compaction, stay unchanged.
Requests on other models or other providers also stay unchanged.

For a tool in `screenshotTools`, the `execute.after` tool hook checks the
completed result. The hook acts only if the result has no image and its output
gives an image path: an `output.path` string, or an `output.files` item with an
image MIME type and a `path`. Then the hook adds this text to the result:
`Screenshot saved to: <path>. Read the file to view the image.` The model reads
the file, and the next request uses the vision model.

For an MCP tool, OpenCode takes the output from `structuredContent`, or from a
text result that is JSON. A plain text result such as `Saved to /tmp/a.png`
gives no path, so the hook does nothing.

## Limitations

- `experimental.model.resolve` is experimental. Its name or event shape can
  change in a future OpenCode release.
- A rewrite can only select another model from the **same provider**. A model
  from another provider resolves as unavailable.
- The plugin checks the list of enabled models. If the vision model is not in
  this list, image turns stay on the text model. Do not disable the vision
  model.
- The plugin reads the stored session before each `primary` request on the text
  model. In a long session, this read takes more time.
- Images in older turns do not route. If a new turn is about an earlier image,
  attach the image again.
- OpenCode writes one `idle` marker when the session stops. A prompt that you
  queue during an image turn runs before that marker, so it also uses the
  vision model.
- A desktop path attachment gives the model only the file path. The vision model
  must read the file to see the image.
- In a later turn on the text model, OpenCode replaces older images with a short
  note.
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
