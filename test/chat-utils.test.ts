import { describe, it } from "mocha"
import assert from "node:assert"
import {
  isSameDay,
  getDayDiff,
  formatTime,
  formatDateLabel,
  isFileMessage,
  parseFileContent,
  shouldGroup,
  GROUP_GAP,
  SECOND,
  MINUTE,
  HOUR,
  DAY,
} from "../src/components/chat/chat-utils"
import type { Message } from "../src/types"

describe("chat-utils — constants", () => {
  it("SECOND = 1000", () => {
    assert.strictEqual(SECOND, 1000)
  })

  it("MINUTE = 60 * SECOND", () => {
    assert.strictEqual(MINUTE, 60 * 1000)
  })

  it("HOUR = 60 * MINUTE", () => {
    assert.strictEqual(HOUR, 60 * 60 * 1000)
  })

  it("DAY = 24 * HOUR", () => {
    assert.strictEqual(DAY, 24 * 60 * 60 * 1000)
  })

  it("GROUP_GAP = 5 minutes", () => {
    assert.strictEqual(GROUP_GAP, 5 * 60 * 1000)
  })
})

describe("chat-utils — isSameDay", () => {
  it("returns true for same date", () => {
    const a = new Date("2025-06-12T10:00:00")
    const b = new Date("2025-06-12T23:59:59")
    assert.strictEqual(isSameDay(a, b), true)
  })

  it("returns false for different days", () => {
    const a = new Date("2025-06-12T00:00:00")
    const b = new Date("2025-06-13T00:00:00")
    assert.strictEqual(isSameDay(a, b), false)
  })

  it("returns false for different months", () => {
    const a = new Date("2025-06-30T12:00:00")
    const b = new Date("2025-07-01T12:00:00")
    assert.strictEqual(isSameDay(a, b), false)
  })

  it("returns false for different years", () => {
    const a = new Date("2024-12-31T23:00:00")
    const b = new Date("2025-01-01T01:00:00")
    assert.strictEqual(isSameDay(a, b), false)
  })
})

describe("chat-utils — getDayDiff", () => {
  it("returns 0 for same day", () => {
    const now = new Date()
    const same = new Date(now)
    assert.strictEqual(getDayDiff(now, same), 0)
  })

  it("returns 1 for yesterday", () => {
    const now = new Date("2025-06-12T12:00:00")
    const yesterday = new Date("2025-06-11T12:00:00")
    assert.strictEqual(getDayDiff(now, yesterday), 1)
  })

  it("returns 7 for one week ago", () => {
    const now = new Date("2025-06-12T12:00:00")
    const weekAgo = new Date("2025-06-05T12:00:00")
    assert.strictEqual(getDayDiff(now, weekAgo), 7)
  })

  it("returns negative for future date", () => {
    const now = new Date("2025-06-12T12:00:00")
    const future = new Date("2025-06-15T12:00:00")
    assert.strictEqual(getDayDiff(now, future), -3)
  })
})

describe("chat-utils — formatTime", () => {
  it("formats hours and minutes in fr-FR locale", () => {
    const d = new Date("2025-06-12T14:05:00")
    const result = formatTime(d)
    assert.match(result, /^14:05$|^14:05$/) // HH:mm in 24h
  })

  it("pads single-digit minutes", () => {
    const d = new Date("2025-06-12T09:03:00")
    assert.match(formatTime(d), /09:03/)
  })
})

