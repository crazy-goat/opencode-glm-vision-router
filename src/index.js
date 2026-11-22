/**
 * OpenCode V2 plugin: route image turns from a text-only GLM 5.3 model to the
 * vision-capable GLM 5.3 Flash model of the same provider.
 *
 * The plugin keeps no state between requests. Before each primary request on
 * the text model, it reads the stored messages of the current turn. When they
 * carry an image, that one request uses the vision model. The session keeps
 * its selected model, and the assistant message records the model used.
 */
import { Plugin } from "@opencode/plugin"
import {
  acceptsInput,
  findModel,
  isRoutable,
  rescueEnabled,
  screenshotImage,
  toolContent,
  needsVision,
  turnModalities,
  visionModelRef,
  visionReadContent,
} from "./detect.js"

export const DEFAULTS = {
  provider: "opencode-go",
  text: "glm-5.3",
  vision: "glm-5.3-flash",
  rescue: true,
  screenshotTools: [],
}

export default Plugin.define({
  id: "glm-vision-router",
  async setup(ctx) {
    const options = ctx.options ?? {}
    const provider = String(options.provider ?? DEFAULTS.provider)
    const textModel = String(options.text ?? DEFAULTS.text)
    const visionModel = String(options.vision ?? DEFAULTS.vision)
    const allowlist = Array.isArray(options.variants)
      ? new Set(options.variants.map(String))
      : undefined
    const rescue = rescueEnabled(options.rescue)
    const screenshotTools = new Set(
      (Array.isArray(options.screenshotTools)
        ? options.screenshotTools
        : DEFAULTS.screenshotTools
      ).map(String),
    )

    const warned = new Set()
    const warnOnce = (message, ...details) => {
      // The key includes the error, so a failure with a new cause still logs.
      const key = [
        message,
        ...details.map((d) => (d instanceof Error ? `${d.name}: ${d.message}` : String(d))),
      ].join("\n")
      if (warned.has(key)) return
      warned.add(key)
      console.warn(`[glm-vision-router] ${message}`, ...details)
    }

    // experimental.model.resolve is an experimental OpenCode hook.
    await ctx.session.hook("experimental.model.resolve", async (event) => {
      if (!isRoutable(event, { provider, textModel })) return
      try {
        // OpenCode stores a new prompt before it resolves the model for the
        // first step, and the tool results of a step before the next step.
        const messages = await ctx.session.context({ sessionID: event.sessionID })
        const modalities = turnModalities(messages, { toolResults: rescue })
        if (modalities.size === 0) return
        const models = await ctx.model.list()
        const textInfo = findModel(models, provider, textModel)
        // No warning when the text model accepts every file of the turn.
        if (![...modalities].some((modality) => !acceptsInput(textInfo, modality))) return
        const visionInfo = findModel(models, provider, visionModel)
        if (!visionInfo) {
          warnOnce(
            `${provider}/${visionModel} is not in the model list. Media turns stay on ${provider}/${textModel}.`,
          )
          return
        }
        if (!needsVision(modalities, { textInfo, visionInfo })) return
        event.model = visionModelRef({ model: event.model, visionModel, visionInfo, allowlist })
      } catch (error) {
        // A failed check must not fail the request, so the selected model stays.
        warnOnce("The media check failed. The request keeps the selected model.", error)
      }
    })

    // A screenshot tool that saves the image only to a file returns no image
    // to route. The instruction makes the model read the file. The read
    // result carries the image, so the next request of the turn routes.
    if (rescue && screenshotTools.size > 0) {
      await ctx.tool.hook("execute.after", (event) => {
        if (event.status !== "completed") return
        if (!screenshotTools.has(event.tool)) return
        const { inline, paths } = screenshotImage(event.result)
        if (inline || paths.length === 0) return
        event.result.content = [
          ...toolContent(event.result),
          { type: "text", text: visionReadContent(paths) },
        ]
      })
    }
  },
})
