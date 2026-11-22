/**
 * OpenCode V2 plugin: route image turns from a text-only GLM 5.3 model to the
 * vision-capable GLM 5.3 Flash model of the same provider.
 *
 * The rewrite applies to one request only. The session keeps showing the
 * selected model, and the assistant message records the model actually used.
 */
import { Plugin } from "@opencode/plugin"
import {
  attachmentIsImage,
  attachmentsOf,
  fileIsImage,
  resolveModel,
  toolResultHasImage,
  userTurnHasImage,
} from "./detect.js"

export const DEFAULTS = {
  provider: "opencode-go",
  text: "glm-5.3",
  vision: "glm-5.3-flash",
  variants: ["low", "high", "max"],
}

/** Per-session state. A prompt hook owns each new user turn. */
const imageTurns = new Map()

export default Plugin.define({
  id: "glm-vision-router",
  async setup(ctx) {
    const options = ctx.options ?? {}
    const provider = String(options.provider ?? DEFAULTS.provider)
    const textModel = String(options.text ?? DEFAULTS.text)
    const visionModel = String(options.vision ?? DEFAULTS.vision)
    const sharedVariants = new Set(
      Array.isArray(options.variants) ? options.variants : DEFAULTS.variants,
    )

    await ctx.session.hook("prompt", (event) => {
      const files = event.prompt.files ?? []
      const attachments = attachmentsOf(event)
      imageTurns.set(
        event.sessionID,
        files.some(fileIsImage) || attachments.some(attachmentIsImage),
      )
    })

    await ctx.session.hook("context", (event) => {
      const messages = event.messages ?? []
      if (userTurnHasImage(messages) || toolResultHasImage(messages)) {
        imageTurns.set(event.sessionID, true)
      }
    })

    // Experimental hook. Older @opencode/plugin typings do not list it, so
    // this package is plain JavaScript and registers the hook by name.
    await ctx.session.hook("experimental.model.resolve", (event) => {
      event.model = resolveModel({
        model: event.model,
        kind: event.kind,
        provider,
        textModel,
        visionModel,
        sharedVariants,
        hasImage: imageTurns.get(event.sessionID) === true,
      })
    })
  },
})
