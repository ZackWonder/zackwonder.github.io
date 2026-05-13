# 四子棋 P2P 手动信令兜底实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 P2P (PeerJS broker) 模式之外，新增手动信令兜底路径：broker 不可用时邀请方/被邀请方通过聊天工具人工交换 offer 链接 + answer 文本完成 WebRTC 握手。

**Architecture:** 新增 `src/p2p/manualSignaling.ts`（gzip+base64 SDP 编解码 + URL 协议）与两个 React hook（`useManualHostPeer` / `useManualJoinPeer`），各自管理一个原生 `RTCPeerConnection`，对外暴露与 broker hook 同形的 `send/onMessage` 契约。`InviteModal` 扩展支持手动模式 sub-state；`HostFlow` 拆为 `BrokerHostFlow` + `ManualHostFlow` 双子组件，由 wrapper 切换；URL 入口新增 `#game?manual-offer=…&role=…` 分支识别。`GameContainer` 不动——transport 接口共享。

**Tech Stack:** React 19、TypeScript、Vite 6、原生 `RTCPeerConnection`/`RTCDataChannel`、原生 `CompressionStream`（无新增 npm 依赖）。

**Reference Spec:** `specs/2026-05-13-p2p-manual-signaling-design.md`

---

### Task 0: TDD `src/p2p/manualSignaling.ts`

**Files:**
- Create: `src/p2p/manualSignaling.test.ts`
- Create: `src/p2p/manualSignaling.ts`

- [ ] **Step 1: 写测试文件**

```ts
// src/p2p/manualSignaling.test.ts
import { describe, expect, it } from "vitest";
import {
  buildManualInviteUrl,
  compressBase64,
  decodeSDP,
  decompressBase64,
  encodeSDP,
  parseManualInviteHash,
} from "./manualSignaling";

describe("compressBase64 / decompressBase64", () => {
  it("round-trips plain text", async () => {
    const text = "hello world";
    const encoded = await compressBase64(text);
    const decoded = await decompressBase64(encoded);
    expect(decoded).toBe(text);
  });

  it("round-trips a long repetitive string (should compress well)", async () => {
    const text = "abc".repeat(1000);
    const encoded = await compressBase64(text);
    expect(encoded.length).toBeLessThan(text.length / 5);
    const decoded = await decompressBase64(encoded);
    expect(decoded).toBe(text);
  });

  it("uses URL-safe base64 alphabet (no +, /, =)", async () => {
    const text = "a long enough string to produce padding".repeat(50);
    const encoded = await compressBase64(text);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("decompresses URL-safe input back to original (handles missing padding)", async () => {
    const text = "exactly four-byte multiple input ";
    const encoded = await compressBase64(text);
    const decoded = await decompressBase64(encoded);
    expect(decoded).toBe(text);
  });
});

describe("encodeSDP / decodeSDP", () => {
  it("round-trips an offer", async () => {
    const desc: RTCSessionDescriptionInit = {
      type: "offer",
      sdp: "v=0\r\no=- 123 1 IN IP4 0.0.0.0\r\ns=-\r\n",
    };
    const encoded = await encodeSDP(desc);
    const decoded = await decodeSDP(encoded);
    expect(decoded.type).toBe("offer");
    expect(decoded.sdp).toBe(desc.sdp);
  });

  it("round-trips an answer", async () => {
    const desc: RTCSessionDescriptionInit = { type: "answer", sdp: "v=0\r\ns=-\r\n" };
    const encoded = await encodeSDP(desc);
    const decoded = await decodeSDP(encoded);
    expect(decoded.type).toBe("answer");
  });

  it("rejects invalid base64", async () => {
    await expect(decodeSDP("not-valid-base64-data!!!")).rejects.toThrow();
  });

  it("rejects valid base64 that decompresses to non-JSON", async () => {
    const encoded = await compressBase64("this is not JSON");
    await expect(decodeSDP(encoded)).rejects.toThrow();
  });

  it("rejects JSON with wrong type field", async () => {
    const encoded = await compressBase64(JSON.stringify({ type: "wrong", sdp: "abc" }));
    await expect(decodeSDP(encoded)).rejects.toThrow();
  });

  it("rejects JSON missing sdp field", async () => {
    const encoded = await compressBase64(JSON.stringify({ type: "offer" }));
    await expect(decodeSDP(encoded)).rejects.toThrow();
  });
});

describe("buildManualInviteUrl", () => {
  it("encodes role=B as red", () => {
    const u = buildManualInviteUrl("https://example.com", "abc", "B");
    expect(u).toBe("https://example.com/#game?manual-offer=abc&role=red");
  });

  it("encodes role=A as blue", () => {
    const u = buildManualInviteUrl("https://example.com", "xyz", "A");
    expect(u).toBe("https://example.com/#game?manual-offer=xyz&role=blue");
  });
});

describe("parseManualInviteHash", () => {
  it("parses valid manual offer hash with role=red", () => {
    expect(parseManualInviteHash("#game?manual-offer=abc&role=red")).toEqual({
      encodedOffer: "abc",
      role: "B",
    });
  });

  it("parses valid manual offer hash with role=blue", () => {
    expect(parseManualInviteHash("#game?manual-offer=xyz&role=blue")).toEqual({
      encodedOffer: "xyz",
      role: "A",
    });
  });

  it("returns null when manual-offer missing", () => {
    expect(parseManualInviteHash("#game?role=red")).toBeNull();
  });

  it("returns null when role missing", () => {
    expect(parseManualInviteHash("#game?manual-offer=abc")).toBeNull();
  });

  it("returns null when role is not red/blue", () => {
    expect(parseManualInviteHash("#game?manual-offer=abc&role=green")).toBeNull();
  });

  it("returns null when hash is not #game prefixed", () => {
    expect(parseManualInviteHash("#manual-offer=abc&role=red")).toBeNull();
  });

  it("returns null for plain #game", () => {
    expect(parseManualInviteHash("#game")).toBeNull();
  });

  it("returns null when only broker peer field present", () => {
    expect(parseManualInviteHash("#game?peer=abc&role=red")).toBeNull();
  });
});

describe("round trip URL", () => {
  it("buildManualInviteUrl + parseManualInviteHash preserves both fields", () => {
    for (const role of ["A", "B"] as const) {
      const url = buildManualInviteUrl("https://x.test", "encoded-offer-data", role);
      const hash = "#" + url.split("#")[1]!;
      expect(parseManualInviteHash(hash)).toEqual({ encodedOffer: "encoded-offer-data", role });
    }
  });
});
```

