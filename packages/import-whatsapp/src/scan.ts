import {
  type DateOrder,
  type DateOrderDetection,
  detectDateOrder,
  parseTimestampText,
  type TimestampParts,
  toLocalDateTime,
} from "./timestamp.ts";

export type ExportFormat = "android" | "ios";
export type MessageKind = "text" | "media" | "system" | "deleted";
export type MessageStatus = "ok" | "needs_date_order" | "invalid_timestamp";
export type MediaType =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "contact"
  | "unknown";

export interface MediaReference {
  /** "attached": the export names a file; "omitted": the export says media was left out. */
  readonly state: "attached" | "omitted";
  readonly fileName: string | null;
  readonly mediaType: MediaType;
}

export interface ScannedMessage {
  /** 0-based position in export order. Export order is preserved, never re-sorted. */
  readonly index: number;
  /** 1-based inclusive line range in the decoded source text. */
  readonly startLine: number;
  readonly endLine: number;
  readonly format: ExportFormat;
  /** Timestamp exactly as written, e.g. "31/12/24, 9:41 PM". */
  readonly timestampText: string;
  /** Floating local date-time ("2024-12-31T21:41:00") or null when unresolved. */
  readonly localDateTime: string | null;
  readonly status: MessageStatus;
  /** Sender exactly as written, or null for system lines without a sender. */
  readonly author: string | null;
  /** Message body exactly as written (continuation lines joined with "\n"). */
  readonly body: string;
  readonly kind: MessageKind;
  readonly media: MediaReference | null;
  readonly edited: boolean;
}

export interface UnattachedLines {
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}

export interface ScanOptions {
  /** User-confirmed date order. Required when the export is ambiguous. */
  readonly dateOrder?: DateOrder;
}

export interface ScanResult {
  readonly messages: readonly ScannedMessage[];
  /** Lines before the first recognised message header; reported, never silently dropped. */
  readonly unattached: UnattachedLines | null;
  readonly lineCount: number;
  readonly hadByteOrderMark: boolean;
  readonly formats: readonly ExportFormat[];
  readonly detectedDateOrder: DateOrderDetection;
  /** Order used for resolution: declared, or detected when unambiguous; null otherwise. */
  readonly appliedDateOrder: DateOrder | null;
  readonly warnings: readonly string[];
}

const SP = "[ \\u00A0\\u202F]";
const DIRECTION_MARKS = /^[‎‏]+/;
const IOS_HEADER = /^\[([^\]]{6,40})\][   ](.*)$/;
const ANDROID_HEADER = new RegExp(
  String.raw`^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?${SP}+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:${SP}?[AaPp]\.?${SP}?[Mm]\.?)?)${SP}[-–]${SP}(.*)$`,
);

// English-language Android system lines that would otherwise look like "Author: body".
const ANDROID_SYSTEM_PREFIX =
  / (?:changed the subject|changed the group description|changed this group's|added|removed|left|joined using|created group)/;

const ATTACHED_IOS = /<attached: ([^>]+)>\s*$/;
const ATTACHED_ANDROID = /^(.+\.[A-Za-z0-9]{2,5}) \(file attached\)$/;
const OMITTED_IOS = /^(image|video|audio|sticker|GIF|document|Contact card) omitted$/i;
const DELETED = /^(?:This message was deleted|You deleted this message)\.?$/;
const EDITED_SUFFIX = /[‎]?<This message was edited>$/;

const EXTENSION_TYPES: Record<string, MediaType> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  heic: "image",
  gif: "image",
  mp4: "video",
  mov: "video",
  "3gp": "video",
  opus: "audio",
  ogg: "audio",
  m4a: "audio",
  mp3: "audio",
  aac: "audio",
  wav: "audio",
  amr: "audio",
  pdf: "document",
  doc: "document",
  docx: "document",
  xls: "document",
  xlsx: "document",
  csv: "document",
  txt: "document",
  vcf: "contact",
};

function mediaTypeOf(fileName: string): MediaType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (fileName.includes("-STICKER-") || ext === "was") return "sticker";
  return EXTENSION_TYPES[ext] ?? "unknown";
}

function omittedType(word: string): MediaType {
  const w = word.toLowerCase();
  if (w === "gif") return "image";
  if (w === "contact card") return "contact";
  return w as MediaType;
}

interface Header {
  readonly format: ExportFormat;
  readonly timestampText: string;
  readonly parts: TimestampParts;
  readonly rest: string;
}

function matchHeader(line: string): Header | null {
  const cleaned = line.replace(DIRECTION_MARKS, "");
  const ios = IOS_HEADER.exec(cleaned);
  if (ios) {
    const parts = parseTimestampText(ios[1] ?? "");
    if (parts) return { format: "ios", timestampText: ios[1] ?? "", parts, rest: ios[2] ?? "" };
  }
  const android = ANDROID_HEADER.exec(cleaned);
  if (android) {
    const parts = parseTimestampText(android[1] ?? "");
    if (parts) {
      return { format: "android", timestampText: android[1] ?? "", parts, rest: android[2] ?? "" };
    }
  }
  return null;
}

