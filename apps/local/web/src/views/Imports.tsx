import { useEffect, useState } from "react";
import { ApiError, api, type Status, type StoredMessage } from "../api.ts";
import { shortTime } from "../format.ts";

export interface TextHighlight {
  readonly start: number;
  readonly end: number;
  /** Which text the span refers to: the typed message or its voice-note transcript. */
  readonly target: "body" | "transcript";
}

function Highlighted({
  text,
  span,
}: {
  text: string;
  span: { start: number; end: number } | null;
}) {
  if (!span || span.end <= span.start) return <p className="body">{text}</p>;
  return (
    <p className="body">
      {text.slice(0, span.start)}
      <mark>{text.slice(span.start, span.end)}</mark>
      {text.slice(span.end)}
    </p>
  );
}

export function MessageBody({
  message,
  highlight,
}: {
  message: StoredMessage;
  highlight?: TextHighlight | null;
}) {
  return (
    <>
      <Highlighted text={message.body} span={highlight?.target === "body" ? highlight : null} />
      {message.transcriptText !== null && (
        <div className="transcript">
          <span className="badge">
            voice-note transcript (
            {message.transcriptOrigin === "manual" ? "person-supplied" : "provider"})
          </span>
          <Highlighted
            text={message.transcriptText}
            span={highlight?.target === "transcript" ? highlight : null}
          />
        </div>
      )}
    </>
  );
}

export function MessageCard({
  message,
  highlight,
}: {
  message: StoredMessage;
  highlight?: TextHighlight | null;
}) {
  const lines =
    message.startLine === message.endLine
      ? `line ${message.startLine}`
      : `lines ${message.startLine}–${message.endLine}`;
  return (
    <article className={`message kind-${message.kind}`} data-message-id={message.id}>
      <header>
        <span className="line-ref">{lines}</span>
        <span>{shortTime(message.localDateTime)}</span>
        <strong>{message.author ?? "system"}</strong>
        {message.kind !== "text" && <span className="badge">{message.kind}</span>}
        {message.edited && <span className="badge">edited</span>}
        {message.status !== "ok" && <span className="badge warn">{message.status}</span>}
        {message.overlap === "duplicate" && (
          <span
            className="badge"
            title="Same as a message from an earlier export of this chat; counted once"
          >
            repeat
          </span>
        )}
        {message.overlap === "uncertain" && (
          <span
            className="badge warn"
            title="Overlaps an earlier export but differs (edited or deleted?)"
          >
            check: changed?
          </span>
        )}
      </header>
      <MessageBody message={message} highlight={highlight ?? null} />
      {message.mediaState === "attached" &&
        (message.attachmentId ? (
          <a href={`/api/attachments/${message.attachmentId}`} target="_blank" rel="noreferrer">
            Open {message.mediaType} attachment
          </a>
        ) : (
          <span className="muted">{message.mediaFileName} is not in this export</span>
        ))}
    </article>
  );
}

function Upload({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dateOrder, setDateOrder] = useState("");
  const [chat, setChat] = useState("");
  const [needsOrder, setNeedsOrder] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.upload(file, dateOrder || undefined, chat || undefined);
      setMessage(
        result.status === "duplicate"
          ? "This exact file was already imported; nothing changed."
          : "Imported.",
      );
      setNeedsOrder(null);
      onImported();
    } catch (e) {
      if (e instanceof ApiError && e.code === "date_order_required") {
        setNeedsOrder(e.detectedDateOrder ?? "ambiguous");
      }
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>Import a WhatsApp export</h2>
      <p className="muted">
        In WhatsApp: open the chat → More → Export chat. Choose “Include media” for voice notes and
        photos. Only import chats you are allowed to process.
      </p>
      <div className="row">
        <input
          type="file"
          accept=".txt,.zip"
          aria-label="WhatsApp export file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {needsOrder && (
          <label>
            Dates in this chat are written as
            <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}>
              <option value="">choose…</option>
              <option value="dmy">day/month/year</option>
              <option value="mdy">month/day/year</option>
              <option value="ymd">year-month-day</option>
            </select>
          </label>
        )}
        <input
          aria-label="Chat name (optional)"
          placeholder="Chat name (optional)"
          value={chat}
          onChange={(e) => setChat(e.target.value)}
        />
        <button type="button" className="primary" disabled={!file || busy} onClick={submit}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {message && <p className={needsOrder ? "alert" : "note"}>{message}</p>}
    </div>
  );
}

export function Imports({
  status,
  batchId,
  onImported,
}: {
  status: Status | null;
  batchId?: string | undefined;
  onImported: () => void;
}) {
  const [messages, setMessages] = useState<StoredMessage[] | null>(null);
  useEffect(() => {
    if (batchId)
      api
        .messages(batchId)
        .then(setMessages)
        .catch(() => setMessages([]));
    else setMessages(null);
  }, [batchId]);

  if (batchId && messages) {
    const batch = status?.imports.find((i) => i.batchId === batchId);
    return (
      <section>
        <a href="#/imports">← All imports</a>
        <h1>{batch?.sourceName ?? "Import"}</h1>
        <p className="muted">
          Original text, exactly as exported, with its line numbers. {messages.length} messages.
        </p>
        <div className="messages">
          {messages.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Imports</h1>
      <Upload onImported={onImported} />
      <table className="table">
        <thead>
          <tr>
            <th>Export</th>
            <th>Messages</th>
            <th>Covers</th>
            <th>Timestamps</th>
            <th>Overlap</th>
            <th>Media</th>
            <th>Warnings</th>
          </tr>
        </thead>
        <tbody>
          {status?.imports.map((i) => (
            <tr key={i.batchId}>
              <td>
                <a href={`#/imports/${encodeURIComponent(i.batchId)}`}>{i.sourceName}</a>
              </td>
              <td>
                {i.messages}
                <span className="muted">
                  {" "}
                  ({i.byKind.text ?? 0} text, {i.byKind.media ?? 0} media, {i.byKind.system ?? 0}{" "}
                  system)
                </span>
              </td>
              <td>
                {shortTime(i.coverage.first)} → {shortTime(i.coverage.last)}
              </td>
              <td>
                {i.byStatus.ok ?? 0} ok
                {(i.byStatus.invalid_timestamp ?? 0) > 0 && (
                  <span className="badge warn">{i.byStatus.invalid_timestamp} invalid</span>
                )}
              </td>
              <td>
                {i.overlap.new} new, {i.overlap.duplicate} repeated
                {i.overlap.uncertain > 0 && (
                  <span className="badge warn">{i.overlap.uncertain} changed</span>
                )}
                <div className="muted small">chat “{i.chatKey}”</div>
              </td>
              <td>
                {i.media.linked} linked, {i.media.missingFiles} missing, {i.media.omitted} omitted
              </td>
              <td>{i.warnings.length === 0 ? "none" : i.warnings.join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
