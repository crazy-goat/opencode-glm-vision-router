import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import plugin, { DEFAULTS } from "../src/index.js"
import {
  PNG_DATA_URL,
  TEXT_MODEL,
  assistant,
  bashCall,
  idle,
  imageFile,
  modelInfo,
  readImage,
  user,
} from "./fixtures.js"

const VISION = modelInfo("opencode-go", "glm-5.3-flash", ["low", "high", "max"])

/**
 * Runs the plugin setup against a fake OpenCode context. `messages` is what
 * `ctx.session.context()` returns; `models` is the model list.
 */
async function harness({
  options = {},
  messages = [],
  models = [VISION],
  contextError,
  listError,
} = {}) {
  const hooks = {}
  const calls = { context: [], list: 0 }
  const registration = { dispose: async () => {} }
  const ctx = {
    options,
    session: {
      hook: async (name, callback) => {
        hooks[name] = callback
        return registration
      },
      context: async (input) => {
        calls.context.push(input)
        if (contextError) throw contextError
        return messages
      },
    },
    model: {
      list: async () => {
        calls.list += 1
        if (listError) throw listError
        return { location: { directory: "/tmp/project" }, data: models }
      },
    },
    tool: {
      hook: async (name, callback) => {
        hooks[`tool:${name}`] = callback
        return registration
      },
    },
  }
  await plugin.setup(ctx)
  const resolve = async (model = { ...TEXT_MODEL, variant: "high" }, kind = "primary") => {
    const event = { sessionID: "ses_1", agent: "build", kind, model: { ...model } }
    await hooks["experimental.model.resolve"](event)
    return event.model
  }
  return { hooks, calls, resolve }
}

const FLASH_HIGH = { providerID: "opencode-go", id: "glm-5.3-flash", variant: "high" }
const TEXT_HIGH = { ...TEXT_MODEL, variant: "high" }

let warn
beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

describe("defaults", () => {
  test("target OpenCode Go and register no screenshot tool", () => {
    expect(DEFAULTS).toEqual({
      provider: "opencode-go",
      text: "glm-5.3",
      vision: "glm-5.3-flash",
      rescue: true,
      screenshotTools: [],
    })
  })
})

