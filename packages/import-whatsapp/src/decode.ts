export type DecodeResult =
  | { ok: true; text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" }
  | { ok: false; reason: "invalid_encoding" };

/**
 * Decode export bytes strictly. Invalid UTF-8 is reported rather than replaced with U+FFFD,
 * so a damaged or non-UTF-8 file never turns into silently altered evidence.
 */
export function decodeExportBytes(bytes: Uint8Array): DecodeResult {
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  try {
    // ignoreBOM keeps a UTF-8 BOM in the text so scanExport can report it.
    const text = new TextDecoder(encoding, { fatal: true, ignoreBOM: encoding === "utf-8" }).decode(
      bytes,
    );
    return { ok: true, text, encoding };
  } catch {
    return { ok: false, reason: "invalid_encoding" };
  }
}
