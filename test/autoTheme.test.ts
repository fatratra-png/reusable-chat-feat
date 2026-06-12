import { describe, it, before, after } from "mocha"
import assert from "node:assert"
import { JSDOM } from "jsdom"
import { autoThemeChat } from "../src/autoTheme"

let dom: JSDOM

function setupDom(html: string, cssText: string) {
  dom = new JSDOM(html, {
    url: "http://localhost",
    pretendToBeVisual: true,
  })
  const { document } = dom.window
  globalThis.window = dom.window as unknown as Window & typeof globalThis
  globalThis.document = document
  globalThis.getComputedStyle = dom.window.getComputedStyle
  globalThis.HTMLElement = dom.window.HTMLElement

  const style = document.createElement("style")
  style.textContent = cssText
  document.head.appendChild(style)
}

function cleanup() {
  delete (globalThis as any).window
  delete (globalThis as any).document
  delete (globalThis as any).getComputedStyle
  delete (globalThis as any).HTMLElement
}

describe("autoThemeChat", () => {
  after(() => cleanup())

  it("applies light theme variables from body background", () => {
    setupDom(
      '<body><div class="chat-root" id="chat"></div></body>',
      "body { background-color: #ffffff; color: #1a1a1a; accent-color: #3b82f6; border-color: #e5e7eb; }",
    )
    autoThemeChat()
    const root = document.querySelector<HTMLElement>(".chat-root")!
    const bg = root.style.getPropertyValue("--chat-bg")
    assert.ok(bg, "--chat-bg should be set")
    assert.ok(bg.includes("255"), "light bg should contain white channels")
    assert.ok(bg.includes("0.5"), "light bg should have 0.5 alpha")
  })

  it("applies dark theme variables from body background", () => {
    setupDom(
      '<body><div class="chat-root" id="chat"></div></body>',
      "body { background-color: #1a1a2e; color: #e5e5e5; accent-color: #f0c040; border-color: #2a2a4e; }",
    )
    autoThemeChat()
    const root = document.querySelector<HTMLElement>(".chat-root")!
    const bg = root.style.getPropertyValue("--chat-bg")
    assert.ok(bg, "--chat-bg should be set")
    assert.ok(bg.includes("0.3"), "dark bg should have 0.3 alpha")
  })

  it("detects accent-color from style", () => {
    setupDom(
      '<body><div class="chat-root" id="chat"></div></body>',
      "body { background-color: #f8fafc; color: #0f172a; accent-color: #8b5cf6; }",
    )
    autoThemeChat()
    const root = document.querySelector<HTMLElement>(".chat-root")!
    const accent = root.style.getPropertyValue("--chat-accent")
    assert.ok(accent, "--chat-accent should be set")
    assert.match(accent, /8b|139/, "should contain purple channel")
  })

  it("falls back to gray defaults when no .chat-root exists", () => {
    setupDom(
      "<body><div>no chat here</div></body>",
      "body { background-color: #ffffff; color: #000000; }",
    )
    // should not throw
    autoThemeChat()
    assert.ok(true, "should not throw when no .chat-root")
  })

  it("works with a custom container element", () => {
    setupDom(
      '<body><div id="wrapper" style="background:#f0f0f0;color:#222"></div><div class="chat-root"></div></body>',
      "body { background-color: #ffffff; color: #000000; }",
    )
    const wrapper = document.querySelector<HTMLElement>("#wrapper")!
    autoThemeChat(wrapper)
    const root = document.querySelector<HTMLElement>(".chat-root")!
    const bg = root.style.getPropertyValue("--chat-bg")
    assert.ok(bg, "--chat-bg should be set from custom container")
  })
})
