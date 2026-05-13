import { useCallback, useEffect, useRef, useState } from "react";
import { decodeSDP, encodeSDP } from "./manualSignaling";
import { isPeerMessage, type PeerMessage } from "./protocol";
import { ICE_SERVERS } from "./iceServers";

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
        setStatus("gathering");
        await pc.setLocalDescription(offer);
      } catch (e) {
        setError((e as Error).message);
        setStatus("failed");
      }
    })();

    // ICE gathering 兜底：等齐所有候选有时要 10–30s（TURN 不可达时尤其慢），
    // 这里 5s 就用现有候选（通常已有 host + STUN srflx，覆盖大多数场景），
    // 缺失的 TURN 候选只在严苛 NAT 才需要——拿不到也接受。
    const fallbackTimer = setTimeout(() => {
      if (pc.localDescription) void exposeOffer();
    }, 5_000);

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