- [ ] **Step 2: 跑测试确认 FAIL**

```bash
cd /Users/zack/Documents/bitabc/research/zackwonder.github.io
npm test
```
Expected: 测试失败（模块未实现）。

- [ ] **Step 3: 实现 `src/p2p/manualSignaling.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认全部 PASS**

```bash
npm test
```
Expected: 所有 manualSignaling 测试通过，已有 34 测试不变。

- [ ] **Step 5: tsc 校验**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/p2p/manualSignaling.ts src/p2p/manualSignaling.test.ts
git commit -m "feat(p2p): add manual signaling helpers (SDP encode/decode, URL protocol)"
```

---

### Task 1: TDD `src/p2p/useManualHostPeer.ts`

**Files:**
- Create: `src/p2p/useManualHostPeer.test.tsx`
- Create: `src/p2p/useManualHostPeer.ts`

- [ ] **Step 1: 写测试（用 vi.stubGlobal 替换 RTCPeerConnection）**

```tsx
// src/p2p/useManualHostPeer.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerMessage } from "./protocol";
import { encodeSDP } from "./manualSignaling";

type Handler = (...args: unknown[]) => void;

class FakeRTCDataChannel {
  readyState: RTCDataChannelState = "connecting";
  sent: string[] = [];
  onopen: Handler | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = "closed";
    this.onclose?.();
  }
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  iceGatheringState: RTCIceGatheringState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  onicegatheringstatechange: Handler | null = null;
  closed = false;
  remoteSet: RTCSessionDescriptionInit | null = null;
  channels: FakeRTCDataChannel[] = [];

  constructor(public config?: RTCConfiguration) {
    FakeRTCPeerConnection.instances.push(this);
  }

  createDataChannel(_label: string): FakeRTCDataChannel {
    const dc = new FakeRTCDataChannel();
    this.channels.push(dc);
    return dc;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "fake-offer-sdp\r\n" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteSet = desc;
  }

  close(): void {
    this.closed = true;
  }

  emitIceComplete() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }
}

vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);

import { useManualHostPeer } from "./useManualHostPeer";

beforeEach(() => {
  FakeRTCPeerConnection.instances = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useManualHostPeer", () => {
  it("transitions init → gathering → awaiting-answer once ICE completes", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    expect(result.current.status).toBe("init");
    // useEffect runs synchronously after mount in renderHook; status becomes 'gathering'
    await waitFor(() => expect(result.current.status).toBe("gathering"));

    const pc = FakeRTCPeerConnection.instances[0]!;
    // Wait for createOffer/setLocalDescription microtasks to settle
    await waitFor(() => expect(pc.localDescription).not.toBeNull());

    act(() => pc.emitIceComplete());

    await waitFor(() => {
      expect(result.current.status).toBe("awaiting-answer");
      expect(result.current.manualOffer).toBeTruthy();
    });
  });

  it("transitions to connected when data channel opens after acceptAnswer", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    act(() => pc.emitIceComplete());
    await waitFor(() => expect(result.current.status).toBe("awaiting-answer"));

    const validAnswer = await encodeSDP({ type: "answer", sdp: "fake-answer-sdp\r\n" });

    await act(async () => {
      await result.current.acceptAnswer(validAnswer);
    });
    expect(pc.remoteSet).toEqual({ type: "answer", sdp: "fake-answer-sdp\r\n" });

    const dc = pc.channels[0]!;
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });
    expect(result.current.status).toBe("connected");
  });

  it("acceptAnswer with invalid base64 sets error and reverts to awaiting-answer", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    act(() => pc.emitIceComplete());
    await waitFor(() => expect(result.current.status).toBe("awaiting-answer"));

    await act(async () => {
      await result.current.acceptAnswer("!!!not base64!!!");
    });
    expect(result.current.status).toBe("awaiting-answer");
    expect(result.current.error).toBeTruthy();
    expect(pc.remoteSet).toBeNull();
  });

  it("delivers received messages to subscribers and unsubscribes cleanly", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    const dc = pc.channels[0]!;
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });

    const received: PeerMessage[] = [];
    let unsub: (() => void) | undefined;
    act(() => {
      unsub = result.current.onMessage((m) => received.push(m));
    });

    act(() => dc.onmessage?.({ data: JSON.stringify({ type: "move", col: 3, seq: 1 }) }));
    expect(received).toEqual([{ type: "move", col: 3, seq: 1 }]);

    act(() => unsub!());
    act(() => dc.onmessage?.({ data: JSON.stringify({ type: "move", col: 2, seq: 2 }) }));
    expect(received).toHaveLength(1);
  });

  it("send before data channel open does not throw", () => {
    const { result } = renderHook(() => useManualHostPeer());
    expect(() =>
      result.current.send({ type: "reset", seq: 1 })
    ).not.toThrow();
  });

  it("send after open serializes message to data channel", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    const dc = pc.channels[0]!;
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });

    act(() => result.current.send({ type: "move", col: 4, seq: 2 }));
    expect(dc.sent).toEqual([JSON.stringify({ type: "move", col: 4, seq: 2 })]);
  });

  it("closes pc on unmount", () => {
    const { unmount } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    unmount();
    expect(pc.closed).toBe(true);
  });

  it("ignores invalid incoming JSON without crashing", async () => {
    const { result } = renderHook(() => useManualHostPeer());
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    const dc = pc.channels[0]!;
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });

    const received: PeerMessage[] = [];
    act(() => {
      result.current.onMessage((m) => received.push(m));
    });

    expect(() =>
      act(() => dc.onmessage?.({ data: "not json" }))
    ).not.toThrow();
    expect(received).toHaveLength(0);

    expect(() =>
      act(() => dc.onmessage?.({ data: JSON.stringify({ type: "unknown" }) }))
    ).not.toThrow();
    expect(received).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试，FAIL**

```bash
npm test
```

- [ ] **Step 3: 实现 `src/p2p/useManualHostPeer.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeSDP, encodeSDP } from "./manualSignaling";
import { isPeerMessage, type PeerMessage } from "./protocol";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export type ManualHostStatus =
  | "init"
  | "gathering"
  | "awaiting-answer"
  | "applying-answer"
  | "connected"
  | "disconnected"
  | "failed";

