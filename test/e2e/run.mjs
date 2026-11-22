/**
 * Optional end-to-end harness. It is not a unit test, so `bun test` does not
 * load it. Run it with `bash bin/e2e.sh`.
 *
 * The harness starts a mock OpenAI-compatible provider and an isolated
 * `opencode serve` that loads this plugin. It sends prompts through the HTTP
 * API and checks which model each provider request uses.
 *
 * The child process gets a fresh HOME, TMPDIR and XDG_* directories and an
 * explicit environment. It never reads your user config, sessions or quota.
 * System and MDM-managed OpenCode config still applies.
 * Set E2E_DEBUG=1 to print the server log.
 */
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const PROVIDER = "mock"
const TEXT = "glm-5.3"
const VISION = "glm-5.3-flash"
const TIMEOUT_MS = 30_000
const QUIET_MS = 1000

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64")

function findBinary() {
  const explicit = process.env.OPENCODE_BIN
  if (explicit) {
    // An explicit path that does not work is an error, not a reason to skip.
    try {
      accessSync(explicit, constants.X_OK)
    } catch {
      throw new Error("OPENCODE_BIN is not an executable file: " + explicit)
    }
    return explicit
  }
  const candidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => join(dir, "opencode"))
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

/** The text of a chat message content: a string or a list of parts. */
function partsOf(content) {
  return typeof content === "string" ? [{ type: "text", text: content }] : (content ?? [])
}
const textOf = (message) =>
  partsOf(message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
const hasImage = (messages) =>
  messages.some((message) => partsOf(message.content).some((part) => part.type === "image_url"))

/**
 * A mock OpenAI-compatible chat completions server. The last user text picks
 * the reply: "[read:<path>]" calls the read tool once, "[hold]" waits until
 * release() runs, and any other text gets a short answer. A request without
 * tools is an auxiliary request, such as a title.
 */
function startMock() {
  const requests = []
  let gate
  let held = Promise.withResolvers()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url)
      if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions"))
        return new Response("not found", { status: 404 })
      const body = await request.json()
      const messages = body.messages ?? []
      const lastUser = messages.findLast(
        (message) => message.role === "user" && textOf(message).trim(),
      )
      const lastText = lastUser ? textOf(lastUser) : ""
      const afterUser = lastUser ? messages.slice(messages.lastIndexOf(lastUser) + 1) : []
      const entry = {
        n: requests.length,
        model: body.model,
        aux: !body.tools || body.tools.length === 0,
        image: hasImage(messages),
        text: lastText,
      }
      requests.push(entry)
      let reply = { content: "ok" }
      if (entry.aux) reply = { content: "E2E title" }
      else if (afterUser.some((message) => message.role === "tool")) reply = { content: "done" }
      else if (lastText.includes("[hold]")) {
        gate = Promise.withResolvers()
        held.resolve()
        await gate.promise
        reply = { content: "held done" }
      } else {
        const read = /\[read:([^\]]+)\]/.exec(lastText)
        if (read)
          reply = {
            tool: {
              id: "call_e2e_read",
              name: "read",
              arguments: JSON.stringify({ path: read[1] }),
            },
          }
      }
      return sse(body.model, reply)
    },
  })
  return {
    url: "http://127.0.0.1:" + server.port,
    requests,
    /** Resolves when a request waits on the gate. */
    waitHeld: () => held.promise,
    release() {
      held = Promise.withResolvers()
      gate?.resolve()
    },
    stop: () => server.stop(true),
  }
}

function sse(model, reply) {
  const chunk = (delta, finish, extra) =>
    "data: " +
    JSON.stringify({
      id: "chatcmpl-e2e",
      object: "chat.completion.chunk",
      created: 0,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...extra,
    }) +
    "\n\n"
  const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  const parts = reply.tool
    ? [
        chunk({ role: "assistant", content: null }, null),
        chunk(
          {
            tool_calls: [
              {
                index: 0,
                id: reply.tool.id,
                type: "function",
                function: { name: reply.tool.name, arguments: reply.tool.arguments },
              },
            ],
          },
          null,
        ),
        chunk({}, "tool_calls", { usage }),
      ]
    : [chunk({ role: "assistant", content: reply.content }, null), chunk({}, "stop", { usage })]
  return new Response(parts.join("") + "data: [DONE]\n\n", {
    headers: { "content-type": "text/event-stream" },
  })
}

function config(mockURL) {
  const model = (input) => ({
    capabilities: { tools: true, input, output: ["text"] },
    limit: { context: 128_000, output: 8_000 },
  })
  return {
    providers: {
      [PROVIDER]: {
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: mockURL + "/v1", apiKey: "e2e-key" },
        models: { [TEXT]: model(["text"]), [VISION]: model(["text", "image"]) },
      },
    },
    model: { providerID: PROVIDER, model: TEXT },
    plugins: [{ package: ROOT, options: { provider: PROVIDER, text: TEXT, vision: VISION } }],
  }
}

