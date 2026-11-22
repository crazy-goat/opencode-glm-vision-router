/**
 * Image detection and routing helpers.
 *
 * This module imports nothing from OpenCode, so the decisions can be unit
 * tested without a running server.
 */

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp)$/i
const DATA_IMAGE = /^data:image\//i

/** True when a prompt attachment looks like an image. */
export function fileIsImage(file) {
  const uri = String(file?.uri ?? "")
  const name = String(file?.name ?? "")
  return IMAGE_EXTENSION.test(name || uri) || DATA_IMAGE.test(uri)
}

/** True when a request message part carries image media. */
export function partIsImage(part) {
  if (!part) return false
  if (part.type === "image") return true
  if (String(part.mime ?? part.mediaType ?? "").startsWith("image/")) return true
  return DATA_IMAGE.test(String(part.uri ?? ""))
}

/** Content parts of a request message, or an empty array. */
export function partsOf(message) {
  if (Array.isArray(message?.content)) return message.content
  return Array.isArray(message?.parts) ? message.parts : []
}

/**
 * Tool results arrive after the last user message. Images from older turns
 * stay in the history; they must not keep the router armed.
 */
export function toolResultHasImage(messages) {
  let lastUser = -1
  messages.forEach((message, index) => {
    if (message?.role === "user") lastUser = index
  })
  return messages.slice(lastUser + 1).some((message) => partsOf(message).some(partIsImage))
}

/**
 * Decide the model for one request. Returns the input model unchanged when
 * the router does not apply. OpenCode rejects a cross-provider rewrite from
 * experimental.model.resolve, so both models must share one provider.
 */
export function resolveModel(input) {
  const { model, kind, provider, textModel, visionModel, sharedVariants, hasImage } = input
  if (kind !== "primary") return model
  if (model.providerID !== provider) return model
  if (model.id !== textModel) return model
  if (!hasImage) return model
  const variant = sharedVariants.has(model.variant) ? { variant: model.variant } : {}
  return { providerID: provider, id: visionModel, ...variant }
}
