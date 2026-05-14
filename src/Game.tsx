import { useCallback, useEffect, useMemo, useState } from "react";
import GameContainer from "./game/GameContainer";
import type { GameContainerTransport } from "./game/GameContainer";
import type { GameState } from "./game/types";
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
    const baseHash = window.location.hash.startsWith("#play") ? "#play" : "#game";
    history.replaceState(null, "", baseHash);
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
              🔗 对战
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
        topBanner={(state) =>
          hostRole && hasConnectedOnce ? (
            <ConnectionBanner
              localRole={hostRole}
              status={host.status}
              aTurn={state.aTurn}
              winner={state.winner}
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
    const route = window.location.hash.startsWith("#play") ? "#play" : "#game";
    return buildManualInviteUrl(window.location.origin, route, host.manualOffer, joinerRole);
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
        topBanner={(state) =>
          host.status === "connected" || host.status === "disconnected" ? (
            <ConnectionBanner
              localRole={hostRole}
              status={host.status}
              aTurn={state.aTurn}
              winner={state.winner}
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
      <div className="game-status-screen">
        <p style={{ color: "#e57373" }}>连接失败，请联系发起方重新分享链接</p>
        <button onClick={onLeave}>返回单机</button>
      </div>
    );
  }

  if (!hasConnected) {
    return (
      <div className="game-status-screen">
        <p>正在连接对方...</p>
        <button onClick={onLeave}>取消</button>
      </div>
    );
  }

  return (
    <GameContainer
      transport={transport}
      topBanner={(state) => (
        <ConnectionBanner
          localRole={role}
          status={join.status}
          aTurn={state.aTurn}
          winner={state.winner}
          onLeave={onLeave}
        />
      )}
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
      <div className="game-status-screen">
        <p style={{ color: "#e57373" }}>邀请数据无效，或浏览器不支持手动模式</p>
        <p style={{ color: "#999", fontSize: "0.9em" }}>{join.error}</p>
        <button onClick={onLeave}>返回单机</button>
      </div>
    );
  }

  if (!hasConnected) {
    if (join.manualAnswer) {
      return (
        <div className="game-status-screen" style={{ padding: "0 16px" }}>
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
      <div className="game-status-screen">
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
      topBanner={(state) => (
        <ConnectionBanner
          localRole={role}
          status={join.status}
          aTurn={state.aTurn}
          winner={state.winner}
          onLeave={onLeave}
        />
      )}
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
  aTurn: boolean;
  winner: GameState["winner"];
  onLeave: () => void;
}

function ConnectionBanner({
  localRole,
  status,
  aTurn,
  winner,
  onLeave,
}: ConnectionBannerProps) {
  const disconnected = status === "disconnected" || status === "failed";
  const isLocalTurn = aTurn === (localRole === "A");
  const showTurn = !disconnected && winner === undefined;
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
          minHeight: 20,
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
        {disconnected ? (
          "对方已断开"
        ) : showTurn ? (
          isLocalTurn ? (
            <span className="turn-indicator turn-mine">轮到你了</span>
          ) : (
            <span className="turn-indicator turn-theirs">轮到对方</span>
          )
        ) : null}
      </div>
      <button className="p2p-fab" onClick={onLeave}>
        返回单机
      </button>
    </>
  );
}