export interface UseManualHostPeerResult {
  status: ManualHostStatus;
  error: string | null;
  manualOffer: string | null;
  acceptAnswer: (encodedAnswer: string) => Promise<void>;
  send: (msg: PeerMessage) => void;
  onMessage: (handler: (msg: PeerMessage) => void) => () => void;
}

function bindDataChannel(
  dc: RTCDataChannel,
  listenersRef: React.MutableRefObject<Set<(msg: PeerMessage) => void>>,
  setStatus: (s: ManualHostStatus) => void,
  setError: (s: string | null) => void
) {
  dc.onopen = () => setStatus("connected");
  dc.onmessage = (ev: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data as string);
    } catch {
      console.warn("[p2p-manual] non-JSON data dropped");
      return;
    }
    if (!isPeerMessage(parsed)) {
      console.warn("[p2p-manual] dropping unknown message", parsed);
      return;
    }
    listenersRef.current.forEach((cb) => cb(parsed));
  };
  dc.onclose = () => setStatus("disconnected");
  dc.onerror = (ev) => {
    const err = (ev as RTCErrorEvent).error;
    setError(err?.message ?? "data channel error");
    setStatus("disconnected");
  };
}

export function useManualHostPeer(): UseManualHostPeerResult {
  const [status, setStatus] = useState<ManualHostStatus>("init");
  const [error, setError] = useState<string | null>(null);
  const [manualOffer, setManualOffer] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const listenersRef = useRef<Set<(msg: PeerMessage) => void>>(new Set());
  const exposedRef = useRef(false);

  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    const dc = pc.createDataChannel("game");
    dcRef.current = dc;
    bindDataChannel(dc, listenersRef, setStatus, setError);
    setStatus("gathering");

    const exposeOffer = async () => {
      if (exposedRef.current || !pc.localDescription) return;
      exposedRef.current = true;
      try {
        const encoded = await encodeSDP(pc.localDescription);
        setManualOffer(encoded);
        setStatus("awaiting-answer");
      } catch (e) {
        setError((e as Error).message);
        setStatus("failed");
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") void exposeOffer();
    };

    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
      } catch (e) {
        setError((e as Error).message);
        setStatus("failed");
      }
    })();

    const fallbackTimer = setTimeout(() => {
      if (pc.localDescription) void exposeOffer();
    }, 30_000);

    return () => {
      clearTimeout(fallbackTimer);
      pc.close();
      pcRef.current = null;
      dcRef.current = null;
    };
  }, []);

  const acceptAnswer = useCallback(async (encoded: string) => {
    const pc = pcRef.current;
    if (!pc) return;
    setStatus("applying-answer");
    setError(null);
    try {
      const answer = await decodeSDP(encoded);
      await pc.setRemoteDescription(answer);
    } catch {
      setError("答复格式无效，请检查复制是否完整");
      setStatus("awaiting-answer");
    }
  }, []);

  const send = useCallback((msg: PeerMessage) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      console.warn("[p2p-manual] send before ready", msg);
      return;
    }
    dc.send(JSON.stringify(msg));
  }, []);

  const onMessage = useCallback((handler: (msg: PeerMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  return { status, error, manualOffer, acceptAnswer, send, onMessage };
}
```

- [ ] **Step 4: 跑测试，PASS**

```bash
npm test
```
Expected: 全部测试通过，含新增 8 个 useManualHostPeer 用例。

- [ ] **Step 5: tsc 校验**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/p2p/useManualHostPeer.ts src/p2p/useManualHostPeer.test.tsx
git commit -m "feat(p2p): add useManualHostPeer hook for offer-side manual signaling"
```

---

### Task 2: TDD `src/p2p/useManualJoinPeer.ts`

**Files:**
- Create: `src/p2p/useManualJoinPeer.test.tsx`
- Create: `src/p2p/useManualJoinPeer.ts`

- [ ] **Step 1: 写测试**

```tsx
// src/p2p/useManualJoinPeer.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSDP } from "./manualSignaling";

type Handler = (...args: unknown[]) => void;

class FakeRTCDataChannel {
  readyState: RTCDataChannelState = "connecting";
  sent: string[] = [];
  onopen: Handler | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: Handler | null = null;
  onerror: Handler | null = null;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = "closed";
    this.onclose?.();
  }
}

class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  iceGatheringState: RTCIceGatheringState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicegatheringstatechange: Handler | null = null;
  ondatachannel: ((ev: { channel: FakeRTCDataChannel }) => void) | null = null;
  closed = false;

  constructor(public config?: RTCConfiguration) {
    FakeRTCPeerConnection.instances.push(this);
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: "fake-answer-sdp\r\n" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  close(): void {
    this.closed = true;
  }

  emitIceComplete() {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }

  emitDataChannel(): FakeRTCDataChannel {
    const dc = new FakeRTCDataChannel();
    this.ondatachannel?.({ channel: dc });
    return dc;
  }
}

vi.stubGlobal("RTCPeerConnection", FakeRTCPeerConnection);

import { useManualJoinPeer } from "./useManualJoinPeer";

beforeEach(() => {
  FakeRTCPeerConnection.instances = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useManualJoinPeer", () => {
  it("parses offer → creates answer → exposes manualAnswer after ICE complete", async () => {
    const encodedOffer = await encodeSDP({ type: "offer", sdp: "remote-offer-sdp\r\n" });
    const { result } = renderHook(() => useManualJoinPeer(encodedOffer));

    expect(result.current.status).toBe("init");

    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.remoteDescription).not.toBeNull());
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    await waitFor(() => expect(result.current.status).toBe("gathering"));

    act(() => pc.emitIceComplete());

    await waitFor(() => {
      expect(result.current.status).toBe("answer-ready");
      expect(result.current.manualAnswer).toBeTruthy();
    });
  });

  it("transitions to connected once data channel opens", async () => {
    const encodedOffer = await encodeSDP({ type: "offer", sdp: "remote-offer\r\n" });
    const { result } = renderHook(() => useManualJoinPeer(encodedOffer));
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());

    const dc = pc.emitDataChannel();
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });

    expect(result.current.status).toBe("connected");
  });

  it("status fails if offer is invalid", async () => {
    const { result } = renderHook(() => useManualJoinPeer("!!!invalid!!!"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toBeTruthy();
  });

  it("closes pc on unmount", async () => {
    const encodedOffer = await encodeSDP({ type: "offer", sdp: "a\r\n" });
    const { unmount } = renderHook(() => useManualJoinPeer(encodedOffer));
    await waitFor(() => expect(FakeRTCPeerConnection.instances).toHaveLength(1));
    const pc = FakeRTCPeerConnection.instances[0]!;
    unmount();
    expect(pc.closed).toBe(true);
  });

  it("delivers messages and unsubscribes", async () => {
    const encodedOffer = await encodeSDP({ type: "offer", sdp: "a\r\n" });
    const { result } = renderHook(() => useManualJoinPeer(encodedOffer));
    const pc = FakeRTCPeerConnection.instances[0]!;
    await waitFor(() => expect(pc.localDescription).not.toBeNull());
    const dc = pc.emitDataChannel();
    act(() => {
      dc.readyState = "open";
      dc.onopen?.();
    });

    const received: unknown[] = [];
    let unsub: (() => void) | undefined;
    act(() => {
      unsub = result.current.onMessage((m) => received.push(m));
    });
    act(() => dc.onmessage?.({ data: JSON.stringify({ type: "move", col: 1, seq: 1 }) }));
    expect(received).toHaveLength(1);

    act(() => unsub!());
    act(() => dc.onmessage?.({ data: JSON.stringify({ type: "move", col: 2, seq: 2 }) }));
    expect(received).toHaveLength(1);
  });
});
```

- [ ] **Step 2: FAIL**

```bash
npm test
```

- [ ] **Step 3: 实现 `src/p2p/useManualJoinPeer.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeSDP, encodeSDP } from "./manualSignaling";
import { isPeerMessage, type PeerMessage } from "./protocol";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

export type ManualJoinStatus =
  | "init"
  | "parsing"
  | "gathering"
  | "answer-ready"
  | "connected"
  | "disconnected"
  | "failed";

export interface UseManualJoinPeerResult {
  status: ManualJoinStatus;
  error: string | null;
  manualAnswer: string | null;
  send: (msg: PeerMessage) => void;
  onMessage: (handler: (msg: PeerMessage) => void) => () => void;
}

function bindDataChannel(
  dc: RTCDataChannel,
  dcRef: React.MutableRefObject<RTCDataChannel | null>,
  listenersRef: React.MutableRefObject<Set<(msg: PeerMessage) => void>>,
  setStatus: (s: ManualJoinStatus) => void,
  setError: (s: string | null) => void
) {
  dcRef.current = dc;
  dc.onopen = () => setStatus("connected");
  dc.onmessage = (ev: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data as string);
    } catch {
      console.warn("[p2p-manual] non-JSON data dropped");
      return;
    }
    if (!isPeerMessage(parsed)) {
      console.warn("[p2p-manual] dropping unknown message", parsed);
      return;
    }
    listenersRef.current.forEach((cb) => cb(parsed));
  };
  dc.onclose = () => setStatus("disconnected");
  dc.onerror = (ev) => {
    const err = (ev as RTCErrorEvent).error;
    setError(err?.message ?? "data channel error");
    setStatus("disconnected");
  };
}

export function useManualJoinPeer(encodedOffer: string): UseManualJoinPeerResult {
  const [status, setStatus] = useState<ManualJoinStatus>("init");
  const [error, setError] = useState<string | null>(null);
  const [manualAnswer, setManualAnswer] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const listenersRef = useRef<Set<(msg: PeerMessage) => void>>(new Set());
  const exposedRef = useRef(false);

  useEffect(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.ondatachannel = (ev) =>
      bindDataChannel(ev.channel, dcRef, listenersRef, setStatus, setError);
    setStatus("parsing");

    const exposeAnswer = async () => {
      if (exposedRef.current || !pc.localDescription) return;
      exposedRef.current = true;
      try {
        const encoded = await encodeSDP(pc.localDescription);
        setManualAnswer(encoded);
        setStatus("answer-ready");
      } catch (e) {
        setError((e as Error).message);
        setStatus("failed");
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") void exposeAnswer();
    };

    (async () => {
      try {
        const offer = await decodeSDP(encodedOffer);
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        setStatus("gathering");
      } catch (e) {
        setError((e as Error).message);
        setStatus("failed");
      }
    })();

    const fallbackTimer = setTimeout(() => {
      if (pc.localDescription) void exposeAnswer();
    }, 30_000);

    return () => {
      clearTimeout(fallbackTimer);
      pc.close();
      pcRef.current = null;
      dcRef.current = null;
    };
  }, [encodedOffer]);

  const send = useCallback((msg: PeerMessage) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") {
      console.warn("[p2p-manual] send before ready", msg);
      return;
    }
    dc.send(JSON.stringify(msg));
  }, []);

  const onMessage = useCallback((handler: (msg: PeerMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  return { status, error, manualAnswer, send, onMessage };
}
```

- [ ] **Step 4: 跑测试，PASS**

```bash
npm test
```

- [ ] **Step 5: tsc**

```bash
npx tsc -b --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add src/p2p/useManualJoinPeer.ts src/p2p/useManualJoinPeer.test.tsx
git commit -m "feat(p2p): add useManualJoinPeer hook for answer-side manual signaling"
```

---

### Task 3: 扩展 `InviteModal` 支持手动模式

**Files:**
- Modify: `src/p2p/InviteModal.tsx`
- Modify: `src/p2p/InviteModal.css`

- [ ] **Step 1: 重写 `src/p2p/InviteModal.tsx` 增加手动模式 props 与渲染分支**

```tsx
import { useMemo, useState } from "react";
import { buildInviteUrl, type PlayerRole } from "./protocol";
import "./InviteModal.css";

export type ManualOfferStatus = "gathering" | "ready" | "applying-answer";

interface InviteModalProps {
  hostPeerId: string | null;
  hostStatus: "awaiting" | "connected";
  hostRole: PlayerRole | null;
  onChooseRole: (hostRole: PlayerRole) => void;
  onCancel: () => void;
  // Manual fallback hooks
  brokerTimedOut: boolean;
  onSwitchToManual: () => void;
  manualMode: boolean;
  manualOfferUrl: string | null;       // already-built full URL when manualMode
  manualOfferStatus: ManualOfferStatus | null;
  manualAnswerInput: string;
  onManualAnswerInputChange: (v: string) => void;
  onSubmitManualAnswer: () => void;
  onBackToBroker: () => void;
  manualError: string | null;
}

export default function InviteModal({
  hostPeerId,
  hostStatus,
  hostRole,
  onChooseRole,
  onCancel,
  brokerTimedOut,
  onSwitchToManual,
  manualMode,
  manualOfferUrl,
  manualOfferStatus,
  manualAnswerInput,
  onManualAnswerInputChange,
  onSubmitManualAnswer,
  onBackToBroker,
  manualError,
}: InviteModalProps) {
  const [copiedBroker, setCopiedBroker] = useState(false);
  const [copiedManual, setCopiedManual] = useState(false);

  const brokerInviteUrl = useMemo(() => {
    if (!hostPeerId || !hostRole) return "";
    const joinerRole: PlayerRole = hostRole === "A" ? "B" : "A";
    return buildInviteUrl(window.location.origin, hostPeerId, joinerRole);
  }, [hostPeerId, hostRole]);

  const copyTo = async (text: string, setCopied: (b: boolean) => void) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("请手动选中复制");
    }
  };

  if (!hostRole) {
    return (
      <div className="invite-modal-backdrop">
        <div className="invite-modal">
          <h3>选择阵营</h3>
          <div className="invite-role-row">
            <button className="invite-role invite-role-blue" onClick={() => onChooseRole("A")}>
              我玩蓝方（先手）
            </button>
            <button className="invite-role invite-role-red" onClick={() => onChooseRole("B")}>
              我玩红方
            </button>
          </div>
          <button className="invite-cancel" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    );
  }

  if (manualMode) {
    const statusText =
      manualOfferStatus === "gathering"
        ? "正在收集网络候选..."
        : manualOfferStatus === "applying-answer"
        ? "正在应用答复..."
        : "等待对方回复";
    return (
      <div className="invite-modal-backdrop">
        <div className="invite-modal">
          <h3>🛠 手动模式</h3>
          <div className="manual-section">
            <div className="manual-step">
              <div className="manual-step-label">Step 1: 把这条链接发给对方</div>
              <input
                className="invite-url"
                readOnly
                value={manualOfferUrl || "正在生成 offer..."}
              />
              <div className="invite-actions">
                <button
                  onClick={() => copyTo(manualOfferUrl ?? "", setCopiedManual)}
                  disabled={!manualOfferUrl}
                >
                  {copiedManual ? "已复制 ✓" : "复制链接"}
                </button>
              </div>
              <p className="invite-status">状态：{statusText}</p>
            </div>
            <div className="manual-step">
              <div className="manual-step-label">Step 2: 把对方回复的答复贴到这里</div>
              <textarea
                className="manual-answer-input"
                value={manualAnswerInput}
                onChange={(e) => onManualAnswerInputChange(e.target.value)}
                placeholder="粘贴对方发回的 answer 文本"
              />
              {manualError && <div className="manual-error">{manualError}</div>}
              <div className="invite-actions">
                <button
                  onClick={onSubmitManualAnswer}
                  disabled={!manualAnswerInput || manualOfferStatus !== "ready"}
                >
                  应用 answer
                </button>
              </div>
            </div>
          </div>
          <div className="invite-bottom-row">
            <button className="invite-cancel" onClick={onBackToBroker}>
              切回 broker 模式
            </button>
            <button className="invite-cancel" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Broker mode (default)
  return (
    <div className="invite-modal-backdrop">
      <div className="invite-modal">
        <h3>邀请对方加入</h3>
        <p className="invite-hint">把这条链接发给你的对手：</p>
        <input
          className="invite-url"
          readOnly
          value={brokerInviteUrl || "正在连接信令服务器..."}
        />
        <div className="invite-actions">
          <button onClick={() => copyTo(brokerInviteUrl, setCopiedBroker)} disabled={!brokerInviteUrl}>
            {copiedBroker ? "已复制 ✓" : "复制链接"}
          </button>
        </div>
        <p className="invite-status">
          {hostStatus === "awaiting" ? "等待对方加入..." : "对方已连接，进入对战"}
        </p>
        <div className={`broker-fallback-hint ${brokerTimedOut ? "warning" : ""}`}>
          {brokerTimedOut ? "⚠️ 信令服务无响应 — " : "broker 无响应？"}
          <button className="link-button" onClick={onSwitchToManual}>
            切到手动模式
          </button>
        </div>
        <button className="invite-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 扩展 `src/p2p/InviteModal.css`**

追加到文件末尾：

```css
.manual-section {
  margin-top: 1rem;
  text-align: left;
}

.manual-step {
  margin-bottom: 0.8rem;
}

.manual-step-label {
  font-size: 0.85rem;
  opacity: 0.8;
  margin-bottom: 0.25rem;
}

.manual-answer-input {
  width: 100%;
  min-height: 5em;
  font-family: monospace;
  font-size: 0.8rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2c2c2c;
  color: #fafafa;
  box-sizing: border-box;
  resize: vertical;
}

.manual-error {
  color: #e57373;
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.broker-fallback-hint {
  font-size: 0.8rem;
  opacity: 0.75;
  margin: 0.6rem 0;
}

.broker-fallback-hint.warning {
  background: rgba(255, 193, 7, 0.18);
  color: #ffc107;
  padding: 6px 10px;
  border-radius: 6px;
  opacity: 1;
}

.broker-fallback-hint .link-button {
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.invite-bottom-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.5rem;
}
```

- [ ] **Step 3: tsc + 测试**

```bash
npx tsc -b --noEmit
npm test
```
Expected: tsc clean，测试不变（InviteModal 还没接入 Game.tsx，但类型签名已扩展——若 Game.tsx 不更新会有类型错误，所以下一任务紧接着改 Game.tsx）。

**注：** 此 Task 单独 build 会因 Game.tsx 还在调用旧版 InviteModal（缺新 props）而 TS 报错。**实施方式**：临时给所有新增 props 默认值，让旧调用方仍兼容。修改 props 接口：

```tsx
interface InviteModalProps {
  // ...
  // 设默认值以保持向后兼容（Task 4/6 会真正接线）
  brokerTimedOut?: boolean;
  onSwitchToManual?: () => void;
  manualMode?: boolean;
  manualOfferUrl?: string | null;
  manualOfferStatus?: ManualOfferStatus | null;
  manualAnswerInput?: string;
  onManualAnswerInputChange?: (v: string) => void;
  onSubmitManualAnswer?: () => void;
  onBackToBroker?: () => void;
  manualError?: string | null;
}
```

并在组件内部对可选项做默认值兜底：

```tsx
export default function InviteModal({
  hostPeerId,
  hostStatus,
  hostRole,
  onChooseRole,
  onCancel,
  brokerTimedOut = false,
  onSwitchToManual = () => {},
  manualMode = false,
  manualOfferUrl = null,
  manualOfferStatus = null,
  manualAnswerInput = "",
  onManualAnswerInputChange = () => {},
  onSubmitManualAnswer = () => {},
  onBackToBroker = () => {},
  manualError = null,
}: InviteModalProps) { ... }
```

这样 Task 3 单独提交后 build 仍能通过；Task 4/6 把真值接进来。

- [ ] **Step 4: 提交**

```bash
git add src/p2p/InviteModal.tsx src/p2p/InviteModal.css
git commit -m "feat(p2p): extend InviteModal with manual-mode sub-screen"
```

---

### Task 4: 拆 `HostFlow` 为 `BrokerHostFlow` + `ManualHostFlow` + wrapper

**Files:**
- Modify: `src/Game.tsx`

- [ ] **Step 1: 完整重写 `src/Game.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import GameContainer from "./game/GameContainer";
import type { GameContainerTransport } from "./game/GameContainer";
import InviteModal from "./p2p/InviteModal";
import {
  useHostPeer,
  useJoinPeer,
  type UsePeerConnectionResult,
} from "./p2p/usePeerConnection";
import { parseInviteHash, type PlayerRole } from "./p2p/protocol";
import { useManualHostPeer } from "./p2p/useManualHostPeer";
import { useManualJoinPeer } from "./p2p/useManualJoinPeer";
import {
  buildManualInviteUrl,
  parseManualInviteHash,
} from "./p2p/manualSignaling";

type Mode =
  | { kind: "single" }
  | { kind: "host" }
  | { kind: "join"; remotePeerId: string; role: PlayerRole }
  | { kind: "manual-join"; encodedOffer: string; role: PlayerRole };

export default function GameApp() {
  const [mode, setMode] = useState<Mode>(() => {
    const manualParams = parseManualInviteHash(window.location.hash);
    if (manualParams) {
      return {
        kind: "manual-join",
        encodedOffer: manualParams.encodedOffer,
        role: manualParams.role,
      };
    }
    const brokerParams = parseInviteHash(window.location.hash);
    if (brokerParams) {
      return { kind: "join", remotePeerId: brokerParams.peerId, role: brokerParams.role };
    }
    return { kind: "single" };
  });

  const handleLeave = useCallback(() => {
    history.replaceState(null, "", "#game");
    setMode({ kind: "single" });
  }, []);

  if (mode.kind === "single") {
    return (
      <GameContainer
        renderExtraControls={(s) =>
          s.history.length === 0 ? (
            <button
              id="p2pBtn"
              className="p2p-fab"
              onClick={() => setMode({ kind: "host" })}
            >
              🔗 P2P 对战
            </button>
          ) : null
        }
      />
    );
  }

  if (mode.kind === "host") {
    return <HostFlow onLeave={handleLeave} />;
  }

  if (mode.kind === "join") {
    return (
      <JoinerFlow
        remotePeerId={mode.remotePeerId}
        role={mode.role}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <ManualJoinerFlow
      encodedOffer={mode.encodedOffer}
      role={mode.role}
      onLeave={handleLeave}
    />
  );
}

function HostFlow({ onLeave }: { onLeave: () => void }) {
  const [hostRole, setHostRole] = useState<PlayerRole | null>(null);
  const [signalingMode, setSignalingMode] = useState<"broker" | "manual">("broker");

  if (signalingMode === "broker") {
    return (
      <BrokerHostFlow
        hostRole={hostRole}
        onChooseRole={setHostRole}
        onSwitchToManual={() => setSignalingMode("manual")}
        onLeave={onLeave}
      />
    );
  }

  if (!hostRole) {
    // Defensive: should not happen because switch button is hidden before role pick;
    // but if we land here, prompt for role first.
    return (
      <BrokerHostFlow
        hostRole={hostRole}
        onChooseRole={setHostRole}
        onSwitchToManual={() => setSignalingMode("manual")}
        onLeave={onLeave}
      />
    );
  }

  return (
    <ManualHostFlow
      hostRole={hostRole}
      onBackToBroker={() => setSignalingMode("broker")}
      onLeave={onLeave}
    />
  );
}

interface BrokerHostFlowProps {
  hostRole: PlayerRole | null;
  onChooseRole: (r: PlayerRole) => void;
  onSwitchToManual: () => void;
  onLeave: () => void;
}

function BrokerHostFlow({
  hostRole,
  onChooseRole,
  onSwitchToManual,
  onLeave,
}: BrokerHostFlowProps) {
  const host = useHostPeer();
  const transport = useTransport(host, hostRole);
  const hasConnectedOnce =
    host.status === "connected" || host.status === "disconnected";
  const showModal = !hasConnectedOnce;

  // 8s timeout watcher: if still 'init' or 'awaiting' without peerId, flag it.
  const [brokerTimedOut, setBrokerTimedOut] = useState(false);
  useEffect(() => {
    if (host.peerId || host.status === "failed") {
      if (host.status === "failed") setBrokerTimedOut(true);
      return;
    }
    const t = setTimeout(() => setBrokerTimedOut(true), 8_000);
    return () => clearTimeout(t);
  }, [host.peerId, host.status]);

  return (
    <>
      <GameContainer
        transport={transport}
        topBanner={
          hostRole && hasConnectedOnce ? (
            <ConnectionBanner
              localRole={hostRole}
              status={host.status}
              onLeave={onLeave}
            />
          ) : null
        }
      />
      {showModal && (
        <InviteModal
          hostPeerId={host.peerId}
          hostStatus="awaiting"
          hostRole={hostRole}
          onChooseRole={onChooseRole}
          onCancel={onLeave}
          brokerTimedOut={brokerTimedOut && hostRole !== null}
          onSwitchToManual={hostRole ? onSwitchToManual : () => {}}
        />
      )}
    </>
  );
}

interface ManualHostFlowProps {
  hostRole: PlayerRole;
  onBackToBroker: () => void;
  onLeave: () => void;
}

function ManualHostFlow({ hostRole, onBackToBroker, onLeave }: ManualHostFlowProps) {
  const host = useManualHostPeer();
  const [answerInput, setAnswerInput] = useState("");

  const joinerRole: PlayerRole = hostRole === "A" ? "B" : "A";
  const manualOfferUrl = useMemo(() => {
    if (!host.manualOffer) return null;
    return buildManualInviteUrl(window.location.origin, host.manualOffer, joinerRole);
  }, [host.manualOffer, joinerRole]);

  const transport: GameContainerTransport | undefined = useMemo(() => {
    if (host.status !== "connected") return undefined;
    return { send: host.send, onMessage: host.onMessage, localRole: hostRole };
  }, [host.status, host.send, host.onMessage, hostRole]);

  const showModal = host.status !== "connected" && host.status !== "disconnected";

  const offerStatus =
    host.status === "gathering"
      ? "gathering"
      : host.status === "awaiting-answer"
      ? "ready"
      : host.status === "applying-answer"
      ? "applying-answer"
      : null;

  const handleSubmitAnswer = () => {
    void host.acceptAnswer(answerInput.trim());
  };

  return (
    <>
      <GameContainer
        transport={transport}
        topBanner={
          host.status === "connected" || host.status === "disconnected" ? (
            <ConnectionBanner
              localRole={hostRole}
              status={host.status}
              onLeave={onLeave}
            />
          ) : null
        }
      />
      {showModal && (
        <InviteModal
          hostPeerId={null}
          hostStatus="awaiting"
          hostRole={hostRole}
          onChooseRole={() => {}}
          onCancel={onLeave}
          brokerTimedOut={false}
          onSwitchToManual={() => {}}
          manualMode={true}
          manualOfferUrl={manualOfferUrl}
          manualOfferStatus={offerStatus}
          manualAnswerInput={answerInput}
          onManualAnswerInputChange={setAnswerInput}
          onSubmitManualAnswer={handleSubmitAnswer}
          onBackToBroker={onBackToBroker}
          manualError={host.error}
        />
      )}
    </>
  );
}

interface JoinerFlowProps {
  remotePeerId: string;
  role: PlayerRole;
  onLeave: () => void;
}

function JoinerFlow({ remotePeerId, role, onLeave }: JoinerFlowProps) {
  const join = useJoinPeer(remotePeerId);
  const transport = useTransport(join, role);
  const [hasConnected, setHasConnected] = useState(false);

  useEffect(() => {
    if (join.status === "connected") setHasConnected(true);
  }, [join.status]);

  if (join.status === "failed" && !hasConnected) {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <p style={{ color: "#e57373" }}>连接失败，请联系发起方重新分享链接</p>
        <button onClick={onLeave}>返回单机</button>
      </div>
    );
  }

  if (!hasConnected) {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <p>正在连接对方...</p>
        <button onClick={onLeave}>取消</button>
      </div>
    );
  }

  return (
    <GameContainer
      transport={transport}
      topBanner={
        <ConnectionBanner localRole={role} status={join.status} onLeave={onLeave} />
      }
    />
  );
}

interface ManualJoinerFlowProps {
  encodedOffer: string;
  role: PlayerRole;
  onLeave: () => void;
}

function ManualJoinerFlow({ encodedOffer, role, onLeave }: ManualJoinerFlowProps) {
  const join = useManualJoinPeer(encodedOffer);
  const [hasConnected, setHasConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (join.status === "connected") setHasConnected(true);
  }, [join.status]);

  const transport: GameContainerTransport | undefined = useMemo(() => {
    if (join.status !== "connected") return undefined;
    return { send: join.send, onMessage: join.onMessage, localRole: role };
  }, [join.status, join.send, join.onMessage, role]);

  const handleCopy = async () => {
    if (!join.manualAnswer) return;
    try {
      await navigator.clipboard.writeText(join.manualAnswer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("请手动选中复制");
    }
  };

  if (join.status === "failed" && !hasConnected) {
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <p style={{ color: "#e57373" }}>邀请数据无效，或浏览器不支持手动模式</p>
        <p style={{ color: "#999", fontSize: "0.9em" }}>{join.error}</p>
        <button onClick={onLeave}>返回单机</button>
      </div>
    );
  }

  if (!hasConnected) {
    if (join.manualAnswer) {
      return (
        <div style={{ textAlign: "center", marginTop: 40, padding: "0 16px" }}>
          <h3>把这段答复发回给对方</h3>
          <textarea
            readOnly
            value={join.manualAnswer}
            style={{
              width: "100%",
              maxWidth: 480,
              minHeight: "8em",
              fontFamily: "monospace",
              fontSize: "0.8em",
              padding: "0.5rem",
              borderRadius: 6,
            }}
          />
          <div style={{ marginTop: 12 }}>
            <button onClick={handleCopy}>{copied ? "已复制 ✓" : "复制答复"}</button>
            <button style={{ marginLeft: 12 }} onClick={onLeave}>
              取消
            </button>
          </div>
          <p style={{ marginTop: 12, opacity: 0.75 }}>
            发回给对方后等待连接建立...
          </p>
        </div>
      );
    }
    return (
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <p>
          {join.status === "parsing"
            ? "正在解析邀请..."
            : "正在生成答复（收集网络候选）..."}
        </p>
        <button onClick={onLeave}>取消</button>
      </div>
    );
  }

  return (
    <GameContainer
      transport={transport}
      topBanner={
        <ConnectionBanner localRole={role} status={join.status} onLeave={onLeave} />
      }
    />
  );
}

function useTransport(
  peer: UsePeerConnectionResult,
  localRole: PlayerRole | null
): GameContainerTransport | undefined {
  return useMemo(() => {
    if (!localRole) return undefined;
    if (peer.status !== "connected") return undefined;
    return {
      send: peer.send,
      onMessage: peer.onMessage,
      localRole,
    };
  }, [peer.status, peer.send, peer.onMessage, localRole]);
}

interface ConnectionBannerProps {
  localRole: PlayerRole;
  status: string;
  onLeave: () => void;
}

function ConnectionBanner({ localRole, status, onLeave }: ConnectionBannerProps) {
  const colorText = localRole === "A" ? "蓝方" : "红方";
  const disconnected = status === "disconnected" || status === "failed";
  return (
    <>
      <div
        style={{
          fontSize: 14,
          marginBottom: 6,
          padding: disconnected ? "6px 10px" : 0,
          background: disconnected ? "rgba(229,115,115,0.18)" : "transparent",
          borderRadius: 6,
          color: disconnected ? "#e57373" : "inherit",
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            background: disconnected ? "#e57373" : "#4caf50",
            borderRadius: 4,
            marginRight: 6,
          }}
        />
        {disconnected ? "对方已断开" : `P2P 对战中 | 你是 ${colorText}`}
      </div>
      <button className="p2p-fab" onClick={onLeave}>
        返回单机
      </button>
    </>
  );
}
```

- [ ] **Step 2: tsc + tests**

```bash
npx tsc -b --noEmit
npm test
```
Expected: tsc clean，所有测试通过。

- [ ] **Step 3: 提交**

```bash
git add src/Game.tsx
git commit -m "feat(p2p): wire manual host/joiner flows with broker timeout detection"
```

---

### Task 5: 全量回归 + 双标签 manual 模式 E2E

**Files:**
- 无代码改动；仅手测 + 文档化测试通过

- [ ] **Step 1: 跑全部单测**

```bash
cd /Users/zack/Documents/bitabc/research/zackwonder.github.io
npm test
```
Expected: 全过（gameLogic + protocol + usePeerConnection + manualSignaling + useManualHostPeer + useManualJoinPeer），数量约 50+。

- [ ] **Step 2: 跑 build**

```bash
npm run build
```
Expected: tsc + vite build 均无错（chunk-size 警告可忽略）。

- [ ] **Step 3: 单机模式回归（必须不变）**

```bash
npm run dev
```
打开 `#game`：
- [ ] 落子、胜利动画、再玩一次、悔棋 全部正常

- [ ] **Step 4: broker 模式回归**

- [ ] 标签 1 选蓝方 → 链接生成 → 标签 2 打开 → 连上对战
- [ ] 落子同步、再玩一次、断线提示

- [ ] **Step 5: broker 8s 超时自动 fallback 提示**

- [ ] 把本机 DNS 改成无效（或断网）后开新会话：8s 后 InviteModal 出现黄色 "信令服务无响应"
- [ ] 点 "切到手动模式" → 切到 ManualHostFlow，进入手动 UI
- [ ] 恢复网络

- [ ] **Step 6: 完整手动模式端到端**

- [ ] 标签 1：进 P2P → 选蓝方 → 立刻点 "切到手动模式" → "正在收集网络候选..." → 数秒后 "等待对方回复"，offer URL 出现，复制
- [ ] 标签 2：粘贴 offer URL → 打开 → 看到 "正在生成答复..." → 数秒后看到 answer 文本块，复制
- [ ] 回标签 1 → 把 answer 粘到 textarea → 点 "应用 answer" → 连接成功，进入对战
- [ ] 双方落子同步、再玩一次、连接断开提示

- [ ] **Step 7: 边界**

- [ ] 标签 1 在手动模式粘贴乱码 answer → 红字提示 "答复格式无效"，可重新粘贴
- [ ] 手动 offer 链接被截断（如手动改坏 hash）→ 标签 2 显示 "邀请数据无效"
- [ ] 手动模式下点 "切回 broker 模式" → 模式恢复到 broker，新 peer 创建
- [ ] 控制台无未捕获异常

- [ ] **Step 8: 如有任何修复**

定位 → 补单测 → 修代码 → 提交。若全 PASS：

```bash
git log --oneline -20
git tag p2p-manual-signaling-v1
```

---

## 自查清单（实施完成后）

- [ ] Spec §2.1 (原生 RTCPeerConnection 绕开 PeerJS) → Task 1 + Task 2
- [ ] Spec §2.2 (CompressionStream + URL-safe base64) → Task 0 (compressBase64/decompressBase64)
- [ ] Spec §2.3 (非 trickle ICE，等 gathering 完成) → Task 1 + Task 2 (onicegatheringstatechange + 30s fallback)
- [ ] Spec §2.4 (offer 走 URL，answer 走文本) → Task 3 (InviteModal UI) + Task 4 (ManualJoinerFlow textarea)
- [ ] Spec §3 (架构与状态机) → Task 4 (HostFlow 拆分 + 入口分支)
- [ ] Spec §4 (manualSignaling 协议) → Task 0
- [ ] Spec §5 (useManualHostPeer) → Task 1
- [ ] Spec §6 (useManualJoinPeer) → Task 2
- [ ] Spec §7 (InviteModal manual sub-mode) → Task 3
- [ ] Spec §8 (Game.tsx 拆分 + 入口) → Task 4
- [ ] Spec §9 (数据流：transport 复用) → Task 4 (ManualHostFlow / ManualJoinerFlow 内联 useMemo 构造 transport)
- [ ] Spec §10 (错误处理) → Task 1 + Task 2 + Task 4
- [ ] Spec §11 (测试) → Task 0 + Task 1 + Task 2 + Task 5

## 关键设计要点（实施务必遵守）

1. **Transport 接口不变**：所有 P2P 路径（broker 与 manual）暴露同样的 `GameContainerTransport`。`GameContainer` 零修改。
2. **Manual hook 与 broker hook 的 `status` 字段类型不同**——manual 模式不复用 `useTransport(peer, role)` 函数；在 `ManualHostFlow` / `ManualJoinerFlow` 内内联 `useMemo` 构造 transport。
3. **手动模式 hook 不接收 `joinerRole`**——hook 内部不关心角色，调用方在生成 URL 时套 `buildManualInviteUrl`。
4. **broker 切换到 manual 单向手动**：自动 fallback 仅提示，不会自动切换；用户点按钮才生效。
5. **DataChannel.send 必须 stringify**：原生 `RTCDataChannel` 与 peerjs 不同，不会自动序列化对象，所以 `dc.send(JSON.stringify(msg))`。接收端 `dc.onmessage` 拿到 string，要 `JSON.parse` 后再 `isPeerMessage` 校验。
6. **30s ICE gathering 兜底**：即使 ICE 未 complete，到 30s 也用现有 localDescription encode 进 manualOffer/manualAnswer（至少有 host 候选可用）。
7. **switchToManual 在 hostRole 为 null 时禁用**：必须先选阵营再切到手动；BrokerHostFlow 把 `onSwitchToManual` 设为 noop 直到 hostRole 设值。
8. **CompressionStream 不可用降级**：现代浏览器都支持，但若编码抛错，错误信息透传到 UI（manualError），用户能看到原因。
