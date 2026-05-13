export type PlayerRole = "A" | "B";

export type PeerMessage =
  | { type: "move"; col: number; seq: number }
  | { type: "reset"; seq: number };

const COLOR_TO_ROLE: Record<string, PlayerRole> = { blue: "A", red: "B" };
const ROLE_TO_COLOR: Record<PlayerRole, "blue" | "red"> = { A: "blue", B: "red" };

export function buildInviteUrl(origin: string, peerId: string, joinerRole: PlayerRole): string {
  return `${origin}/#game?peer=${encodeURIComponent(peerId)}&role=${ROLE_TO_COLOR[joinerRole]}`;
}

export function parseInviteHash(hash: string): { peerId: string; role: PlayerRole } | null {
  if (!hash.startsWith("#game")) return null;
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const peerId = params.get("peer");
  const color = params.get("role");
  if (!peerId || !color) return null;
  const role = COLOR_TO_ROLE[color];
  if (!role) return null;
  return { peerId, role };
}

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown };
  if (typeof v.type !== "string") return false;
  if (v.type === "move") {
    const m = value as { col?: unknown; seq?: unknown };
    return typeof m.col === "number" && typeof m.seq === "number";
  }
  if (v.type === "reset") {
    const m = value as { seq?: unknown };
    return typeof m.seq === "number";
  }
  return false;
}
