import type { Workspace } from "@chatterpilot/storage";
import {
  extractFleetEvents,
  extractFollowups,
  type FleetEvent,
  type FleetSummary,
  type FollowupItem,
  type FollowupSummary,
  linkFleetEvents,
  linkFollowups,
  summariseFleet,
  summariseFollowups,
  type VehicleRegistry,
} from "@chatterpilot/templates";

/**
 * Run the fleet template over a workspace's canonical text messages (repeats from overlapping
 * exports are already excluded), optionally for one chat only.
 */
export function fleetEvents(
  ws: Workspace,
  registry: VehicleRegistry,
  chatKey?: string,
): { events: FleetEvent[]; summary: FleetSummary } {
  const events = linkFleetEvents(
    canonicalTextMessages(ws, chatKey).flatMap((m) => extractFleetEvents(m, registry)),
  );
  return { events, summary: summariseFleet(events) };
}

/** The follow-ups template (open deliveries, complaints, payments, quotes) over a workspace. */
export function followupItems(
  ws: Workspace,
  chatKey?: string,
): { items: FollowupItem[]; summary: FollowupSummary } {
  const items = linkFollowups(canonicalTextMessages(ws, chatKey).flatMap(extractFollowups));
  return { items, summary: summariseFollowups(items) };
}

function canonicalTextMessages(ws: Workspace, chatKey?: string) {
  return ws.db
    .prepare(
      `SELECT m.id, m.author, m.local_datetime AS localDateTime, m.start_line AS startLine, m.body
       FROM message m JOIN import_batch b ON b.id = m.import_batch_id
       WHERE m.kind = 'text' AND m.duplicate_of IS NULL AND (@chat IS NULL OR b.chat_key = @chat)
       ORDER BY m.local_datetime, b.imported_at, m.position`,
    )
    .all({ chat: chatKey ?? null }) as {
    id: string;
    author: string | null;
    localDateTime: string | null;
    startLine: number;
    body: string;
  }[];
}
