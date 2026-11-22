import { describe, expect, test } from "bun:test"
import {
  attachmentIsImage,
  attachmentsOf,
  fileIsImage,
  partIsImage,
  partsOf,
  readTargetIsImage,
  rescueContent,
  rescueEnabled,
  resolveModel,
  toolResultHasImage,
  userTurnHasImage,
} from "../src/detect.js"

const selected = { providerID: "opencode-go", id: "glm-5.3" }

const input = (overrides = {}) => ({
  model: { ...selected },
  kind: "primary",
  provider: "opencode-go",
  textModel: "glm-5.3",
  visionModel: "glm-5.3-flash",
  sharedVariants: new Set(["low", "high", "max"]),
  hasImage: false,
  ...overrides,
})

describe("resolveModel", () => {
  test("keeps the selected model for a text-only turn", () => {
    expect(resolveModel(input())).toEqual(selected)
  })

  test("switches to the vision model for an image turn", () => {
    expect(resolveModel(input({ hasImage: true }))).toEqual({
      providerID: "opencode-go",
      id: "glm-5.3-flash",
    })
  })

  test("keeps a variant shared by both models", () => {
    expect(resolveModel(input({ hasImage: true, model: { ...selected, variant: "low" } }))).toEqual(
      { providerID: "opencode-go", id: "glm-5.3-flash", variant: "low" },
    )
  })

  test("drops a variant the vision model does not offer", () => {
    expect(
      resolveModel(input({ hasImage: true, model: { ...selected, variant: "medium" } })),
    ).toEqual({ providerID: "opencode-go", id: "glm-5.3-flash" })
  })

  test("skips auxiliary requests", () => {
    expect(resolveModel(input({ hasImage: true, kind: "title" }))).toEqual(selected)
  })

  test("skips another provider", () => {
    expect(
      resolveModel(
        input({ hasImage: true, model: { providerID: "other-provider", id: "glm-5.3" } }),
      ),
    ).toEqual({ providerID: "other-provider", id: "glm-5.3" })
  })

  test("skips another model from the same provider", () => {
    expect(
      resolveModel(
        input({ hasImage: true, model: { providerID: "opencode-go", id: "glm-5.3-flash" } }),
      ),
    ).toEqual({ providerID: "opencode-go", id: "glm-5.3-flash" })
  })
})

describe("fileIsImage", () => {
  test("accepts an attached PNG path", () => {
    expect(fileIsImage({ uri: "file:///tmp/shot.png", name: "shot.png" })).toBe(true)
  })

  test("accepts an inline data URL without a name", () => {
    expect(fileIsImage({ uri: "data:image/png;base64,AAAA" })).toBe(true)
  })

  test("rejects a text file", () => {
    expect(fileIsImage({ uri: "file:///tmp/notes.txt", name: "notes.txt" })).toBe(false)
  })

  test("rejects an empty attachment", () => {
    expect(fileIsImage(undefined)).toBe(false)
  })

  test("accepts an attachment that carries only a path", () => {
    expect(fileIsImage({ path: "/tmp/uploads/image.png" })).toBe(true)
  })
})

describe("attachmentIsImage", () => {
  test("accepts a client attachment with an image MIME type", () => {
    expect(
      attachmentIsImage({
        name: "image.png",
        mime: "image/png",
        path: "/tmp/uploads/image.png",
      }),
    ).toBe(true)
  })

  test("accepts an attachment with an image name and no MIME type", () => {
    expect(attachmentIsImage({ name: "photo.jpg", path: "/tmp/photo.jpg" })).toBe(true)
  })

  test("rejects a text attachment", () => {
    expect(
      attachmentIsImage({ name: "notes.txt", mime: "text/plain", path: "/tmp/notes.txt" }),
    ).toBe(false)
  })

  test("rejects an empty attachment", () => {
    expect(attachmentIsImage(undefined)).toBe(false)
  })
})

describe("attachmentsOf", () => {
  test("reads admission metadata of a prompt event", () => {
    expect(attachmentsOf({ metadata: { attachments: [{ name: "image.png" }] } })).toEqual([
      { name: "image.png" },
    ])
  })

  test("reads a top-level attachments field", () => {
    expect(attachmentsOf({ attachments: [{ name: "image.png" }] })).toEqual([{ name: "image.png" }])
  })

  test("returns an empty array without attachments", () => {
    expect(attachmentsOf(undefined)).toEqual([])
    expect(attachmentsOf({})).toEqual([])
  })
})

