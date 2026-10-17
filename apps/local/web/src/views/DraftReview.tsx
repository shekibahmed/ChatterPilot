import type { Field, Provenance } from "@chatterpilot/core";
import type { DraftLine } from "@chatterpilot/orders";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  api,
  type CatalogueInfo,
  type Decision,
  type DraftView,
  type StoredMessage,
} from "../api.ts";
import { money, percent, quantity, shortTime, sourceDetail, sourceLabel } from "../format.ts";
import { MessageCard } from "./Imports.tsx";

type Highlight = { messageId: string; start: number; end: number } | null;
type LineField = "product" | "quantity" | "unit" | "unitPrice" | "taxRate";

const FIELD_LABELS: Record<LineField, string> = {
  product: "Product",
  quantity: "Quantity",
  unit: "Unit",
  unitPrice: "Unit price",
  taxRate: "Tax rate %",
};

function Chips({
  evidence,
  onSource,
}: {
  evidence: readonly Provenance[];
  onSource: (p: Provenance) => void;
}) {
  return (
    <span className="chips">
      {evidence.map((p, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: evidence order is fixed per render.
          key={i}
          type="button"
          className={`chip chip-${p.kind}`}
          title={sourceDetail(p)}
          onClick={() => onSource(p)}
        >
          {sourceLabel(p)}
        </button>
      ))}
    </span>
  );
}

function Value<T>({
  field,
  render,
  onSource,
}: {
  field: Field<T>;
  render: (value: T) => ReactNode;
  onSource: (p: Provenance) => void;
}) {
  return (
    <div className={`field field-${field.status}`}>
      <span className="value">
        {field.status !== "ok" && (
          <span className="marker" title={field.status === "unknown" ? "Unknown" : "Needs review"}>
            {field.status === "unknown" ? "?" : "!"}
          </span>
        )}
        {field.value === null ? "unknown" : render(field.value)}
      </span>
      <Chips evidence={field.evidence} onSource={onSource} />
    </div>
  );
}

