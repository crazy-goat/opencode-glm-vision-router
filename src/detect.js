/**
 * Image detection and routing helpers.
 *
 * This module imports nothing from OpenCode, so the decisions can be unit
 * tested without a running server. The helpers read stored session messages
 * in the encoded form that `ctx.session.context()` returns to a plugin.
 */

const IMAGE_MIME = /^image\//i
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|tiff?)$/i

/** True when a MIME type names an image. */
export function isImageMime(mime) {
  return IMAGE_MIME.test(String(mime ?? "").trim())
}

/**
 * The messages of the current turn: all messages after the last `idle`
 * marker. OpenCode appends that marker once per busy period, when the session
 * stops after a success, a failure or an interruption. A prompt steered into
 * a running turn stays in the turn. A queued prompt that runs before the
 * session stops is in the turn too: the stored messages do not record how a
 * prompt arrived.
 */
export function currentTurn(messages) {
  if (!Array.isArray(messages)) return []
  const last = messages.findLastIndex((message) => message?.type === "idle")
  return messages.slice(last + 1)
}

/**
 * True when a stored user message carries an image. OpenCode sends only the
 * message files to the model. Desktop path attachments reach the model as
 * text and are kept in `metadata.attachments`; routing them lets the vision
 * model read the file in the same turn.
 */
export function userMessageHasImage(message) {
  if (message?.type !== "user") return false
  const files = Array.isArray(message.files) ? message.files : []
  if (files.some((file) => isImageMime(file?.mime))) return true
  const attachments = Array.isArray(message.metadata?.attachments)
    ? message.metadata.attachments
    : []
  return attachments.some(
    (attachment) =>
      isImageMime(attachment?.mime) ||
      IMAGE_EXTENSION.test(String(attachment?.name ?? "")) ||
      IMAGE_EXTENSION.test(String(attachment?.path ?? "")),
  )
}

/** True when a stored assistant message holds a tool result with an image file. */
export function toolResultHasImage(message) {
  if (message?.type !== "assistant") return false
  const parts = Array.isArray(message.content) ? message.content : []
  return parts.some((part) => {
    if (part?.type !== "tool") return false
    const content = Array.isArray(part.state?.content) ? part.state.content : []
    return content.some((item) => item?.type === "file" && isImageMime(item.mime))
  })
}

/**
 * True when the current turn carries an image: in a user message, or, when
 * `toolResults` is true, in a tool result.
 */
export function turnHasImage(messages, { toolResults = true } = {}) {
  return currentTurn(messages).some(
    (message) => userMessageHasImage(message) || (toolResults && toolResultHasImage(message)),
  )
}

/** True when the router applies: a primary request on the configured text model. */
export function isRoutable(event, { provider, textModel }) {
  return (
    event?.kind === "primary" &&
    event.model?.providerID === provider &&
    event.model?.id === textModel
  )
}

/** The catalog entry of one model in a model list, or undefined. */
export function findModel(list, providerID, modelID) {
  const models = Array.isArray(list) ? list : Array.isArray(list?.data) ? list.data : []
  return models.find((model) => model?.providerID === providerID && model?.id === modelID)
}

/**
 * The variant to carry to the vision model, or undefined. OpenCode rejects a
 * variant that the model does not define, so the catalog entry decides. An
 * optional allowlist narrows the choice further.
 */
export function visionVariant(variant, visionInfo, allowlist) {
  if (variant === undefined || variant === null) return undefined
  const id = String(variant)
  if (allowlist && !allowlist.has(id)) return undefined
  const defined = Array.isArray(visionInfo?.variants) ? visionInfo.variants : []
  return defined.some((item) => item?.id === id) ? id : undefined
}

/**
 * The model reference for a routed request. OpenCode accepts a rewrite only
 * to a model of the same provider, so the provider does not change.
 */
export function visionModelRef({ model, visionModel, visionInfo, allowlist }) {
  const variant = visionVariant(model?.variant, visionInfo, allowlist)
  return {
    providerID: model.providerID,
    id: visionModel,
    ...(variant === undefined ? {} : { variant }),
  }
}

/** True unless the rescue option is explicitly false. */
export function rescueEnabled(value) {
  return value !== false
}

/**
 * Image evidence of a screenshot tool result: an inline image file in the
 * content, and the paths of saved image files in the output.
 */
export function screenshotImage(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const output = result?.output && typeof result.output === "object" ? result.output : {}
  const paths = []
  if (Array.isArray(output.files)) {
    for (const file of output.files) {
      if (isImageMime(file?.mime) && file?.path) paths.push(String(file.path))
    }
  }
  if (typeof output.path === "string" && output.path) paths.push(output.path)
  const inline = content.some((item) => item?.type === "file" && isImageMime(item.mime))
  return { inline, paths }
}

/** Instruction added when a screenshot tool saves the image only to a file. */
export function visionReadContent(paths) {
  return `Screenshot saved to: ${paths.join(", ")}. Read the file to view the image.`
}
