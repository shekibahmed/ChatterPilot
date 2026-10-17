import type { Dashboard } from "@chatterpilot/orders";
import type {
  DecisionRecord,
  ImportSummary,
  StoredMessage,
  WorkspaceInfo,
} from "@chatterpilot/storage";
import type { Decision, DraftSummary, DraftView } from "../../src/review.ts";

export type {
  Dashboard,
  Decision,
  DecisionRecord,
  DraftSummary,
  DraftView,
  ImportSummary,
  StoredMessage,
};

export interface Status {
  workspace: WorkspaceInfo;
  catalogue: {
    version: string;
    maintainer: string | null;
    stalePriceDays: number;
    products: number;
    customers: number;
  } | null;
  imports: ImportSummary[];
}

export interface CatalogueInfo {
  version?: string;
  products: { id: string; name: string; unit: string; altUnits: string[] }[];
  customers: { id: string; name: string }[];
}

export class ApiError extends Error {
  readonly code: string | undefined;
  readonly detectedDateOrder: string | undefined;
  constructor(message: string, code?: string, detectedDateOrder?: string) {
    super(message);
    this.code = code;
    this.detectedDateOrder = detectedDateOrder;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    detectedDateOrder?: string;
  };
  if (!res.ok)
    throw new ApiError(
      body.error ?? `Request failed (${res.status})`,
      body.code,
      body.detectedDateOrder,
    );
  return body as T;
}

// Every state-changing request carries this header; the server refuses requests without it.
const WRITE_HEADERS = { "x-chatterpilot": "1" };

export const api = {
  status: () => fetch("/api/status").then((r) => handle<Status>(r)),
  catalogue: () => fetch("/api/catalogue").then((r) => handle<CatalogueInfo>(r)),
  messages: (batchId: string) =>
    fetch(`/api/imports/${encodeURIComponent(batchId)}/messages`).then((r) =>
      handle<StoredMessage[]>(r),
    ),
  upload: (file: File, dateOrder?: string, chat?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (dateOrder) form.set("dateOrder", dateOrder);
    if (chat) form.set("chat", chat);
    return fetch("/api/imports", { method: "POST", headers: WRITE_HEADERS, body: form }).then((r) =>
      handle<{ status: "imported" | "duplicate" }>(r),
    );
  },
  dashboard: (scope: "accepted" | "all") =>
    fetch(`/api/dashboard?scope=${scope}`).then((r) => handle<Dashboard>(r)),
  suggestions: () => fetch("/api/suggestions").then((r) => handle<StoredMessage[]>(r)),
  drafts: () => fetch("/api/drafts").then((r) => handle<DraftSummary[]>(r)),
  draft: (id: string) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}`).then((r) => handle<DraftView>(r)),
  createDraft: (messageIds: string[], reviewer: string) =>
    fetch("/api/drafts", {
      method: "POST",
      headers: { ...WRITE_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ messageIds, reviewer }),
    }).then((r) => handle<DraftView>(r)),
  decide: (id: string, decision: Decision, reviewer: string, reason?: string) =>
    fetch(`/api/drafts/${encodeURIComponent(id)}/decisions`, {
      method: "POST",
      headers: { ...WRITE_HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ decision, reviewer, reason }),
    }).then((r) => handle<DraftView>(r)),
};
