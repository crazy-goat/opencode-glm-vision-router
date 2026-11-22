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

const CODEMODE_NOTICE =
  /^<codemode id="[^"\n]*" state="(?:completed|error)">\n([\s\S]*)\n<\/codemode>$/
const FILE_LOCATION = /^(\/|file:\/\/|[A-Za-z]:[\\/])/

/**
 * True when a stored message is the notice of a Code Mode job that ran in the
 * background, and the notice lists the path of an image file. OpenCode saves
 * the files of such a job and lists only their paths, one per line, in a
 * synthetic message. The check needs the `codemode` source in the metadata
 * and the `<codemode>` text wrapper, so other text never matches.
 */
export function codemodeNoticeHasImage(message) {
  if (message?.type !== "synthetic" || message.metadata?.source !== "codemode") return false
  const match = CODEMODE_NOTICE.exec(String(message.text ?? ""))
  if (!match) return false
  return match[1]
    .split("\n")
    .some((line) => FILE_LOCATION.test(line) && IMAGE_EXTENSION.test(line.trim()))
}

/**
 * True when the current turn carries an image: in a user message, or, when
 * `toolResults` is true, in a tool result or a Code Mode job notice.
 */
export function turnHasImage(messages, { toolResults = true } = {}) {
  return currentTurn(messages).some(
    (message) =>
      userMessageHasImage(message) ||
      (toolResults && (toolResultHasImage(message) || codemodeNoticeHasImage(message))),
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

/**
 * The content of a tool result as a list, with the rules of OpenCode: a
 * string becomes one text item, and an empty or missing content becomes the
 * output as text. OpenCode normalizes the content before the `execute.after`
 * hooks and again after all of them, but not between them. So an earlier hook
 * can leave a string or an empty content.
 */
export function toolContent(result) {
  const content = result?.content
  if (typeof content === "string") return [{ type: "text", text: content }]
  if (Array.isArray(content) && content.length > 0) return [...content]
  return [{ type: "text", text: stringify(result?.output) }]
}

function stringify(value) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Instruction added when a screenshot tool saves the image only to a file. */
export function visionReadContent(paths) {
  return `Screenshot saved to: ${paths.join(", ")}. Read the file to view the image.`
}
