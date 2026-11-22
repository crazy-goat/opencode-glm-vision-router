/**
 * Media detection and routing helpers.
 *
 * This module imports nothing from OpenCode, so the decisions can be unit
 * tested without a running server. The helpers read stored session messages
 * in the encoded form that `ctx.session.context()` returns to a plugin.
 */

import { URL, fileURLToPath } from "node:url"

const IMAGE_MIME = /^image\//i
// A path attachment reaches the model as text, so the vision model must read
// the file. The OpenCode read tool returns only images and pdf files.
const READABLE_MODALITIES = new Set(["image", "pdf"])
// The OpenCode read tool returns media only for these image types.
const MODALITY_EXTENSIONS = {
  image: /\.(png|jpe?g|gif|webp)$/i,
  pdf: /\.pdf$/i,
}
const IMAGE_EXTENSION = MODALITY_EXTENSIONS.image

/** True when a MIME type names an image. */
export function isImageMime(mime) {
  return IMAGE_MIME.test(String(mime ?? "").trim())
}

/**
 * The input modality of a MIME type: "image", "audio", "video" or "pdf", or
 * undefined. The rules are the ones OpenCode uses to decide which files a
 * model can read.
 */
export function mimeModality(mime) {
  const value = String(mime ?? "")
    .trim()
    .toLowerCase()
  for (const modality of ["image", "audio", "video"]) {
    if (value.startsWith(`${modality}/`)) return modality
  }
  return value === "application/pdf" ? "pdf" : undefined
}

// MIME types of the images that the read tool returns.
const READABLE_IMAGE_MIME = /^image\/(png|jpeg|gif|webp)$/i

/** True when a file path is an image that the read tool returns. */
function isReadableImagePath(path, mime) {
  return (
    IMAGE_EXTENSION.test(String(path ?? "")) || READABLE_IMAGE_MIME.test(String(mime ?? "").trim())
  )
}

function attachmentModality(attachment) {
  const byMime = mimeModality(attachment?.mime)
  if (byMime === "image") {
    const readable =
      READABLE_IMAGE_MIME.test(String(attachment?.mime).trim()) ||
      IMAGE_EXTENSION.test(String(attachment?.name ?? "")) ||
      IMAGE_EXTENSION.test(String(attachment?.path ?? ""))
    return readable ? byMime : undefined
  }
  if (byMime) return READABLE_MODALITIES.has(byMime) ? byMime : undefined
  for (const [modality, extension] of Object.entries(MODALITY_EXTENSIONS)) {
    if (
      extension.test(String(attachment?.name ?? "")) ||
      extension.test(String(attachment?.path ?? ""))
    ) {
      return modality
    }
  }
  return undefined
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
 * The modalities of the files in a stored user message. OpenCode sends only
 * the message files to the model. Desktop path attachments reach the model as
 * text and are kept in `metadata.attachments`; routing them lets the vision
 * model read the file in the same turn. Only the file types that the read tool
 * can return (images and pdf files) count there.
 */
export function userMessageModalities(message) {
  const found = new Set()
  if (message?.type !== "user") return found
  const files = Array.isArray(message.files) ? message.files : []
  for (const file of files) found.add(mimeModality(file?.mime))
  const attachments = Array.isArray(message.metadata?.attachments)
    ? message.metadata.attachments
    : []
  for (const attachment of attachments) found.add(attachmentModality(attachment))
  found.delete(undefined)
  return found
}

/** The modalities of the files in the tool results of a stored assistant message. */
export function toolResultModalities(message) {
  const found = new Set()
  if (message?.type !== "assistant") return found
  const parts = Array.isArray(message.content) ? message.content : []
  for (const part of parts) {
    if (part?.type !== "tool") continue
    const content = Array.isArray(part.state?.content) ? part.state.content : []
    for (const item of content) {
      if (item?.type === "file") found.add(mimeModality(item.mime))
    }
  }
  found.delete(undefined)
  return found
}

const CODEMODE_NOTICE =
  /^<codemode id="[^"\n]*" state="(?:completed|error)">\n([\s\S]*)\n<\/codemode>$/
