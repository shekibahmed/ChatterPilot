import { createHash, randomUUID } from "node:crypto";
import type { EnvelopeRecord, IntakeStore } from "@chatterpilot/storage";

/**
 * Staff-only Telegram intake (OA1), tested offline with synthetic updates. Staff forward selected
 * WhatsApp order messages to a private bot; this module decides what is accepted. It never treats
 * forwarded text as permission for anything: approvals are only valid as callbacks from allowlisted
 * approvers and must name the exact accepted draft version.
 *
 * Shapes follow the Telegram Bot API (Update, Message, CallbackQuery) for the fields used here.
 */

export interface TgUser {
  readonly id: number;
  readonly is_bot?: boolean;
  readonly first_name?: string;
}
export interface TgChat {
  readonly id: number;
  readonly type: "private" | "group" | "supergroup" | "channel";
  readonly title?: string;
}
export interface TgMessage {
  readonly message_id: number;
  readonly date: number;
  readonly chat: TgChat;
  readonly from?: TgUser;
  readonly text?: string;
  readonly caption?: string;
  readonly edit_date?: number;
  readonly voice?: {
    readonly file_id: string;
    readonly duration: number;
    readonly file_size?: number;
  };
  readonly forward_origin?: {
    readonly type: "user" | "hidden_user" | "chat" | "channel";
    readonly date: number;
    readonly sender_user?: TgUser;
    readonly sender_user_name?: string;
    readonly sender_chat?: TgChat;
  };
}
export interface TgCallbackQuery {
  readonly id: string;
  readonly from: TgUser;
  readonly data?: string;
}
export interface TgUpdate {
  readonly update_id: number;
  readonly message?: TgMessage;
  readonly edited_message?: TgMessage;
  readonly callback_query?: TgCallbackQuery;
}

export interface IntakePolicy {
  /** Numeric Telegram user ids allowed to forward orders. */
  readonly allowedSenderIds: readonly number[];
  /** Numeric chat ids the bot accepts messages from (e.g. the staff group or private chats). */
  readonly allowedChatIds: readonly number[];
  /** Numeric user ids allowed to approve via callback buttons. */
  readonly approverIds: readonly number[];
}

export type IntakeResult =
  | { readonly updateId: number; readonly outcome: "accepted"; readonly envelopeId: string }
  | {
      readonly updateId: number;
      readonly outcome: "possible_repeat";
      readonly envelopeId: string;
      readonly repeatOf: string;
    }
  | {
      readonly updateId: number;
      readonly outcome: "edit";
      readonly envelopeId: string;
      readonly editOf: string | null;
    }
  | { readonly updateId: number; readonly outcome: "media_only"; readonly envelopeId: string }
  | { readonly updateId: number; readonly outcome: "duplicate_update" }
  | { readonly updateId: number; readonly outcome: "refused"; readonly reason: string }
  | {
      readonly updateId: number;
      readonly outcome: "callback";
      readonly valid: boolean;
      readonly reason: string;
      readonly draftId: string | null;
    };

/** Telegram keeps undelivered updates for at most 24 hours (Bot API getUpdates). */
export const TELEGRAM_RETENTION_HOURS = 24;

/** Callback data format for an approval button: "approve:<draftId>:<first 12 hex of snapshot>". */
export const callbackData = (draftId: string, snapshotSha256: string) =>
  `approve:${draftId}:${snapshotSha256.slice(0, 12)}`;

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

function originLabel(m: TgMessage): string | null {
  const o = m.forward_origin;
  if (!o) return null;
  if (o.type === "user") return `user:${o.sender_user?.id ?? "?"}`;
  if (o.type === "hidden_user") return `hidden:${o.sender_user_name ?? "?"}`;
  return `${o.type}:${o.sender_chat?.id ?? "?"}`;
}

/**
 * Business-level identity of forwarded content: same original sender, original time and text.
 * A repeated forward has a new update_id but the same hash, so it is flagged, not merged.
 */
export function contentHash(m: TgMessage): string {
  const text = m.text ?? m.caption ?? "";
  const origin = m.forward_origin
    ? [originLabel(m), m.forward_origin.date]
    : ["direct", m.chat.id, m.message_id];
  return createHash("sha256")
    .update(JSON.stringify([...origin, text]))
    .digest("hex");
}

export interface CallbackResolver {
  /** Current accepted snapshot hash for a draft, or null if the draft is not accepted. */
  acceptedSnapshot(draftId: string): string | null;
}

