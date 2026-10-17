import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { type MediaType, mediaTypeOf } from "./scan.ts";

/** Product safety defaults (PLAN §5), not WhatsApp limits. Configurable; benchmark before release. */
export interface ArchiveLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxCompressionRatio: number;
}

const MiB = 1024 * 1024;
export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 100 * MiB,
  maxEntries: 10_000,
  maxTotalUncompressedBytes: 500 * MiB,
  maxEntryUncompressedBytes: 64 * MiB,
  maxCompressionRatio: 200,
};

export type ArchiveRejectReason =
  | "archive_too_large"
  | "too_many_entries"
  | "unsafe_path"
  | "symlink"
  | "encrypted"
  | "entry_too_large"
  | "total_too_large"
  | "compression_ratio"
  | "no_chat_text"
  | "multiple_chat_texts"
  | "corrupt";

/** The whole archive is refused; nothing from it may be stored. */
export class ArchiveRejectedError extends Error {
  readonly reason: ArchiveRejectReason;
  readonly entryName: string | null;
  constructor(reason: ArchiveRejectReason, detail: string, entryName: string | null = null) {
    super(`${reason}: ${detail}`);
    this.name = "ArchiveRejectedError";
    this.reason = reason;
    this.entryName = entryName;
  }
}

export type SkipReason = "nested_archive" | "unsupported_type";
export type ContentCheck = "match" | "mismatch" | "unchecked";

export interface MediaEntry {
  readonly name: string;
  readonly uncompressedSize: number;
  readonly mediaType: MediaType;
}

export interface StoredBlob {
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** Persists one entry's bytes (e.g. into a content-addressed store) and reports its hash/size. */
export type BlobSink = (stream: Readable) => Promise<StoredBlob>;

export interface ExtractedMedia extends MediaEntry {
  readonly blob: StoredBlob;
  readonly contentCheck: ContentCheck;
}

export interface WhatsAppArchive {
  readonly chatEntryName: string;
  readonly mediaEntries: readonly MediaEntry[];
  readonly skipped: readonly { readonly name: string; readonly reason: SkipReason }[];
  readChatText(): Promise<Uint8Array>;
  extractMedia(sink: BlobSink): Promise<ExtractedMedia[]>;
  close(): void;
}

const NESTED_ARCHIVE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i;
const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  gif: (b) => ascii(b, 0, 4) === "GIF8",
  webp: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
  wav: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE",
  pdf: (b) => ascii(b, 0, 5) === "%PDF-",
  ogg: (b) => ascii(b, 0, 4) === "OggS",
  mp4: (b) => ascii(b, 4, 8) === "ftyp",
  amr: (b) => ascii(b, 0, 5) === "#!AMR",
};
const SIGNATURE_FOR_EXTENSION: Record<string, keyof typeof SIGNATURES> = {
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  wav: "wav",
  pdf: "pdf",
  opus: "ogg",
  ogg: "ogg",
  mp4: "mp4",
  m4a: "mp4",
  mov: "mp4",
  "3gp": "mp4",
  heic: "mp4",
  amr: "amr",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Compare leading bytes with the extension's known signature, when we know one. */
export function checkContent(fileName: string, head: Uint8Array): ContentCheck {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const kind = SIGNATURE_FOR_EXTENSION[ext];
  if (!kind) return "unchecked";
  return SIGNATURES[kind]?.(head) ? "match" : "mismatch";
}

function isChatText(name: string): boolean {
  return /\.txt$/i.test(name) && !name.includes("/");
}

/** Counts bytes actually produced, enforces a cap, and keeps the first bytes for sniffing. */
class GuardedStream extends Transform {
  bytes = 0;
  head = new Uint8Array(0);
  private readonly limit: number;
  private readonly entryName: string;
  constructor(limit: number, entryName: string) {
    super();
    this.limit = limit;
    this.entryName = entryName;
  }
  override _transform(
    chunk: Buffer,
    _enc: BufferEncoding,
    done: (err?: Error | null, data?: Buffer) => void,
  ) {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) {
      done(
        new ArchiveRejectedError("entry_too_large", "entry exceeds its size limit", this.entryName),
      );
      return;
    }
    if (this.head.length < 16) {
      this.head = Uint8Array.from([...this.head, ...chunk.subarray(0, 16 - this.head.length)]);
    }
    done(null, chunk);
  }
}

function listEntries(zip: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zip.on("entry", (entry: Entry) => {
      entries.push(entry);
      zip.readEntry();
    });
    zip.on("end", () => resolve(entries));
    zip.on("error", reject);
    zip.readEntry();
  });
}

function toRejection(err: unknown): ArchiveRejectedError {
  if (err instanceof ArchiveRejectedError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/invalid characters|absolute path|invalid relative path/.test(message)) {
    return new ArchiveRejectedError("unsafe_path", message);
  }
  return new ArchiveRejectedError("corrupt", message);
}