function splitAuthor(rest: string, format: ExportFormat): { author: string | null; body: string } {
  const sep = rest.indexOf(": ");
  if (sep <= 0) return { author: null, body: rest };
  const author = rest.slice(0, sep);
  if (format === "android" && ANDROID_SYSTEM_PREFIX.test(author))
    return { author: null, body: rest };
  return { author, body: rest.slice(sep + 2) };
}

function classify(
  body: string,
  author: string | null,
  format: ExportFormat,
): Pick<ScannedMessage, "kind" | "media" | "edited"> {
  const firstLine = body.split("\n", 1)[0] ?? "";
  const startsWithMark = DIRECTION_MARKS.test(firstLine);
  const first = firstLine.replace(DIRECTION_MARKS, "");
  const edited = EDITED_SUFFIX.test(body);

  if (author === null) return { kind: "system", media: null, edited };
  if (first === "<Media omitted>") {
    return {
      kind: "media",
      media: { state: "omitted", fileName: null, mediaType: "unknown" },
      edited,
    };
  }
  const omitted = OMITTED_IOS.exec(first);
  if (omitted) {
    const mediaType = omittedType(omitted[1] ?? "");
    return { kind: "media", media: { state: "omitted", fileName: null, mediaType }, edited };
  }
  const attached = ATTACHED_IOS.exec(first) ?? ATTACHED_ANDROID.exec(first);
  if (attached) {
    const fileName = attached[1] ?? "";
    return {
      kind: "media",
      media: { state: "attached", fileName, mediaType: mediaTypeOf(fileName) },
      edited,
    };
  }
  if (DELETED.test(first)) return { kind: "deleted", media: null, edited };
  // iOS writes system notices (encryption banner, member changes) under the chat name with a
  // leading direction mark; ordinary typed text does not start with one.
  if (format === "ios" && startsWithMark) return { kind: "system", media: null, edited };
  return { kind: "text", media: null, edited };
}

/**
 * Split a decoded WhatsApp TXT export into messages. Every input line is accounted for: it belongs
 * to exactly one message (header line or continuation) or to the leading unattached block.
 */
export function scanExport(source: string, options: ScanOptions = {}): ScanResult {
  const hadByteOrderMark = source.startsWith("﻿");
  const text = hadByteOrderMark ? source.slice(1) : source;
  const lines = text.split(/\r\n|\n|\r/);
  if (lines.length > 0 && lines.at(-1) === "") lines.pop();

  interface Draft {
    header: Header;
    startLine: number;
    endLine: number;
    author: string | null;
    bodyLines: string[];
  }
  const drafts: Draft[] = [];
  let unattachedEnd = 0;

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const header = matchHeader(line);
    if (header) {
      const { author, body } = splitAuthor(header.rest, header.format);
      drafts.push({ header, startLine: lineNo, endLine: lineNo, author, bodyLines: [body] });
      return;
    }
    const current = drafts.at(-1);
    if (current) {
      current.bodyLines.push(line);
      current.endLine = lineNo;
    } else {
      unattachedEnd = lineNo;
    }
  });

  const warnings: string[] = [];
  const detectedDateOrder = detectDateOrder(drafts.map((d) => d.header.parts));
  const declared = options.dateOrder;
  if (declared && detectedDateOrder !== "ambiguous" && detectedDateOrder !== declared) {
    warnings.push(
      `Declared date order "${declared}" differs from the order the timestamps imply ("${detectedDateOrder}").`,
    );
  }
  const appliedDateOrder: DateOrder | null =
    declared ??
    (detectedDateOrder === "ambiguous" || detectedDateOrder === "conflict"
      ? null
      : detectedDateOrder);
  if (appliedDateOrder === null && drafts.length > 0) {
    warnings.push(
      detectedDateOrder === "conflict"
        ? "Timestamps fit no single day/month order; check the export and declare the order."
        : "Day/month order is ambiguous; declare it before timestamps are resolved.",
    );
  }

  const formats = [...new Set(drafts.map((d) => d.header.format))];
  if (formats.length > 1) warnings.push("Export mixes Android and iOS line formats.");

  const messages = drafts.map((d, index): ScannedMessage => {
    const body = d.bodyLines.join("\n");
    const localDateTime =
      appliedDateOrder === null ? null : toLocalDateTime(d.header.parts, appliedDateOrder);
    const status: MessageStatus =
      appliedDateOrder === null
        ? "needs_date_order"
        : localDateTime === null
          ? "invalid_timestamp"
          : "ok";
    return {
      index,
      startLine: d.startLine,
      endLine: d.endLine,
      format: d.header.format,
      timestampText: d.header.timestampText,
      localDateTime,
      status,
      author: d.author,
      body,
      ...classify(body, d.author, d.header.format),
    };
  });

  return {
    messages,
    unattached:
      unattachedEnd > 0
        ? { startLine: 1, endLine: unattachedEnd, text: lines.slice(0, unattachedEnd).join("\n") }
        : null,
    lineCount: lines.length,
    hadByteOrderMark,
    formats,
    detectedDateOrder,
    appliedDateOrder,
    warnings,
  };
}
