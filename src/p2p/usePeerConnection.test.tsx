import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeerMessage } from "./protocol";

type Handler = (...args: unknown[]) => void;

const { FakeDataConnection, FakePeer } = vi.hoisted(() => {
  class FakeDataConnection {
    open = true;
    handlers = new Map<string, Handler[]>();
    sent: PeerMessage[] = [];
    on(ev: string, cb: Handler) {
      if (!this.handlers.has(ev)) this.handlers.set(ev, []);
      this.handlers.get(ev)!.push(cb);
    }
    emit(ev: string, payload?: unknown) {
      (this.handlers.get(ev) ?? []).forEach((h) => h(payload));
    }
    send(msg: PeerMessage) {
      this.sent.push(msg);
    }
    close() {
      this.open = false;
      this.emit("close");
    }
  }

  class FakePeer {
    handlers = new Map<string, Handler[]>();
    destroyed = false;
    constructor(public id?: string) {
      FakePeer.instances.push(this);
    }
    static instances: FakePeer[] = [];
    on(ev: string, cb: Handler) {
      if (!this.handlers.has(ev)) this.handlers.set(ev, []);
      this.handlers.get(ev)!.push(cb);
    }
    emit(ev: string, payload?: unknown) {
      (this.handlers.get(ev) ?? []).forEach((h) => h(payload));
    }
    connect(_: string): FakeDataConnection {
      const conn = new FakeDataConnection();
      this.lastConn = conn;
      return conn;
    }
    lastConn?: FakeDataConnection;
    destroy() {
      this.destroyed = true;
    }
  }

  return { FakeDataConnection, FakePeer };
});

vi.mock("peerjs", () => ({ default: FakePeer }));

import { useHostPeer, useJoinPeer } from "./usePeerConnection";

beforeEach(() => {
  FakePeer.instances = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useHostPeer", () => {
  it("transitions init → awaiting → connected", () => {
    const { result } = renderHook(() => useHostPeer());
    expect(result.current.status).toBe("init");
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("open", "host-id-1"));
    expect(result.current.status).toBe("awaiting");
    expect(result.current.peerId).toBe("host-id-1");

    const conn = new FakeDataConnection();
    act(() => peer.emit("connection", conn));
    act(() => conn.emit("open"));
    expect(result.current.status).toBe("connected");
  });

  it("rejects a second incoming connection", () => {
    const { result } = renderHook(() => useHostPeer());
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("open", "host-id-1"));

    const c1 = new FakeDataConnection();
    act(() => peer.emit("connection", c1));
    act(() => c1.emit("open"));

    const c2 = new FakeDataConnection();
    act(() => peer.emit("connection", c2));
    expect(c2.open).toBe(false);
    expect(result.current.status).toBe("connected");
  });

  it("disconnect transitions to disconnected", () => {
    const { result } = renderHook(() => useHostPeer());
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("open", "host-id-1"));
    const conn = new FakeDataConnection();
    act(() => peer.emit("connection", conn));
    act(() => conn.emit("open"));
    act(() => conn.emit("close"));
    expect(result.current.status).toBe("disconnected");
  });

  it("delivers messages to subscribers and unsubscribes", () => {
    const { result } = renderHook(() => useHostPeer());
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("open", "host-id-1"));
    const conn = new FakeDataConnection();
    act(() => peer.emit("connection", conn));
    act(() => conn.emit("open"));

    const received: PeerMessage[] = [];
    let unsubscribe: (() => void) | undefined;
    act(() => {
      unsubscribe = result.current.onMessage((m) => received.push(m));
    });
    act(() => conn.emit("data", { type: "move", col: 3, seq: 1 }));
    expect(received).toEqual([{ type: "move", col: 3, seq: 1 }]);

    act(() => unsubscribe!());
    act(() => conn.emit("data", { type: "move", col: 2, seq: 2 }));
    expect(received).toHaveLength(1);
  });

  it("send before connection ready does not throw", () => {
    const { result } = renderHook(() => useHostPeer());
    expect(() => result.current.send({ type: "reset", seq: 1 })).not.toThrow();
  });

  it("cleans up the peer on unmount", () => {
    const { unmount } = renderHook(() => useHostPeer());
    const peer = FakePeer.instances[0]!;
    unmount();
    expect(peer.destroyed).toBe(true);
  });
});

describe("useJoinPeer", () => {
  it("dials the remote peer and transitions to connected", () => {
    const { result } = renderHook(() => useJoinPeer("remote-id"));
    expect(result.current.status).toBe("init");
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("open", "joiner-self-id"));
    expect(result.current.status).toBe("dialing");
    const conn = peer.lastConn!;
    act(() => conn.emit("open"));
    expect(result.current.status).toBe("connected");
  });

  it("failed peer.error transitions to failed", () => {
    const { result } = renderHook(() => useJoinPeer("remote-id"));
    const peer = FakePeer.instances[0]!;
    act(() => peer.emit("error", { type: "peer-unavailable", message: "no host" }));
    expect(result.current.status).toBe("failed");
  });
});
