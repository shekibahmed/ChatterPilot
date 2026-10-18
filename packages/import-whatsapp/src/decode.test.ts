import { describe, expect, it } from "vitest";
import { decodeExportBytes } from "./decode.ts";

describe("decodeExportBytes", () => {
  it("decodes UTF-8 and keeps a BOM for the scanner to report", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("hi ₹")]);
    expect(decodeExportBytes(bytes)).toEqual({ ok: true, text: "﻿hi ₹", encoding: "utf-8" });
  });

  it("decodes UTF-16LE with a BOM", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(decodeExportBytes(bytes)).toEqual({ ok: true, text: "hi", encoding: "utf-16le" });
  });

  it("rejects invalid UTF-8 instead of substituting characters", () => {
    expect(decodeExportBytes(new Uint8Array([0x68, 0xc3, 0x28]))).toEqual({
      ok: false,
      reason: "invalid_encoding",
    });
  });
});