function LineEditor({
  line,
  index,
  catalogue,
  onSave,
  onCancel,
}: {
  line: DraftLine;
  index: number;
  catalogue: CatalogueInfo | null;
  onSave: (decision: Decision, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [field, setField] = useState<LineField>(line.product.value ? "quantity" : "product");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const product = catalogue?.products.find((p) => p.id === line.product.value?.productId);
  const units = product ? [product.unit, ...product.altUnits] : [];

  return (
    <fieldset className="editor" aria-label={`Edit line ${index + 1}`}>
      <select
        aria-label="Field"
        value={field}
        onChange={(e) => {
          setField(e.target.value as LineField);
          setValue("");
        }}
      >
        {(Object.keys(FIELD_LABELS) as LineField[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>
      {field === "product" ? (
        <select aria-label="New value" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">choose product…</option>
          {catalogue?.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
      ) : field === "unit" && units.length > 0 ? (
        <select aria-label="New value" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">choose unit…</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label="New value"
          value={value}
          placeholder="e.g. 45"
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      <input
        aria-label="Reason"
        className="grow"
        value={reason}
        placeholder="Reason (required), e.g. corrected in chat line 12"
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className="primary"
        disabled={!value || !reason.trim()}
        onClick={() => onSave({ action: "set_line", line: index, field, value }, reason)}
      >
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </fieldset>
  );
}

export function DraftReview({ id, reviewer }: { id: string; reviewer: string }) {
  const [view, setView] = useState<DraftView | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueInfo | null>(null);
  const [suggestions, setSuggestions] = useState<StoredMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [linkId, setLinkId] = useState("");
  const [note, setNote] = useState("");
  const [customerId, setCustomerId] = useState("");

  const load = useCallback(() => {
    api
      .draft(id)
      .then(setView)
      .catch((e: Error) => setError(e.message));
    api
      .suggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [id]);
  useEffect(() => {
    load();
    api
      .catalogue()
      .then(setCatalogue)
      .catch(() => setCatalogue(null));
  }, [load]);

  const act = async (decision: Decision, reason?: string) => {
    setError(null);
    try {
      setView(await api.decide(id, decision, reviewer, reason));
      setEditing(null);
      setNote("");
      setLinkId("");
      api
        .suggestions()
        .then(setSuggestions)
        .catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onSource = (p: Provenance) => {
    if (p.kind !== "message") return;
    setHighlight({ messageId: p.messageId, start: p.span.start, end: p.span.end });
    document.querySelector(`[data-message-id="${CSS.escape(p.messageId)}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

  if (!view) return <p className="muted">{error ?? "Loading…"}</p>;
  const { draft, record } = view;
  const open = record.status === "open";
  const currency = draft.currency.value;

  return (
    <section>
      <a href="#/orders">← Orders</a>
      <div className="draft-head">
        <div>
          <h1>
            Order draft <span className={`status status-${record.status}`}>{record.status}</span>
          </h1>
          <p className="muted">
            Created by {record.createdBy} on {shortTime(record.createdAt)} · catalogue{" "}
            {draft.catalogueVersion} · formula {draft.formulaVersion}
            {view.newerCatalogueAvailable && " · a newer catalogue is loaded"}
          </p>
        </div>
        <div className="total">
          <span className="label">Total</span>
          <span className="metric" data-testid="draft-total">
            {money(draft.total.value, currency)}
          </span>
        </div>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {draft.issues.length > 0 ? (
        <div className="issues" data-testid="issues">
          <strong>{draft.issues.length} to review before this can be accepted</strong>
          <ul>
            {draft.issues.map((i) => (
              <li key={`${i.field}-${i.code}`}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        record.status === "open" && (
          <p className="note">No open issues. Check the values and their sources, then accept.</p>
        )
      )}
      {view.acceptedSnapshotSha256 && (
        <p className="note">
          Accepted and frozen. Fingerprint <code>{view.acceptedSnapshotSha256.slice(0, 16)}…</code>
        </p>
      )}

      <div className="grid2">
        <div className="panel">
          <h2>Customer</h2>
          <Value
            field={draft.customer}
            render={(c) => `${c.name} (${c.customerId})`}
            onSource={onSource}
          />
          {open && (
            <div className="row">
              <select
                aria-label="Customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">set customer…</option>
                {catalogue?.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                aria-label="Customer reason"
                className="grow"
                placeholder="Reason"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                disabled={!customerId || !note.trim()}
                onClick={() => act({ action: "set_customer", customerId }, note)}
              >
                Set
              </button>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>Order date</h2>
          <Value field={draft.orderDate} render={(d) => d} onSource={onSource} />
        </div>
      </div>

      <table className="table lines">
        <thead>
          <tr>
            <th>#</th>
            <th>From the chat</th>
            <th>Product</th>
            <th>Quantity</th>
            <th>Unit price</th>
            <th>Amount</th>
            <th>Tax</th>
            {open && <th />}
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, i) => (
            <LineRows
              // biome-ignore lint/suspicious/noArrayIndexKey: the machine line index is the line's identity.
              key={i}
              line={line}
              index={i}
              open={open}
              currency={currency}
              editing={editing === i}
              catalogue={catalogue}
              onSource={onSource}
              onEdit={() => setEditing(editing === i ? null : i)}
              onSave={act}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>Subtotal / tax / total</td>
            <td>
              <Value
                field={draft.subtotal}
                render={(v) => money(v, currency)}
                onSource={onSource}
              />
            </td>
            <td>
              <Value
                field={draft.taxTotal}
                render={(v) => money(v, currency)}
                onSource={onSource}
              />
            </td>
            {open && <td />}
          </tr>
        </tfoot>
      </table>

      {open && (
        <div className="panel">
          <h2>Add a related message</h2>
          <p className="muted">Link a later correction or addition; its lines join this draft.</p>
          <div className="row">
            <select
              aria-label="Message to link"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
            >
              <option value="">choose a suggested message…</option>
              {suggestions.map((m) => (
                <option key={m.id} value={m.id}>
                  line {m.startLine}: {m.body.slice(0, 60)}
                </option>
              ))}
            </select>
            <input
              aria-label="Link reason"
              className="grow"
              placeholder="Reason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              type="button"
              disabled={!linkId || !note.trim()}
              onClick={() => act({ action: "link_message", messageId: linkId }, note)}
            >
              Link
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Decision</h2>
        <div className="row">
          <input
            aria-label="Decision note"
            className="grow"
            placeholder="Note or reason"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {open ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={draft.issues.length > 0}
                onClick={() => act({ action: "accept" }, note)}
              >
                Accept order
              </button>
              <button
                type="button"
                className="danger"
                disabled={!note.trim()}
                onClick={() => act({ action: "reject" }, note)}
              >
                Reject
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!note.trim()}
              onClick={() => act({ action: "reopen" }, note)}
            >
              Reopen
            </button>
          )}
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>Source messages</h2>
          <p className="muted">Click a “Chat line” chip to highlight the exact words used.</p>
          {view.messages.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              highlight={highlight?.messageId === m.id ? highlight : null}
            />
          ))}
        </div>
        <div className="panel">
          <h2>History</h2>
          {view.decisions.length === 0 && <p className="muted">No decisions yet.</p>}
          <ol className="history">
            {view.decisions.map((d) => (
              <li key={d.seq}>
                <strong>{d.action.replace("_", " ")}</strong> by {d.reviewer}{" "}
                <span className="muted">{shortTime(d.at)}</span>
                <div>{d.reason}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function LineRows(props: {
  line: DraftLine;
  index: number;
  open: boolean;
  currency: string | null;
  editing: boolean;
  catalogue: CatalogueInfo | null;
  onSource: (p: Provenance) => void;
  onEdit: () => void;
  onSave: (decision: Decision, reason?: string) => Promise<void>;
}) {
  const { line, index, open, currency, onSource } = props;
  const [reason, setReason] = useState("");
  return (
    <>
      <tr className={line.excluded ? "excluded" : ""} data-testid={`line-${index}`}>
        <td>{index + 1}</td>
        <td className="source">
          “{line.sourceText}”{line.excluded && <span className="badge">excluded</span>}
        </td>
        <td>
          <Value field={line.product} render={(p) => p.name} onSource={onSource} />
        </td>
        <td>
          <Value field={line.quantity} render={(q) => quantity(q.milli)} onSource={onSource} />
          <Value field={line.unit} render={(u) => u} onSource={onSource} />
        </td>
        <td>
          <Value field={line.unitPrice} render={(v) => money(v, currency)} onSource={onSource} />
        </td>
        <td>
          <Value field={line.amount} render={(v) => money(v, currency)} onSource={onSource} />
        </td>
        <td>
          <Value field={line.taxRate} render={(v) => percent(v)} onSource={onSource} />
          <Value field={line.tax} render={(v) => money(v, currency)} onSource={onSource} />
        </td>
        {open && (
          <td>
            <div className="line-actions">
              <button type="button" onClick={props.onEdit}>
                Edit
              </button>
              <input
                aria-label={`Reason for line ${index + 1}`}
                placeholder="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                type="button"
                disabled={!reason.trim()}
                onClick={() =>
                  props.onSave(
                    { action: "exclude_line", line: index, excluded: !line.excluded },
                    reason,
                  )
                }
              >
                {line.excluded ? "Include" : "Exclude"}
              </button>
            </div>
          </td>
        )}
      </tr>
      {props.editing && (
        <tr>
          <td colSpan={8}>
            <LineEditor
              line={line}
              index={index}
              catalogue={props.catalogue}
              onSave={(d, r) => props.onSave(d, r)}
              onCancel={props.onEdit}
            />
          </td>
        </tr>
      )}
    </>
  );
}
