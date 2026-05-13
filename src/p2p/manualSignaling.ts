import type { PlayerRole } from "./protocol";

export async function compressBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function decompressBase64(data: string): Promise<string> {
  const padLen = (4 - (data.length % 4)) % 4;
  const padded = data + "=".repeat(padLen);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  let bytes: Uint8Array;
  try {
    const binary = atob(b64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    throw new Error("invalid base64");
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export async function encodeSDP(desc: RTCSessionDescriptionInit): Promise<string> {
  const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
  return compressBase64(json);
}

export async function decodeSDP(encoded: string): Promise<RTCSessionDescriptionInit> {
  const json = await decompressBase64(encoded);
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error("invalid SDP JSON");
  }
  if (!obj || typeof obj !== "object") throw new Error("invalid SDP shape");
  const candidate = obj as { type?: unknown; sdp?: unknown };
  if (typeof candidate.sdp !== "string") throw new Error("invalid SDP: missing sdp");
  if (candidate.type !== "offer" && candidate.type !== "answer") {
    throw new Error("invalid SDP: bad type");
  }
  return { type: candidate.type, sdp: candidate.sdp };
}

const ROLE_TO_COLOR: Record<PlayerRole, "blue" | "red"> = { A: "blue", B: "red" };
const COLOR_TO_ROLE: Record<string, PlayerRole> = { blue: "A", red: "B" };

export function buildManualInviteUrl(
  origin: string,
  encodedOffer: string,
  joinerRole: PlayerRole
): string {
  return `${origin}/#game?manual-offer=${encodedOffer}&role=${ROLE_TO_COLOR[joinerRole]}`;
}

export function parseManualInviteHash(
  hash: string
): { encodedOffer: string; role: PlayerRole } | null {
  if (!hash.startsWith("#game")) return null;
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const encodedOffer = params.get("manual-offer");
  const color = params.get("role");
  if (!encodedOffer || !color) return null;
  const role = COLOR_TO_ROLE[color];
  if (!role) return null;
  return { encodedOffer, role };
}
