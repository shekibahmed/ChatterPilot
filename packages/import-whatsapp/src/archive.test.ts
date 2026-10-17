import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
  type ArchiveLimits,
  ArchiveRejectedError,
  type BlobSink,
  DEFAULT_ARCHIVE_LIMITS,
  openWhatsAppArchive,
} from "./archive.ts";
import { buildZip, SAMPLE_BYTES, type TestZipEntry } from "./test-zip.ts";

const dir = mkdtempSync(join(tmpdir(), "chatterpilot-archive-"));
let counter = 0;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeZip(entries: readonly TestZipEntry[]): { path: string; size: number } {
  const bytes = buildZip(entries);
  const path = join(dir, `t${counter++}.zip`);
  writeFileSync(path, bytes);
  return { path, size: bytes.length };
}

const memorySink: BlobSink = async (stream: Readable) => {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
    sizeBytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest("hex"), sizeBytes };
};

const CHAT = "31/12/2024, 21:41 - Meera: PTT-20241231-WA0001.opus (file attached)\n";

async function rejection(entries: readonly TestZipEntry[], limits?: Partial<ArchiveLimits>) {
  const { path, size } = writeZip(entries);
  try {
    const archive = await openWhatsAppArchive(path, size, { ...DEFAULT_ARCHIVE_LIMITS, ...limits });
    await archive.readChatText();
    await archive.extractMedia(memorySink);
    archive.close();
  } catch (err) {
    expect(err).toBeInstanceOf(ArchiveRejectedError);
    return (err as ArchiveRejectedError).reason;
  }
  return "accepted";
}

describe("openWhatsAppArchive: well-formed exports", () => {
  it("finds the chat text, extracts supported media and skips the rest", async () => {
    const { path, size } = writeZip([
      { name: "WhatsApp Chat with Sunrise Hardware.txt", data: CHAT, deflate: true },
      { name: "PTT-20241231-WA0001.opus", data: SAMPLE_BYTES.opus },
      { name: "IMG-20241231-WA0002.jpg", data: SAMPLE_BYTES.jpg },
      { name: "IMG-20241231-WA0003.jpg", data: "not really a jpeg" },
      { name: "notes.xyz", data: "?" },
      { name: "inner.zip", data: "PK" },
    ]);
    const archive = await openWhatsAppArchive(path, size);
    expect(archive.chatEntryName).toBe("WhatsApp Chat with Sunrise Hardware.txt");
    expect(archive.skipped).toEqual([
      { name: "notes.xyz", reason: "unsupported_type" },
      { name: "inner.zip", reason: "nested_archive" },
    ]);
    expect(new TextDecoder().decode(await archive.readChatText())).toBe(CHAT);
    const media = await archive.extractMedia(memorySink);
    archive.close();
    expect(media.map((m) => [m.name, m.mediaType, m.contentCheck, m.blob.sizeBytes])).toEqual([
      ["PTT-20241231-WA0001.opus", "audio", "match", SAMPLE_BYTES.opus.length],
      ["IMG-20241231-WA0002.jpg", "image", "match", SAMPLE_BYTES.jpg.length],
      ["IMG-20241231-WA0003.jpg", "image", "mismatch", 17],
    ]);
  });

  it("prefers the iOS _chat.txt over other text files", async () => {
    const { path, size } = writeZip([
      { name: "_chat.txt", data: CHAT },
      { name: "readme.txt", data: "x" },
    ]);
    const archive = await openWhatsAppArchive(path, size);
    expect(archive.chatEntryName).toBe("_chat.txt");
    archive.close();
  });
});

describe("openWhatsAppArchive: hostile or unsupported archives are refused", () => {
  const chat = { name: "_chat.txt", data: CHAT };

  it.each([
    ["path traversal", [chat, { name: "../evil.opus", data: SAMPLE_BYTES.opus }], "unsafe_path"],
    ["absolute path", [chat, { name: "/tmp/evil.opus", data: SAMPLE_BYTES.opus }], "unsafe_path"],
    [
      "Windows drive path",
      [chat, { name: "C:/evil.opus", data: SAMPLE_BYTES.opus }],
      "unsafe_path",
    ],
    ["backslash path", [chat, { name: "..\\evil.opus", data: SAMPLE_BYTES.opus }], "unsafe_path"],
    ["symlink", [chat, { name: "link.jpg", data: "/etc/passwd", unixMode: 0o120777 }], "symlink"],
    [
      "zip bomb (extreme ratio)",
      [chat, { name: "bomb.opus", data: new Uint8Array(20 * 1024 * 1024), deflate: true }],
      "compression_ratio",
    ],
    [
      "lying uncompressed size",
      [
        chat,
        { name: "lie.opus", data: new Uint8Array(50_000).fill(7), deflate: true, declaredSize: 10 },
      ],
      "corrupt",
    ],
    ["no chat text", [{ name: "a.opus", data: SAMPLE_BYTES.opus }], "no_chat_text"],
    [
      "two candidate chat texts",
      [
        { name: "WhatsApp Chat with A.txt", data: CHAT },
        { name: "WhatsApp Chat with B.txt", data: CHAT },
      ],
      "multiple_chat_texts",
    ],
  ] as const)("%s", async (_name, entries, reason) => {
    expect(await rejection(entries)).toBe(reason);
  });

  it("enforces configurable size and count limits", async () => {
    const entries = [
      chat,
      { name: "a.opus", data: SAMPLE_BYTES.opus },
      { name: "b.pdf", data: SAMPLE_BYTES.pdf },
    ];
    expect(await rejection(entries, { maxEntries: 2 })).toBe("too_many_entries");
    expect(await rejection(entries, { maxEntryUncompressedBytes: 20 })).toBe("entry_too_large");
    expect(await rejection(entries, { maxTotalUncompressedBytes: 100 })).toBe("total_too_large");
    expect(await rejection(entries, { maxArchiveBytes: 10 })).toBe("archive_too_large");
  });

  it("refuses a file that is not a ZIP", async () => {
    const path = join(dir, "not-a-zip.zip");
    writeFileSync(path, "hello");
    await expect(openWhatsAppArchive(path, 5)).rejects.toMatchObject({ reason: "corrupt" });
  });
});
