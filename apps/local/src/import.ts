import { createHash } from "node:crypto";
import { closeSync, createReadStream, openSync, readFileSync, readSync, statSync } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  type ArchiveLimits,
  ArchiveRejectedError,
  type DateOrder,
  type DateOrderDetection,
  DEFAULT_ARCHIVE_LIMITS,
  decodeExportBytes,
  type ExtractedMedia,
  openWhatsAppArchive,
  SCANNER_VERSION,
  scanExport,
} from "@chatterpilot/import-whatsapp";
import {
  chatKeyFromName,
  type ImportSummary,
  type StoredBlob,
  type Workspace,
} from "@chatterpilot/storage";

export type ImportErrorCode =
  | "unsupported_file"
  | "file_too_large"
  | "archive_rejected"
  | "invalid_encoding"
  | "no_messages"
  | "date_order_required";

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly detectedDateOrder: DateOrderDetection | null;
  constructor(
    code: ImportErrorCode,
    message: string,
    detectedDateOrder: DateOrderDetection | null = null,
  ) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.detectedDateOrder = detectedDateOrder;
  }
}

export type ImportOutcome =
  | { readonly status: "imported"; readonly summary: ImportSummary }
  | { readonly status: "duplicate"; readonly batchId: string; readonly importedAt: string };

export interface ImportOptions {
  readonly dateOrder?: DateOrder;
  /** Chat name for overlap checks; defaults to one derived from the file name. */
  readonly chat?: string;
  readonly limits?: ArchiveLimits;
  readonly now?: Date;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function isZip(path: string): boolean {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(4);
    return readSync(fd, head, 0, 4, 0) === 4 && head.readUInt32LE(0) === 0x04034b50;
  } finally {
    closeSync(fd);
  }
}

/**
 * Import one WhatsApp TXT or ZIP export into a workspace. Identical files are recognised and
 * skipped. Nothing is recorded unless the whole import succeeds; blobs written by a failed
 * import are removed unless another record already uses them.
 */
export async function importExport(
  workspace: Workspace,
  filePath: string,
  options: ImportOptions = {},
): Promise<ImportOutcome> {
  const limits = options.limits ?? DEFAULT_ARCHIVE_LIMITS;
  const size = statSync(filePath).size;
  const sourceSha256 = await sha256File(filePath);
  const existing = workspace.findImportBySourceHash(sourceSha256);
  if (existing)
    return { status: "duplicate", batchId: existing.id, importedAt: existing.importedAt };

  const zip = isZip(filePath);
  if (!zip && !/\.txt$/i.test(filePath)) {
    throw new ImportError("unsupported_file", "Expected a WhatsApp export .txt or .zip file.");
  }
  if (!zip && size > limits.maxEntryUncompressedBytes) {
    throw new ImportError(
      "file_too_large",
      `Text export is ${size} bytes; the limit is ${limits.maxEntryUncompressedBytes}.`,
    );
  }

  const written: StoredBlob[] = [];
  const store = async (stream: Readable) => {
    const blob = await workspace.blobs.put(stream);
    written.push(blob);
    return blob;
  };

  let archive: Awaited<ReturnType<typeof openWhatsAppArchive>> | null = null;
  try {
    let chatBytes: Uint8Array;
    if (zip) {
      archive = await openWhatsAppArchive(filePath, size, limits);
      chatBytes = await archive.readChatText();
    } else {
      chatBytes = readFileSync(filePath);
    }

    const decoded = decodeExportBytes(chatBytes);
    if (!decoded.ok)
      throw new ImportError("invalid_encoding", "The chat text is not valid UTF-8/UTF-16.");
    const scan = scanExport(
      decoded.text,
      options.dateOrder ? { dateOrder: options.dateOrder } : {},
    );
    if (scan.messages.length === 0) {
      throw new ImportError("no_messages", "No WhatsApp messages were recognised in this file.");
    }
    if (scan.appliedDateOrder === null) {
      throw new ImportError(
        "date_order_required",
        `Day/month order is ${scan.detectedDateOrder}; confirm it with --date-order dmy|mdy|ymd.`,
        scan.detectedDateOrder,
      );
    }

    const chatBlob = await store(Readable.from([Buffer.from(chatBytes)]));
    const media: ExtractedMedia[] = archive ? await archive.extractMedia(store) : [];

    const summary = workspace.recordImport({
      chatKey: chatKeyFromName(options.chat?.trim() || basename(filePath)),
      sourceSha256,
      sourceName: basename(filePath),
      sourceKind: zip ? "zip" : "txt",
      chatTextSha256: chatBlob.sha256,
      chatEntryName: archive?.chatEntryName ?? null,
      parserVersion: `import-whatsapp/scanner@${SCANNER_VERSION}`,
      importedAt: (options.now ?? new Date()).toISOString(),
      encoding: decoded.encoding,
      hadByteOrderMark: scan.hadByteOrderMark,
      lineCount: scan.lineCount,
      detectedDateOrder: scan.detectedDateOrder,
      appliedDateOrder: scan.appliedDateOrder,
      unattached: scan.unattached,
      warnings: scan.warnings,
      messages: scan.messages,
      attachments: media.map((m) => ({
        name: m.name,
        mediaType: m.mediaType,
        contentCheck: m.contentCheck,
        blob: m.blob,
      })),
      skipped: archive?.skipped ?? [],
    });
    return { status: "imported", summary };
  } catch (err) {
    try {
      for (const blob of written) {
        if (!workspace.isBlobReferenced(blob.sha256)) workspace.blobs.remove(blob.sha256);
      }
    } catch (cleanupError) {
      // Never let cleanup hide the error that caused it.
      console.error("ChatterPilot: could not remove blobs from a failed import", cleanupError);
    }
    if (err instanceof ArchiveRejectedError) {
      throw new ImportError(
        "archive_rejected",
        `The ZIP was refused (${err.reason}). ${err.message}`,
      );
    }
    throw err;
  } finally {
    archive?.close();
  }
}