describe("chat-utils — formatDateLabel", () => {
  it('returns "Aujourd\'hui" for today', () => {
    const d = new Date()
    assert.strictEqual(formatDateLabel(d), "Aujourd'hui")
  })

  it('returns "Hier" for yesterday', () => {
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    assert.strictEqual(formatDateLabel(yesterday), "Hier")
  })

  it("returns weekday for < 7 days ago", () => {
    const today = new Date()
    const d = new Date(today)
    d.setDate(d.getDate() - 2)
    const weekdays = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
    const label = formatDateLabel(d)
    assert.strictEqual(label, weekdays[d.getDay()])
  })

  it("returns day+month for same year (not within a week)", () => {
    const today = new Date()
    const d = new Date(today)
    d.setDate(d.getDate() - 30) // ~1 month ago, same year
    const label = formatDateLabel(d)
    assert.doesNotMatch(label, /Aujourd'hui|Hier/)
    assert.match(label, /\d+/) // contains a day number
  })

  it("returns full date for different year", () => {
    const today = new Date()
    const d = new Date(today)
    d.setFullYear(d.getFullYear() - 2) // 2 years ago
    const label = formatDateLabel(d)
    assert.match(label, /\d{4}/) // contains a year
  })
})

describe("chat-utils — isFileMessage", () => {
  it("returns true for [FILE:...]", () => {
    assert.strictEqual(isFileMessage("[FILE:img.jpg:url:img:1024]"), true)
  })

  it("returns false for normal text", () => {
    assert.strictEqual(isFileMessage("hello world"), false)
  })

  it("returns false for empty string", () => {
    assert.strictEqual(isFileMessage(""), false)
  })

  it("returns false for null/undefined", () => {
    assert.strictEqual(isFileMessage(null as unknown as string), false)
  })
})

describe("chat-utils — parseFileContent", () => {
  it("parses new format with all fields", () => {
    const result = parseFileContent("[FILE:photo.jpg:https://cdn.example.com/img:img:204800]")
    assert.deepStrictEqual(result, {
      filename: "photo.jpg",
      url: "https://cdn.example.com/img",
      type: "img",
      size: 204800,
      extension: "jpg",
    })
  })

  it("parses new format without size", () => {
    const result = parseFileContent("[FILE:doc.pdf:https://cdn.example.com/file:file]")
    assert.deepStrictEqual(result, {
      filename: "doc.pdf",
      url: "https://cdn.example.com/file",
      type: "file",
    })
  })

  it("parses old format (filename:url)", () => {
    const result = parseFileContent("[FILE:image.png:https://example.com/img.png]")
    assert.deepStrictEqual(result, {
      filename: "image.png",
      url: "https://example.com/img.png",
      type: "img",
    })
  })

  it("parses old format with non-image extension", () => {
    const result = parseFileContent("[FILE:archive.zip:https://example.com/file.zip]")
    assert.deepStrictEqual(result, {
      filename: "archive.zip",
      url: "https://example.com/file.zip",
      type: "file",
    })
  })

  it("returns null for invalid format", () => {
    assert.strictEqual(parseFileContent("not a file message"), null)
  })

  it("returns null for empty string", () => {
    assert.strictEqual(parseFileContent(""), null)
  })
})

describe("chat-utils — shouldGroup", () => {
  const base: Message = {
    id: 1,
    sender: "Alice",
    senderAvatar: null,
    senderId: 42,
    senderRef: "@alice",
    content: "hello",
    own: false,
    seen: false,
    createdAt: "2025-06-12T10:00:00.000Z",
    reactions: [],
    replyToId: null,
    replyToContent: null,
    replyToSender: null,
  }

  function msg(overrides: Partial<Message>): Message {
    return { ...base, ...overrides }
  }

  it("groups messages from same sender within GROUP_GAP", () => {
    const a = msg({ createdAt: "2025-06-12T10:00:00.000Z" })
    const b = msg({
      id: 2,
      createdAt: "2025-06-12T10:02:00.000Z",
    })
    assert.strictEqual(shouldGroup(a, b), true)
  })

  it("does not group messages from different senders", () => {
    const a = msg({ createdAt: "2025-06-12T10:00:00.000Z" })
    const b = msg({
      id: 2,
      sender: "Bob",
      senderRef: "@bob",
      createdAt: "2025-06-12T10:02:00.000Z",
    })
    assert.strictEqual(shouldGroup(a, b), false)
  })

  it("does not group if own status differs", () => {
    const a = msg({ own: false, createdAt: "2025-06-12T10:00:00.000Z" })
    const b = msg({
      id: 2,
      own: true,
      createdAt: "2025-06-12T10:02:00.000Z",
    })
    assert.strictEqual(shouldGroup(a, b), false)
  })

  it("does not group beyond GROUP_GAP", () => {
    const a = msg({ createdAt: "2025-06-12T10:00:00.000Z" })
    const b = msg({
      id: 2,
      createdAt: "2025-06-12T10:10:00.000Z",
    })
    assert.strictEqual(shouldGroup(a, b), false)
  })

  it("does not group if prev msg is missing", () => {
    const b = msg({ id: 2 })
    assert.strictEqual(shouldGroup(null as unknown as Message, b), false)
  })
})