const FILE_LOCATION = /^(\/|file:\/\/|[A-Za-z]:[\\/])/

/**
 * The modalities of a stored message that is the notice of a Code Mode job
 * that ran in the background: "image" when the notice lists the path of an
 * image file, else none. OpenCode saves
 * the files of such a job and lists only their paths, one per line, in a
 * synthetic message. The check needs the `codemode` source in the metadata
 * and the `<codemode>` text wrapper, so other text never matches.
 */
export function codemodeNoticeModalities(message) {
  const found = new Set()
  if (message?.type !== "synthetic" || message.metadata?.source !== "codemode") return found
  const match = CODEMODE_NOTICE.exec(String(message.text ?? ""))
  if (!match) return found
  const hasImage = match[1]
    .split("\n")
    .some((line) => FILE_LOCATION.test(line) && IMAGE_EXTENSION.test(line.trim()))
  if (hasImage) found.add("image")
  return found
}

/**
 * The modalities of the files in the current turn: in user messages, and,
 * when `toolResults` is true, in tool results and Code Mode job notices.
 */
export function turnModalities(messages, { toolResults = true } = {}) {
  const found = new Set()
  for (const message of currentTurn(messages)) {
    for (const modality of userMessageModalities(message)) found.add(modality)
    if (!toolResults) continue
    for (const modality of toolResultModalities(message)) found.add(modality)
    for (const modality of codemodeNoticeModalities(message)) found.add(modality)
  }
  return found
}

/** True when a model list entry accepts a modality as input. */
export function acceptsInput(info, modality) {
  const input = Array.isArray(info?.capabilities?.input) ? info.capabilities.input : []
  return input.some((item) => String(item).startsWith(modality))
}

/**
 * True when the turn needs the vision model: a file has a modality that the
 * vision model accepts and the text model does not. An unknown text model
 * accepts nothing.
 */
export function needsVision(modalities, { textInfo, visionInfo }) {
  for (const modality of modalities) {
    if (acceptsInput(visionInfo, modality) && !acceptsInput(textInfo, modality)) return true
  }
  return false
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
 * content, and the paths of saved image files in the output. OpenCode turns an
 * MCP `resource_link` into a text part that holds only its URI, so a text
 * that is exactly one image `file://` URI also gives a path.
 */
export function screenshotImage(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const output = result?.output && typeof result.output === "object" ? result.output : {}
  const paths = []
  if (Array.isArray(output.files)) {
    for (const file of output.files) {
      if (isImageMime(file?.mime) && file?.path && isReadableImagePath(file.path, file.mime))
        paths.push(String(file.path))
    }
  }
  if (typeof output.path === "string" && IMAGE_EXTENSION.test(output.path)) paths.push(output.path)
  const texts = [
    ...(typeof result?.output === "string" ? [result.output] : []),
    ...content.flatMap((item) => (item?.type === "text" ? [item.text] : [])),
  ]
  for (const text of texts) {
    const path = imageFileUriPath(text)
    if (path && !paths.includes(path)) paths.push(path)
  }
  const inline = content.some((item) => item?.type === "file" && isImageMime(item.mime))
  return { inline, paths }
}

/** The path of a text that is exactly one local image `file://` URI, or undefined. */
function imageFileUriPath(text) {
  if (typeof text !== "string") return undefined
  const value = text.trim()
  if (!/^file:\/\/\S+$/i.test(value)) return undefined
  try {
    const url = new URL(value)
    if (url.hostname && url.hostname !== "localhost") return undefined
    if (url.search || url.hash || !IMAGE_EXTENSION.test(url.pathname)) return undefined
    decodeURIComponent(url.pathname) // rejects a malformed escape
    return fileURLToPath(url)
  } catch {
    return undefined
  }
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
  const list = paths.map((path) => `"${path}"`).join(", ")
  return `Screenshot saved to: ${list}. Read the file to view the image.`
}
