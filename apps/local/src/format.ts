/**
 * Make untrusted chat text safe for a terminal: control characters (including ANSI escape
 * sequences) are replaced, and line breaks are shown as a visible marker.
 */
export function terminalSafe(text: string, maxLength = 60): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
  const cleaned = text.replace(/\r?\n/g, " ⏎ ").replace(/[\u0000-\u001f\u007f-\u009f]/g, "�");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}