export function processUpdate(
  store: IntakeStore,
  update: TgUpdate,
  policy: IntakePolicy,
  resolver: CallbackResolver,
  now: Date,
): IntakeResult {
  const at = now.toISOString();
  const updateId = update.update_id;
  const offset = store.offset();
  if ((offset !== null && updateId <= offset) || store.seen(updateId)) {
    return { updateId, outcome: "duplicate_update" };
  }

  if (update.callback_query) {
    const cq = update.callback_query;
    const refuse = (reason: string): IntakeResult => {
      store.log(updateId, at, "callback_refused", reason);
      return { updateId, outcome: "callback", valid: false, reason, draftId: null };
    };
    if (!policy.approverIds.includes(cq.from.id)) return refuse("sender is not an approver");
    const m = /^approve:([0-9a-f-]{36}):([0-9a-f]{12})$/.exec(cq.data ?? "");
    if (!m) return refuse("unrecognised button data");
    const [, draftId = "", prefix = ""] = m;
    const snapshot = resolver.acceptedSnapshot(draftId);
    if (!snapshot) return refuse("draft is not accepted");
    if (!snapshot.startsWith(prefix)) return refuse("draft changed since the button was sent");
    store.log(
      updateId,
      at,
      "callback_valid",
      `approval intent for draft ${draftId}; no action taken`,
    );
    return {
      updateId,
      outcome: "callback",
      valid: true,
      reason: "matches the accepted draft version",
      draftId,
    };
  }

  const message = update.message ?? update.edited_message;
  if (!message) {
    store.log(updateId, at, "refused", "unsupported update type");
    return { updateId, outcome: "refused", reason: "unsupported update type" };
  }
  const refuse = (reason: string): IntakeResult => {
    store.log(updateId, at, "refused", reason); // content from refused updates is not kept
    return { updateId, outcome: "refused", reason };
  };
  if (!message.from || message.from.is_bot) return refuse("no human sender");
  if (!policy.allowedChatIds.includes(message.chat.id)) return refuse("chat is not allowlisted");
  if (!policy.allowedSenderIds.includes(message.from.id))
    return refuse("sender is not allowlisted");

  const text = message.text ?? message.caption ?? "";
  const hash = contentHash(message);
  const base: Omit<EnvelopeRecord, "status" | "repeatOf" | "editOf"> = {
    id: randomUUID(),
    updateId,
    chatId: message.chat.id,
    messageId: message.message_id,
    senderId: message.from.id,
    receivedAt: iso(message.edit_date ?? message.date),
    forwardOrigin: originLabel(message),
    forwardDate: message.forward_origin ? iso(message.forward_origin.date) : null,
    text,
    contentHash: hash,
  };

  if (update.edited_message) {
    // Edits are stored as a new version linked to the original, never overwriting it.
    const original = store.byMessage(message.chat.id, message.message_id);
    store.accept({ ...base, status: "edit", repeatOf: null, editOf: original?.id ?? null }, at);
    return { updateId, outcome: "edit", envelopeId: base.id, editOf: original?.id ?? null };
  }
  if (!text) {
    // Voice notes and files need a download step (standard Bot API getFile limit: 20 MB), not built yet.
    store.accept({ ...base, status: "media_only", repeatOf: null, editOf: null }, at);
    return { updateId, outcome: "media_only", envelopeId: base.id };
  }
  const earlier = store.byHash(hash);
  if (earlier) {
    store.accept({ ...base, status: "possible_repeat", repeatOf: earlier.id, editOf: null }, at);
    return { updateId, outcome: "possible_repeat", envelopeId: base.id, repeatOf: earlier.id };
  }
  store.accept({ ...base, status: "accepted", repeatOf: null, editOf: null }, at);
  return { updateId, outcome: "accepted", envelopeId: base.id };
}

/** Warn when the bot may have been offline longer than Telegram keeps undelivered updates. */
export function intakeGapWarning(lastSeenAt: string | null, now: Date): string | null {
  if (!lastSeenAt) return null;
  const hours = (now.getTime() - Date.parse(lastSeenAt)) / 3_600_000;
  if (hours <= TELEGRAM_RETENTION_HOURS) return null;
  return `No updates were processed for ${Math.floor(hours)} hours. Telegram keeps undelivered updates for at most ${TELEGRAM_RETENTION_HOURS} hours, so messages forwarded during that time may be missing; ask staff to forward them again.`;
}
