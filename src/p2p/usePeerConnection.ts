import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import { isPeerMessage, type PeerMessage } from "./protocol";

export type PeerStatus =
  | "init"
  | "awaiting"
  | "dialing"
  | "connected"
  | "disconnected"
  | "failed";

export interface UsePeerConnectionResult {
  status: PeerStatus;
  peerId: string | null;
  error: string | null;
  send: (msg: PeerMessage) => void;
  onMessage: (handler: (msg: PeerMessage) => void) => () => void;
}

function bindConnection(
  conn: DataConnection,
  listenersRef: React.MutableRefObject<Set<(msg: PeerMessage) => void>>,
  setStatus: (s: PeerStatus) => void,
  setError: (s: string | null) => void
) {
  conn.on("open", () => setStatus("connected"));
  conn.on("data", (data) => {
    if (!isPeerMessage(data)) {
      console.warn("[p2p] dropping unknown message", data);
      return;
    }
    listenersRef.current.forEach((cb) => cb(data));
  });
  conn.on("close", () => setStatus("disconnected"));
  conn.on("error", (e) => {
    setError(e.message ?? String(e));
    setStatus("disconnected");
  });
}

export function useHostPeer(): UsePeerConnectionResult {
  const [status, setStatus] = useState<PeerStatus>("init");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const listenersRef = useRef<Set<(msg: PeerMessage) => void>>(new Set());

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", (id) => {
      setPeerId(id);
      setStatus("awaiting");
    });

    peer.on("connection", (conn) => {
      if (connRef.current) {
        conn.close();
        return;
      }
      connRef.current = conn;
      bindConnection(conn, listenersRef, setStatus, setError);
    });

    peer.on("error", (e) => {
      setError(e.message ?? String(e));
      setStatus("failed");
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
      connRef.current = null;
    };
  }, []);

  const send = useCallback((msg: PeerMessage) => {
    const conn = connRef.current;
    if (!conn || !conn.open) {
      console.warn("[p2p] send before ready", msg);
      return;
    }
    conn.send(msg);
  }, []);

  const onMessage = useCallback((handler: (msg: PeerMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  return { status, peerId, error, send, onMessage };
}

export function useJoinPeer(remotePeerId: string): UsePeerConnectionResult {
  const [status, setStatus] = useState<PeerStatus>("init");
  const [error, setError] = useState<string | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const listenersRef = useRef<Set<(msg: PeerMessage) => void>>(new Set());

  useEffect(() => {
    const peer = new Peer();
    peerRef.current = peer;

    peer.on("open", () => {
      setStatus("dialing");
      const conn = peer.connect(remotePeerId);
      connRef.current = conn;
      bindConnection(conn, listenersRef, setStatus, setError);
    });

    peer.on("error", (e) => {
      setError(e.message ?? String(e));
      setStatus("failed");
    });

    return () => {
      peer.destroy();
      peerRef.current = null;
      connRef.current = null;
    };
  }, [remotePeerId]);

  const send = useCallback((msg: PeerMessage) => {
    const conn = connRef.current;
    if (!conn || !conn.open) {
      console.warn("[p2p] send before ready", msg);
      return;
    }
    conn.send(msg);
  }, []);

  const onMessage = useCallback((handler: (msg: PeerMessage) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  return { status, peerId: null, error, send, onMessage };
}
