/**
 * Stored session messages and model list entries in the encoded form that
 * OpenCode 2.3.2 returns to a plugin. Each message builder checks its result
 * with the OpenCode schema in strict mode, so an unknown or misspelled key
 * fails. The schema does not check the keys inside `metadata`, so `user()`
 * checks the keys of the desktop path attachments itself.
 */
import { Model } from "@opencode/schema/model"
import { SessionMessage } from "@opencode/schema/session-message"
import { Schema } from "effect"

const decodeMessage = Schema.decodeUnknownSync(SessionMessage.Info, { onExcessProperty: "error" })
const encodeModel = Schema.encodeSync(Model.Info)

export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
export const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`
export const TEXT_MODEL = { providerID: "opencode-go", id: "glm-5.3" }

let counter = 0
const next = () => {
  counter += 1
  return counter
}
const time = (n) => ({ created: 1_763_800_000_000 + n })

/** Returns the encoded message after the OpenCode schema accepts it. */
export function stored(message) {
  decodeMessage(message)
  return message
}

// The desktop presentation metadata (OpenCode 2.3.2,
// packages/app/src/composer/comment-note.ts): displayText, comments and
// attachments, each attachment with name, mime and path.
const METADATA_KEYS = new Set(["displayText", "comments", "attachments"])
const ATTACHMENT_KEYS = new Set(["name", "mime", "path"])

/**
 * The schema accepts any key inside `metadata`. The fixtures use the desktop
 * presentation metadata, so a key outside that shape is a typo.
 */
function checkMetadata(metadata) {
  for (const key of Object.keys(metadata)) {
    if (!METADATA_KEYS.has(key)) throw new Error(`Unknown metadata key: ${key}`)
  }
  for (const attachment of metadata.attachments ?? []) {
    for (const key of Object.keys(attachment)) {
      if (!ATTACHMENT_KEYS.has(key)) throw new Error(`Unknown attachment key: ${key}`)
    }
  }
}

/** A prompt file as OpenCode stores it after admission. */
export const imageFile = ({ mime = "image/png", name = "shot.png" } = {}) => ({
  data: PNG_BASE64,
  mime,
  source: { type: "inline" },
  name,
})

export const textFile = () => ({
  data: "aGVsbG8=",
  mime: "text/plain",
  source: { type: "inline" },
  name: "notes.txt",
})

export const user = ({ text = "look at this", files, metadata } = {}) => {
  if (metadata) checkMetadata(metadata)
  const n = next()
  return stored({
    id: `msg_user_${n}`,
    type: "user",
    text,
    ...(files ? { files } : {}),
    ...(metadata ? { metadata } : {}),
    time: time(n),
  })
}

/** A completed tool call part of an assistant message. */
export const toolCall = ({ name, content }) => {
  const n = next()
  return {
    type: "tool",
    id: `call_${n}`,
    name,
    state: { status: "completed", input: {}, content },
    time: time(n),
  }
}

/** A failed tool call part that still carries content. */
export const failedToolCall = ({ name, content }) => {
  const n = next()
  return {
    type: "tool",
    id: `call_${n}`,
    name,
    state: {
      status: "error",
      input: {},
      error: { type: "tool", message: "failed" },
      content,
    },
    time: time(n),
  }
}

/** The stored result of a `read` call on an image file. */
export const readImage = (path = "/tmp/shot.png") =>
  toolCall({
    name: "read",
    content: [
      { type: "text", text: "Image read successfully" },
      { type: "file", uri: PNG_DATA_URL, mime: "image/png", name: path },
    ],
  })

export const bashCall = () => toolCall({ name: "bash", content: [{ type: "text", text: "ok" }] })

export const assistant = ({ content = [], finish = "stop", model = TEXT_MODEL } = {}) => {
  const n = next()
  return stored({
    id: `msg_assistant_${n}`,
    type: "assistant",
    agent: "build",
    model,
    content,
    finish,
    time: time(n),
  })
}

/** The marker OpenCode appends when a turn succeeds, fails or is interrupted. */
export const idle = (outcome = "succeeded") => {
  const n = next()
  return stored({ id: `msg_idle_${n}`, type: "idle", outcome, time: time(n) })
}

export const synthetic = (text = "A background job finished.") => {
  const n = next()
  return stored({ id: `msg_synthetic_${n}`, type: "synthetic", text, time: time(n) })
}

/**
 * The synthetic message of a Code Mode job that ran in the background
 * (OpenCode 2.3.2, packages/core/src/codemode/job.ts, `notice`). The job saves
 * its files and lists their paths after the script output.
 */
export const codemodeNotice = ({ paths = [], output = "done", state = "completed" } = {}) => {
  const n = next()
  const id = `job_${n}`
  const body = [output, ...paths].join("\n")
  return stored({
    id: `msg_synthetic_${n}`,
    type: "synthetic",
    description: "Code Mode script",
    text: `<codemode id="${id}" state="${state}">\n${body}\n</codemode>`,
    metadata: { source: "codemode", jobID: id, state },
    time: time(n),
  })
}

/** An encoded model list entry, after the OpenCode schema accepts it. */
export const modelInfo = (providerID, id, variants = []) =>
  encodeModel({
    ...Model.Info.default(providerID, id),
    variants: variants.map((variant) => ({ id: variant })),
  })
