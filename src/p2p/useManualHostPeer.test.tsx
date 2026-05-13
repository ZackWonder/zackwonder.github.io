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
    await waitFor(() => expect(result.current.status).toBe("gathering"));

    const pc = FakeRTCPeerConnection.instances[0]!;
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
      result.current.send({ type: "reset-request", seq: 1 })
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