/**
 * Open and fully validate a WhatsApp export ZIP before any content is extracted.
 * Entry names are only used as labels; callers must never use them as filesystem paths.
 */
export async function openWhatsAppArchive(
  path: string,
  archiveBytes: number,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<WhatsAppArchive> {
  if (archiveBytes > limits.maxArchiveBytes) {
    throw new ArchiveRejectedError("archive_too_large", `${archiveBytes} bytes`);
  }
  let zip: ZipFile;
  let entries: Entry[];
  try {
    zip = await yauzl.openPromise(path, {
      lazyEntries: true,
      autoClose: false,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch (err) {
    throw toRejection(err);
  }
  try {
    if (zip.entryCount > limits.maxEntries) {
      throw new ArchiveRejectedError("too_many_entries", `${zip.entryCount} entries`);
    }
    entries = await listEntries(zip);

    let total = 0;
    const files: Entry[] = [];
    for (const entry of entries) {
      const name = entry.fileName;
      if (name.endsWith("/")) continue; // directory record
      if (((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK) {
        throw new ArchiveRejectedError("symlink", name, name);
      }
      if (entry.isEncrypted()) throw new ArchiveRejectedError("encrypted", name, name);
      if (entry.uncompressedSize > limits.maxEntryUncompressedBytes) {
        throw new ArchiveRejectedError(
          "entry_too_large",
          `${name}: ${entry.uncompressedSize} bytes`,
          name,
        );
      }
      const ratio = entry.uncompressedSize / Math.max(entry.compressedSize, 1);
      if (ratio > limits.maxCompressionRatio) {
        throw new ArchiveRejectedError(
          "compression_ratio",
          `${name}: ratio ${ratio.toFixed(0)}`,
          name,
        );
      }
      total += entry.uncompressedSize;
      if (total > limits.maxTotalUncompressedBytes) {
        throw new ArchiveRejectedError("total_too_large", `${total} bytes expanded`);
      }
      files.push(entry);
    }

    const textEntries = files.filter((e) => isChatText(e.fileName));
    const preferred = textEntries.filter(
      (e) => e.fileName === "_chat.txt" || e.fileName.startsWith("WhatsApp Chat"),
    );
    const chatCandidates = preferred.length > 0 ? preferred : textEntries;
    if (chatCandidates.length === 0)
      throw new ArchiveRejectedError("no_chat_text", "no chat .txt at archive root");
    if (chatCandidates.length > 1) {
      throw new ArchiveRejectedError(
        "multiple_chat_texts",
        chatCandidates.map((e) => e.fileName).join(", "),
      );
    }
    const chatEntry = chatCandidates[0] as Entry;

    const skipped: { name: string; reason: SkipReason }[] = [];
    const media: { entry: Entry; mediaType: MediaType }[] = [];
    for (const entry of files) {
      if (entry === chatEntry) continue;
      if (NESTED_ARCHIVE.test(entry.fileName)) {
        skipped.push({ name: entry.fileName, reason: "nested_archive" });
        continue;
      }
      const mediaType = mediaTypeOf(entry.fileName);
      if (mediaType === "unknown") {
        skipped.push({ name: entry.fileName, reason: "unsupported_type" });
        continue;
      }
      media.push({ entry, mediaType });
    }

    const guardedRead = async (entry: Entry, onData: (s: GuardedStream) => Promise<void>) => {
      const guard = new GuardedStream(limits.maxEntryUncompressedBytes, entry.fileName);
      try {
        const source = await zip.openReadStreamPromise(entry);
        await Promise.all([pipeline(source, guard), onData(guard)]);
      } catch (err) {
        guard.destroy();
        throw toRejection(err);
      }
      return guard;
    };

    return {
      chatEntryName: chatEntry.fileName,
      mediaEntries: media.map(({ entry, mediaType }) => ({
        name: entry.fileName,
        uncompressedSize: entry.uncompressedSize,
        mediaType,
      })),
      skipped,
      async readChatText() {
        const chunks: Buffer[] = [];
        await guardedRead(chatEntry, async (stream) => {
          for await (const chunk of stream) chunks.push(chunk as Buffer);
        });
        return new Uint8Array(Buffer.concat(chunks));
      },
      async extractMedia(sink) {
        const extracted: ExtractedMedia[] = [];
        for (const { entry, mediaType } of media) {
          let blob: StoredBlob | undefined;
          const guard = await guardedRead(entry, async (stream) => {
            blob = await sink(stream);
          });
          if (!blob)
            throw new ArchiveRejectedError("corrupt", "sink returned no blob", entry.fileName);
          extracted.push({
            name: entry.fileName,
            uncompressedSize: entry.uncompressedSize,
            mediaType,
            blob,
            contentCheck: checkContent(entry.fileName, guard.head),
          });
        }
        return extracted;
      },
      close() {
        zip.close();
      },
    };
  } catch (err) {
    zip.close();
    throw toRejection(err);
  }
}
