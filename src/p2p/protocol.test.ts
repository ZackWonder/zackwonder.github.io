import { describe, expect, it } from "vitest";
import { buildInviteUrl, parseInviteHash } from "./protocol";

describe("buildInviteUrl", () => {
  it("includes #game prefix and encodes joiner role", () => {
    const u = buildInviteUrl("https://example.com", "#game", "abc123", "B");
    expect(u).toBe("https://example.com/#game?peer=abc123&role=red");
  });

  it("encodes joiner=A as blue", () => {
    const u = buildInviteUrl("https://example.com", "#game", "xyz", "A");
    expect(u).toBe("https://example.com/#game?peer=xyz&role=blue");
  });

  it("preserves #play route when host is on the standalone page", () => {
    const u = buildInviteUrl("https://example.com", "#play", "abc", "B");
    expect(u).toBe("https://example.com/#play?peer=abc&role=red");
  });
});

describe("parseInviteHash", () => {
  it("parses a valid invite hash with role=red -> joiner is B", () => {
    expect(parseInviteHash("#game?peer=abc&role=red")).toEqual({ peerId: "abc", role: "B" });
  });

  it("parses a valid invite hash with role=blue -> joiner is A", () => {
    expect(parseInviteHash("#game?peer=xyz&role=blue")).toEqual({ peerId: "xyz", role: "A" });
  });

  it("accepts the #play standalone route too", () => {
    expect(parseInviteHash("#play?peer=abc&role=red")).toEqual({ peerId: "abc", role: "B" });
  });

  it("returns null for plain #game", () => {
    expect(parseInviteHash("#game")).toBeNull();
  });

  it("returns null when peer missing", () => {
    expect(parseInviteHash("#game?role=red")).toBeNull();
  });

  it("returns null when role missing", () => {
    expect(parseInviteHash("#game?peer=abc")).toBeNull();
  });

  it("returns null when role is not red/blue", () => {
    expect(parseInviteHash("#game?peer=abc&role=green")).toBeNull();
  });

  it("returns null when hash is not #game or #play prefixed", () => {
    expect(parseInviteHash("#peer=abc&role=red")).toBeNull();
  });

  it("returns null for empty hash", () => {
    expect(parseInviteHash("")).toBeNull();
  });
});

describe("round trip", () => {
  it("buildInviteUrl + parseInviteHash inverts roles correctly on both routes", () => {
    for (const joinerRole of ["A", "B"] as const) {
      for (const route of ["#game", "#play"] as const) {
        const url = buildInviteUrl("https://x.test", route, "id-1", joinerRole);
        const parsed = parseInviteHash("#" + url.split("#")[1]!);
        expect(parsed).toEqual({ peerId: "id-1", role: joinerRole });
      }
    }
  });
});