function startServer(bin, env, cwd) {
  const child = spawn(
    bin,
    [
      "serve",
      // Warnings must reach the log without E2E_DEBUG, so the harness can find plugin load errors.
      "--print-logs",
      "--log-level",
      process.env.E2E_DEBUG ? "debug" : "warn",
      "--hostname",
      "127.0.0.1",
      "--port",
      "0",
    ],
    {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const log = []
  const url = new Promise((resolveURL, reject) => {
    const onData = (data) => {
      log.push(String(data))
      const match = /server listening on (\S+)/.exec(log.join(""))
      if (match) resolveURL(match[1])
    }
    child.stdout.on("data", onData)
    child.stderr.on("data", onData)
    child.on("exit", (code) => reject(new Error("opencode serve exited with code " + code)))
  })
  return { child, url, log }
}

// Texts that OpenCode 2.3.2 logs when it does not load a plugin or ignores its config.
const PLUGIN_LOAD_PROBLEM =
  /failed to load plugin|configured plugin path must be a directory|path=\$\.plugins\b[^\n]*malformed/i

/** The log lines that show a plugin did not load. */
function pluginLoadProblems(log) {
  return log
    .join("")
    .split("\n")
    .filter((line) => PLUGIN_LOAD_PROBLEM.test(line))
}

async function main() {
  let bin
  try {
    bin = findBinary()
  } catch (error) {
    console.error(error.message)
    return 1
  }
  if (!bin) {
    console.log("skipped: no opencode binary (set OPENCODE_BIN or add opencode to PATH)")
    return 0
  }

  const base = realpathSync(mkdtempSync(join(tmpdir(), "glm-vision-e2e-")))
  const dir = (...parts) => {
    const path = join(base, ...parts)
    mkdirSync(path, { recursive: true })
    return path
  }
  const home = dir("home")
  const project = dir("project")
  const temp = dir("tmp")
  const password = randomBytes(24).toString("hex")
  const mock = startMock()
  let server
  let serverLog = ""
  const checks = []
  const check = (name, pass, detail) =>
    checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) })

  try {
    const env = {
      PATH: [dirname(bin), "/usr/bin", "/bin"].join(delimiter),
      HOME: home,
      TMPDIR: temp,
      XDG_CONFIG_HOME: dir("xdg", "config"),
      XDG_DATA_HOME: dir("xdg", "data"),
      XDG_CACHE_HOME: dir("xdg", "cache"),
      XDG_STATE_HOME: dir("xdg", "state"),
      XDG_RUNTIME_DIR: dir("xdg", "runtime"),
      OPENCODE_CONFIG_DIR: dir("config"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config(mock.url)),
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_FILEWATCHER: "1",
      OPENCODE_SERVER_PASSWORD: password,
    }
    writeFileSync(join(project, "shot.png"), PNG_BYTES)

    server = startServer(bin, env, project)
    const baseURL = await withTimeout(server.url, "opencode serve did not start")
    const auth = "Basic " + Buffer.from("opencode:" + password).toString("base64")
    const api = async (method, path, body) => {
      const response = await fetch(baseURL + path, {
        method,
        headers: { authorization: auth, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = await response.text()
      if (!response.ok)
        throw new Error(method + " " + path + " failed with " + response.status + ": " + text)
      return text ? JSON.parse(text) : undefined
    }
    const newSession = async () =>
      (
        await api("POST", "/api/session", {
          location: { directory: project },
          model: { providerID: PROVIDER, id: TEXT },
        })
      ).data.id
    const prompt = (id, body) => api("POST", "/api/session/" + id + "/prompt", body)
    const context = async (id) => (await api("GET", "/api/session/" + id + "/context")).data
    const idles = (rows) => rows.filter((row) => row.type === "idle")
    const waitIdle = async (id, count) => {
      const deadline = Date.now() + TIMEOUT_MS
      while (Date.now() < deadline) {
        const rows = await context(id)
        if (idles(rows).length >= count) return rows
        await sleep(100)
      }
      throw new Error("session " + id + " did not reach idle marker " + count)
    }
    // Waits for the idle marker, then for a quiet period without a new mock request
    // or a new idle row, so that a late second turn shows in the count.
    const waitSettled = async (id, count) => {
      let rows = await waitIdle(id, count)
      const deadline = Date.now() + TIMEOUT_MS
      let seen = { requests: mock.requests.length, idles: idles(rows).length }
      let quietSince = Date.now()
      while (Date.now() - quietSince < QUIET_MS) {
        if (Date.now() > deadline) throw new Error("session " + id + " did not settle")
        await sleep(100)
        rows = await context(id)
        const now = { requests: mock.requests.length, idles: idles(rows).length }
        if (now.requests !== seen.requests || now.idles !== seen.idles) {
          seen = now
          quietSince = Date.now()
        }
      }
      return rows
    }
    const since = (start) => mock.requests.slice(start)
    const primary = (list) => list.filter((request) => !request.aux)
    const models = (list) => list.map((request) => request.model)
    const image = { uri: "data:image/png;base64," + PNG_BASE64, name: "shot.png" }

    // Session 1: scenarios A, B and C.
    const one = await newSession()
    let start = mock.requests.length
    await prompt(one, { text: "describe the image", files: [image] })
    await waitIdle(one, 1)
    let list = primary(since(start))
    check("A image upload uses the vision model", models(list).join() === VISION, models(list))
    check("A the vision request carries the image", list[0]?.image, list)

    start = mock.requests.length
    await prompt(one, { text: "plain text question" })
    await waitIdle(one, 2)
    list = primary(since(start))
    check("B next text turn uses the text model", models(list).join() === TEXT, models(list))
    check(
      "B the text request carries no image",
      list.every((request) => !request.image),
      list,
    )

    start = mock.requests.length
    await prompt(one, { text: "[read:" + join(project, "shot.png") + "] read it" })
    await waitIdle(one, 3)
    list = primary(since(start))
    check(
      "C image read: step 1 on the text model, step 2 on the vision model",
      models(list).join() === TEXT + "," + VISION,
      models(list),
    )
    check("C step 2 carries the image", list[1]?.image && !list[0]?.image, list)

    // Session 2: scenarios D and E.
    const two = await newSession()
    start = mock.requests.length
    await prompt(two, { text: "[hold] describe the image", files: [image] })
    await withTimeout(mock.waitHeld(), "the held request did not arrive")
    await prompt(two, { text: "steered text", delivery: "steer" })
    mock.release()
    let rows = await waitSettled(two, 1)
    list = primary(since(start))
    check(
      "D steered prompt stays on the vision model",
      list.length === 2 && models(list).every((model) => model === VISION),
      models(list),
    )
    check("D the steered request is the second request", list[1]?.text === "steered text", list)
    check("D the turn has one idle row", idles(rows).length === 1, idles(rows).length)

    start = mock.requests.length
    await prompt(two, { text: "plain text after steer" })
    await waitIdle(two, 2)
    list = primary(since(start))
    check("E next turn uses the text model", models(list).join() === TEXT, models(list))

    // Session 3: scenario F. A queued prompt runs before the idle marker.
    const three = await newSession()
    start = mock.requests.length
    await prompt(three, { text: "[hold] describe the image", files: [image] })
    await withTimeout(mock.waitHeld(), "the held request did not arrive")
    await prompt(three, { text: "queued text", delivery: "queue" })
    mock.release()
    rows = await waitSettled(three, 1)
    list = primary(since(start))
    check(
      "F queued prompt stays on the vision model (known limitation)",
      list.length === 2 && models(list).every((model) => model === VISION),
      models(list),
    )
    check("F the queued request is the second request", list[1]?.text === "queued text", list)
    check(
      "F the queued turn has one idle row (known limitation)",
      idles(rows).length === 1,
      idles(rows).length,
    )

    const runProblems = pluginLoadProblems(server.log)
    check("the server log shows no plugin load problem", runProblems.length === 0, runProblems)

    // Auxiliary requests, such as titles, stay on the text model.
    const aux = mock.requests.filter((request) => request.aux)
    check(
      "auxiliary requests stay on the text model",
      aux.length > 0 && aux.every((request) => request.model === TEXT),
      aux,
    )

    const assistant = (await context(one)).filter((row) => row.type === "assistant")
    check(
      "the assistant rows record the model that answered",
      assistant.map((row) => row.model.id).join() === [VISION, TEXT, TEXT, VISION].join(),
      assistant.map((row) => row.model),
    )
  } catch (error) {
    check("harness ran to the end", false, String(error?.stack ?? error))
    if (server) console.error(server.log.join("").split("\n").slice(-40).join("\n"))
  } finally {
    serverLog = server?.log.join("") ?? ""
    server?.child.kill("SIGKILL")
    mock.stop()
    rmSync(base, { recursive: true, force: true })
  }

  if (process.env.E2E_DEBUG) console.error(serverLog)
  const failed = checks.filter((item) => !item.pass)
  console.log(
    JSON.stringify(
      { binary: bin, passed: checks.length - failed.length, failed: failed.length, checks },
      null,
      2,
    ),
  )
  return failed.length === 0 ? 0 : 1
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const withTimeout = (promise, message) =>
  Promise.race([promise, sleep(TIMEOUT_MS).then(() => Promise.reject(new Error(message)))])

process.exit(await main())