describe("experimental.model.resolve", () => {
  test("routes an image turn to the vision model and keeps the variant", async () => {
    const { resolve, calls } = await harness({ messages: [user({ files: [imageFile()] })] })
    expect(await resolve()).toEqual(FLASH_HIGH)
    expect(calls.context).toEqual([{ sessionID: "ses_1" }])
  })

  test("keeps the text model for a text-only turn", async () => {
    const { resolve, calls } = await harness({ messages: [user()] })
    expect(await resolve()).toEqual(TEXT_HIGH)
    expect(calls.list).toBe(0)
  })

  test("returns to the text model in the turn after an image turn", async () => {
    const messages = [user({ files: [imageFile()] }), assistant(), idle(), user({ text: "thanks" })]
    const { resolve } = await harness({ messages })
    expect(await resolve()).toEqual(TEXT_HIGH)
  })

  test("keeps the vision model when a text prompt joins the running image turn", async () => {
    const messages = [
      user({ files: [imageFile()] }),
      assistant({ content: [bashCall()], finish: "tool-calls" }),
      user({ text: "also check the logs" }),
    ]
    const { resolve } = await harness({ messages })
    expect(await resolve()).toEqual(FLASH_HIGH)
  })

  test("returns to the text model after an interrupted image turn", async () => {
    const messages = [user({ files: [imageFile()] }), idle("interrupted"), user({ text: "go on" })]
    const { resolve } = await harness({ messages })
    expect(await resolve()).toEqual(TEXT_HIGH)
  })

  test("routes the step after a tool result with an image", async () => {
    const messages = [
      user({ text: "read shot.png" }),
      assistant({ content: [readImage()], finish: "tool-calls" }),
    ]
    const { resolve } = await harness({ messages })
    expect(await resolve()).toEqual(FLASH_HIGH)
  })

  test("ignores tool result images when rescue is false", async () => {
    const messages = [
      user({ text: "read shot.png" }),
      assistant({ content: [readImage()], finish: "tool-calls" }),
    ]
    const { resolve } = await harness({ options: { rescue: false }, messages })
    expect(await resolve()).toEqual(TEXT_HIGH)
  })

  test("routes a desktop path attachment", async () => {
    const attachments = [{ name: "shot.png", mime: "image/png", path: "/tmp/shot.png" }]
    const { resolve } = await harness({ messages: [user({ metadata: { attachments } })] })
    expect(await resolve()).toEqual(FLASH_HIGH)
  })

  test("does not read the session for another provider with the same model id", async () => {
    const other = { providerID: "zai", id: "glm-5.3", variant: "high" }
    const { resolve, calls } = await harness({ messages: [user({ files: [imageFile()] })] })
    expect(await resolve(other)).toEqual(other)
    expect(calls.context).toEqual([])
  })

  test("does not read the session for auxiliary requests", async () => {
    const { resolve, calls } = await harness({ messages: [user({ files: [imageFile()] })] })
    for (const kind of ["title", "compaction", "generate"]) {
      expect(await resolve(TEXT_HIGH, kind)).toEqual(TEXT_HIGH)
    }
    expect(calls.context).toEqual([])
  })

  test("keeps the text model and warns once when the vision model is not in the list", async () => {
    const { resolve } = await harness({
      messages: [user({ files: [imageFile()] })],
      models: [modelInfo("opencode-go", "glm-5.3")],
    })
    expect(await resolve()).toEqual(TEXT_HIGH)
    expect(await resolve()).toEqual(TEXT_HIGH)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain("opencode-go/glm-5.3-flash")
  })

  test("drops a variant that the vision model does not define", async () => {
    const { resolve } = await harness({
      messages: [user({ files: [imageFile()] })],
      models: [modelInfo("opencode-go", "glm-5.3-flash", ["low"])],
    })
    expect(await resolve()).toEqual({ providerID: "opencode-go", id: "glm-5.3-flash" })
  })

  test("drops a variant that the variants option does not allow", async () => {
    const { resolve } = await harness({
      options: { variants: ["low"] },
      messages: [user({ files: [imageFile()] })],
    })
    expect(await resolve()).toEqual({ providerID: "opencode-go", id: "glm-5.3-flash" })
    expect(await resolve({ ...TEXT_MODEL, variant: "low" })).toEqual({
      providerID: "opencode-go",
      id: "glm-5.3-flash",
      variant: "low",
    })
  })

  test("uses the configured provider and models", async () => {
    const { resolve } = await harness({
      options: { provider: "zai", text: "glm-text", vision: "glm-vision" },
      messages: [user({ files: [imageFile()] })],
      models: [modelInfo("zai", "glm-vision", ["high"])],
    })
    expect(await resolve({ providerID: "zai", id: "glm-text", variant: "high" })).toEqual({
      providerID: "zai",
      id: "glm-vision",
      variant: "high",
    })
    expect(await resolve()).toEqual(TEXT_HIGH)
  })

  test("keeps the selected model when the session read fails", async () => {
    const { resolve } = await harness({ contextError: new Error("decode failed") })
    expect(await resolve()).toEqual(TEXT_HIGH)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test("keeps the selected model when the model list fails", async () => {
    const { resolve } = await harness({
      messages: [user({ files: [imageFile()] })],
      listError: new Error("catalog failed"),
    })
    expect(await resolve()).toEqual(TEXT_HIGH)
  })
})

describe("execute.after", () => {
  const fileOnly = (tool = "capture_screen") => ({
    tool,
    sessionID: "ses_1",
    agent: "build",
    messageID: "msg_1",
    id: "call_1",
    input: {},
    status: "completed",
    result: {
      output: { path: "/tmp/screen.png" },
      content: [{ type: "text", text: '{"path":"/tmp/screen.png"}' }],
    },
  })

  test("is not registered by default", async () => {
    const { hooks } = await harness()
    expect(hooks["tool:execute.after"]).toBeUndefined()
  })

  test("is not registered when rescue is false", async () => {
    const { hooks } = await harness({
      options: { rescue: false, screenshotTools: ["capture_screen"] },
    })
    expect(hooks["tool:execute.after"]).toBeUndefined()
  })

  test("adds a read instruction to a file-only screenshot result", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([
      { type: "text", text: '{"path":"/tmp/screen.png"}' },
      {
        type: "text",
        text: "Screenshot saved to: /tmp/screen.png. Read the file to view the image.",
      },
    ])
    expect(event.result.output).toEqual({ path: "/tmp/screen.png" })
  })

  test("keeps a string content when it adds the read instruction", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    event.result.content = "Saved /tmp/screen.png (1280x720)"
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([
      { type: "text", text: "Saved /tmp/screen.png (1280x720)" },
      {
        type: "text",
        text: "Screenshot saved to: /tmp/screen.png. Read the file to view the image.",
      },
    ])
  })

  test("uses the output as text when the result has no content", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    delete event.result.content
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([
      { type: "text", text: '{"path":"/tmp/screen.png"}' },
      {
        type: "text",
        text: "Screenshot saved to: /tmp/screen.png. Read the file to view the image.",
      },
    ])
  })

  test("adds a read instruction for an MCP resource_link file URI", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    event.result = {
      output: "file:///tmp/screen%20one.png",
      content: [{ type: "text", text: "file:///tmp/screen%20one.png" }],
    }
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([
      { type: "text", text: "file:///tmp/screen%20one.png" },
      {
        type: "text",
        text: "Screenshot saved to: /tmp/screen one.png. Read the file to view the image.",
      },
    ])
  })

  test("ignores plain text that only mentions a file URI", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    event.result = { output: "Saved to file:///tmp/screen.png", content: [] }
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([])
  })

  test("leaves a screenshot with an inline image unchanged", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const event = fileOnly()
    event.result.content = [{ type: "file", uri: PNG_DATA_URL, mime: "image/png" }]
    await hooks["tool:execute.after"](event)
    expect(event.result.content).toEqual([{ type: "file", uri: PNG_DATA_URL, mime: "image/png" }])
  })

  test("leaves other tools and failed calls unchanged", async () => {
    const { hooks } = await harness({ options: { screenshotTools: ["capture_screen"] } })
    const other = fileOnly("bash")
    await hooks["tool:execute.after"](other)
    expect(other.result.content).toHaveLength(1)
    const failed = { ...fileOnly(), status: "error", error: new Error("x") }
    delete failed.result
    await hooks["tool:execute.after"](failed)
    expect(failed.result).toBeUndefined()
  })
})
