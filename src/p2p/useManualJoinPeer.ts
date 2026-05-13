import { useCallback, useEffect, useRef, useState } from "react";
import { decodeSDP, encodeSDP } from "./manualSignaling";
import { isPeerMessage, type PeerMessage } from "./protocol";
import { ICE_SERVERS } from "./iceServers";

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
        setStatus("parsing");
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
