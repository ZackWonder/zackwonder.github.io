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