describe("partIsImage", () => {
  test("accepts an image part", () => {
    expect(partIsImage({ type: "image" })).toBe(true)
  })

  test("accepts a file part with an image MIME type", () => {
    expect(partIsImage({ type: "file", mime: "image/jpeg" })).toBe(true)
  })

  test("accepts a data URL part", () => {
    expect(partIsImage({ type: "file", uri: "data:image/webp;base64,AAAA" })).toBe(true)
  })

  test("rejects a text part", () => {
    expect(partIsImage({ type: "text", text: "hello" })).toBe(false)
  })
})

describe("partsOf", () => {
  test("reads a content array", () => {
    expect(partsOf({ content: [{ type: "text" }] })).toEqual([{ type: "text" }])
  })

  test("returns an empty array for a string content", () => {
    expect(partsOf({ content: "hello" })).toEqual([])
  })
})

describe("toolResultHasImage", () => {
  test("detects an image returned by a tool in the current turn", () => {
    const messages = [
      { role: "user", content: [{ type: "text" }] },
      { role: "tool", content: [{ type: "image" }] },
    ]
    expect(toolResultHasImage(messages)).toBe(true)
  })

  test("ignores an image in an older user turn", () => {
    const messages = [
      { role: "user", content: [{ type: "image" }] },
      { role: "assistant", content: [{ type: "text" }] },
      { role: "user", content: [{ type: "text" }] },
      { role: "tool", content: [{ type: "text" }] },
    ]
    expect(toolResultHasImage(messages)).toBe(false)
  })

  test("returns false without images", () => {
    expect(toolResultHasImage([{ role: "user", content: [{ type: "text" }] }])).toBe(false)
  })
})

describe("readTargetIsImage", () => {
  test("accepts a PNG path", () => {
    expect(readTargetIsImage({ path: "/tmp/shot.png" })).toBe(true)
  })

  test("accepts a JPEG path with uppercase extension", () => {
    expect(readTargetIsImage({ path: "/tmp/PHOTO.JPG" })).toBe(true)
  })

  test("accepts a data URL", () => {
    expect(readTargetIsImage({ path: "data:image/png;base64,AAAA" })).toBe(true)
  })

  test("rejects a text file", () => {
    expect(readTargetIsImage({ path: "/tmp/notes.txt" })).toBe(false)
  })

  test("rejects an empty input", () => {
    expect(readTargetIsImage(undefined)).toBe(false)
  })
})

describe("rescueContent", () => {
  test("names the path and the vision model", () => {
    const text = rescueContent("/tmp/shot.png", "glm-5.3-flash")
    expect(text).toContain("/tmp/shot.png")
    expect(text).toContain("glm-5.3-flash")
    expect(text).toContain("Read the file again")
  })
})

describe("rescueEnabled", () => {
  test("is on by default", () => {
    expect(rescueEnabled(undefined)).toBe(true)
  })

  test("is on when true", () => {
    expect(rescueEnabled(true)).toBe(true)
  })

  test("is off only when explicitly false", () => {
    expect(rescueEnabled(false)).toBe(false)
  })

  test("is on for any other value", () => {
    expect(rescueEnabled("no")).toBe(true)
  })
})

describe("userTurnHasImage", () => {
  test("detects an attachment of the current user turn", () => {
    const messages = [
      {
        role: "user",
        metadata: {
          attachments: [
            {
              name: "image.png",
              mime: "image/png",
              path: "/tmp/uploads/image.png",
            },
          ],
        },
      },
    ]
    expect(userTurnHasImage(messages)).toBe(true)
  })

  test("detects an image part of the current user turn", () => {
    const messages = [{ role: "user", content: [{ type: "image" }] }]
    expect(userTurnHasImage(messages)).toBe(true)
  })

  test("ignores an image attached in an older turn", () => {
    const messages = [
      { role: "user", metadata: { attachments: [{ name: "image.png", mime: "image/png" }] } },
      { role: "assistant", content: [{ type: "text" }] },
      { role: "user", content: [{ type: "text" }] },
    ]
    expect(userTurnHasImage(messages)).toBe(false)
  })

  test("returns false without a user message", () => {
    expect(userTurnHasImage([])).toBe(false)
  })
})
