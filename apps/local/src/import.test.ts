import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildZip, SAMPLE_BYTES } from "@chatterpilot/import-whatsapp/testing";
import { Workspace } from "@chatterpilot/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImportError, importExport } from "./import.ts";

const FIXTURES = new URL("../../../fixtures/synthetic/chats/", import.meta.url);
const ANDROID = new URL("android-dmy-hardware-orders.txt", FIXTURES).pathname;
const NOW = new Date("2026-10-17T10:00:00Z");

let dir: string;
let ws: Workspace;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chatterpilot-ws-"));
  ws = Workspace.create(join(dir, "ws"), { name: "Test", timezone: "Asia/Kolkata", now: NOW });
});
afterEach(() => {
  ws.close();
  rmSync(dir, { recursive: true, force: true });
});

const batchCount = () =>
  (ws.db.prepare("SELECT COUNT(*) AS n FROM import_batch").get() as { n: number }).n;
const storedBlobs = () =>
  readdirSync(ws.blobs.root, { recursive: true, withFileTypes: true }).filter(
    (e) => e.isFile() && !e.parentPath.endsWith("tmp"),
  ).length;

function writeFile(name: string, data: Buffer | string): string {
  const path = join(dir, name);
  writeFileSync(path, data);
  return path;
}

async function expectImportError(promise: Promise<unknown>, code: string) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ImportError);
  expect((err as ImportError).code).toBe(code);
}

describe("importExport: text exports", () => {
  it("imports every message with provenance and coverage", async () => {
    const outcome = await importExport(ws, ANDROID, { now: NOW });
    expect(outcome.status).toBe("imported");
    if (outcome.status !== "imported") return;
    expect(outcome.summary).toMatchObject({
      sourceName: "android-dmy-hardware-orders.txt",
      lineCount: 19,
      messages: 15,
      byKind: { system: 3, text: 8, media: 3, deleted: 1 },
      byStatus: { ok: 15 },
      coverage: { first: "2026-01-12T09:02:00", last: "2026-01-15T18:22:00" },
      // A TXT export carries no media files: both referenced files are missing, one omitted.
      media: { linked: 0, unlinkedFiles: 0, missingFiles: 2, omitted: 1 },
    });
    const order = ws.db
      .prepare(
        "SELECT start_line, end_line, timestamp_text, author FROM message WHERE position = 5",
      )
      .get();
    expect(order).toEqual({
      start_line: 6,
      end_line: 9,
      timestamp_text: "12/01/26, 10:04 am",
      author: "Ravi Kumar",
    });
  });

  it("keeps the original chat bytes unchanged", async () => {
    await importExport(ws, ANDROID, { now: NOW });
    const { sha } = ws.db.prepare("SELECT chat_text_sha256 AS sha FROM import_batch").get() as {
      sha: string;
    };
    expect(readFileSync(ws.blobs.pathFor(sha))).toEqual(readFileSync(ANDROID));
  });

  it("treats re-importing the identical file as a no-op", async () => {
    const first = await importExport(ws, ANDROID, { now: NOW });
    const second = await importExport(ws, ANDROID, { now: NOW });
    expect(second.status).toBe("duplicate");
    if (first.status === "imported" && second.status === "duplicate") {
      expect(second.batchId).toBe(first.summary.batchId);
    }
    expect(batchCount()).toBe(1);
    expect((ws.db.prepare("SELECT COUNT(*) AS n FROM message").get() as { n: number }).n).toBe(15);
  });

  it("refuses an ambiguous export until the date order is confirmed, storing nothing", async () => {
    const path = writeFile(
      "ambiguous.txt",
      "01/02/24, 10:00 - Meera: 10 bags\n03/04/24, 11:00 - Kabir: ok\n",
    );
    await expectImportError(importExport(ws, path), "date_order_required");
    expect(batchCount()).toBe(0);
    expect(storedBlobs()).toBe(0);

    const outcome = await importExport(ws, path, { dateOrder: "mdy" });
    expect(outcome.status === "imported" && outcome.summary.coverage.first).toBe(
      "2024-01-02T10:00:00",
    );
  });

  it("rejects files that are not WhatsApp exports", async () => {
    await expectImportError(
      importExport(ws, writeFile("notes.txt", "just some notes\n")),
      "no_messages",
    );
    await expectImportError(
      importExport(ws, writeFile("photo.jpg", Buffer.from(SAMPLE_BYTES.jpg))),
      "unsupported_file",
    );
    await expectImportError(
      importExport(ws, writeFile("bad.txt", Buffer.from([0x68, 0xc3, 0x28]))),
      "invalid_encoding",
    );
  });
});

describe("importExport: ZIP exports", () => {
  const chat = [
    "31/12/2024, 21:41 - Meera: PTT-20241231-WA0001.opus (file attached)",
    "31/12/2024, 21:42 - Meera: IMG-20241231-WA0002.jpg (file attached)",
    "31/12/2024, 21:43 - Meera: <Media omitted>",
    "",
  ].join("\n");

  it("stores media by content hash and links it by exact file name", async () => {
    const path = writeFile(
      "export.zip",
      buildZip([
        { name: "WhatsApp Chat with Meera.txt", data: chat, deflate: true },
        { name: "PTT-20241231-WA0001.opus", data: SAMPLE_BYTES.opus },
        { name: "IMG-20241231-WA0099.jpg", data: SAMPLE_BYTES.jpg },
        { name: "notes.xyz", data: "?" },
      ]),
    );
    const outcome = await importExport(ws, path, { now: NOW });
    expect(outcome.status === "imported" && outcome.summary.media).toEqual({
      linked: 1, // the voice note
      unlinkedFiles: 1, // WA0099.jpg is in the ZIP but no message names it
      missingFiles: 1, // WA0002.jpg is named but absent
      omitted: 1,
    });
    expect(outcome.status === "imported" && outcome.summary.skippedEntries).toBe(1);
    const voice = ws.db
      .prepare(
        "SELECT blob_sha256 AS sha, link_method, content_check FROM attachment WHERE file_name LIKE 'PTT%'",
      )
      .get() as { sha: string; link_method: string; content_check: string };
    expect(voice).toMatchObject({ link_method: "exact_file_name", content_check: "match" });
    expect(readFileSync(ws.blobs.pathFor(voice.sha))).toEqual(Buffer.from(SAMPLE_BYTES.opus));
  });

  it("refuses hostile archives without recording anything", async () => {
    const path = writeFile(
      "evil.zip",
      buildZip([
        { name: "_chat.txt", data: chat },
        { name: "../../escape.opus", data: SAMPLE_BYTES.opus },
      ]),
    );
    await expectImportError(importExport(ws, path), "archive_rejected");
    expect(batchCount()).toBe(0);
    expect(storedBlobs()).toBe(0);
  });

  it("removes blobs written before a failure discovered mid-extraction", async () => {
    const path = writeFile(
      "lying.zip",
      buildZip([
        { name: "_chat.txt", data: chat },
        { name: "PTT-20241231-WA0001.opus", data: SAMPLE_BYTES.opus },
        { name: "lie.opus", data: new Uint8Array(50_000).fill(7), deflate: true, declaredSize: 10 },
      ]),
    );
    await expectImportError(importExport(ws, path), "archive_rejected");
    expect(batchCount()).toBe(0);
    expect(storedBlobs()).toBe(0);
  });
});
