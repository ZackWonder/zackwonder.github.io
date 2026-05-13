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
