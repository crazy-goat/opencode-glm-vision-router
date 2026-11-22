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
  const path = String(file?.path ?? "")
  const name = String(file?.name ?? "")
  return IMAGE_EXTENSION.test(name || uri || path) || DATA_IMAGE.test(uri)
}

/** True when an admission attachment looks like an image. */
export function attachmentIsImage(attachment) {
  return fileIsImage(attachment) || String(attachment?.mime ?? "").startsWith("image/")
}

/** Attachments of a prompt event or a stored message, in any known shape. */
export function attachmentsOf(record) {
  if (Array.isArray(record?.attachments)) return record.attachments
  if (Array.isArray(record?.metadata?.attachments)) return record.metadata.attachments
  return []
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

/** The last user message of a request context, or undefined. */
function lastUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index]
  }
  return undefined
}

/** True when the current user turn carries an image in attachments or parts. */
export function userTurnHasImage(messages) {
  const user = lastUserMessage(messages)
  if (!user) return false
  return attachmentsOf(user).some(attachmentIsImage) || partsOf(user).some(partIsImage)
}

/** True when a read-tool target looks like an image. */
export function readTargetIsImage(input) {
  const path = String(input?.path ?? "")
  return IMAGE_EXTENSION.test(path) || DATA_IMAGE.test(path)
}

/** Pointer text returned instead of an image a text-only model cannot display. */
export function rescueContent(path, visionModel) {
  return `Image file: ${path}. The current model has no image input. The next request uses ${visionModel}. Read the file again to view the image.`
}

/** True unless the rescue option is explicitly false. */
export function rescueEnabled(value) {
  return value !== false
}

/** True when a completed tool call is a screenshot tool the hook handles. */
export function isScreenshotTool(tool, screenshotTools) {
  return screenshotTools.has(String(tool ?? ""))
}

/**
 * Image evidence of a screenshot tool result. A screenshot tool returns an
 * image by definition, so a saved output path counts without a MIME type.
 */
export function screenshotImage(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const output = result?.output ?? {}
  const paths = []
  if (Array.isArray(output.files)) {
    for (const file of output.files) {
      if (String(file?.mime ?? "").startsWith("image/") && file?.path) {
        paths.push(String(file.path))
      }
    }
  }
  if (typeof output.path === "string" && output.path) paths.push(output.path)
  return { inline: content.some(partIsImage), paths }
}

/** Instruction added when a screenshot is saved only as a file. */
export function visionReadContent(paths, visionModel) {
  const list = paths.join(", ")
  return `Screenshot saved to: ${list}. The current model has no image input. The next request uses ${visionModel}. Read the file to view the image.`
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
