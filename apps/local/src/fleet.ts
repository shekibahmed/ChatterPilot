import type { Workspace } from "@chatterpilot/storage";
import {
  extractFleetEvents,
  type FleetEvent,
  type FleetSummary,
  linkFleetEvents,
  summariseFleet,
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
  const rows = ws.db
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
  const events = linkFleetEvents(rows.flatMap((m) => extractFleetEvents(m, registry)));
  return { events, summary: summariseFleet(events) };
}
