import { useCallback, useEffect, useMemo, useState } from "react";
import GameContainer from "./game/GameContainer";
import type { GameContainerTransport } from "./game/GameContainer";
import InviteModal from "./p2p/InviteModal";
import { useHostPeer, useJoinPeer, type UsePeerConnectionResult } from "./p2p/usePeerConnection";
import { parseInviteHash, type PlayerRole } from "./p2p/protocol";

type Mode =
  | { kind: "single" }
  | { kind: "host" }
  | { kind: "join"; remotePeerId: string; role: PlayerRole };

export default function GameApp() {
  const [mode, setMode] = useState<Mode>(() => {
    const params = parseInviteHash(window.location.hash);
    if (params) return { kind: "join", remotePeerId: params.peerId, role: params.role };
    return { kind: "single" };
  });

  const handleLeave = useCallback(() => {
    history.replaceState(null, "", "#game");
    setMode({ kind: "single" });
  }, []);

  if (mode.kind === "single") {
    return (
      <GameContainer
        extraControls={
          <button
            id="p2pBtn"
            style={{ marginLeft: 8 }}
            onClick={() => setMode({ kind: "host" })}
          >
            🔗 P2P 对战
          </button>
        }
      />
    );
  }

  if (mode.kind === "host") {
    return <HostFlow onLeave={handleLeave} />;
  }

  return <JoinerFlow remotePeerId={mode.remotePeerId} role={mode.role} onLeave={handleLeave} />;
}

function HostFlow({ onLeave }: { onLeave: () => void }) {
  const host = useHostPeer();
  const [hostRole, setHostRole] = useState<PlayerRole | null>(null);
  const transport = useTransport(host, hostRole);
  const hasConnectedOnce = host.status === "connected" || host.status === "disconnected";
  const showModal = !hasConnectedOnce;

  return (
    <>
      <GameContainer
        transport={transport}
        topBanner={
          hostRole && hasConnectedOnce ? (
            <ConnectionBanner localRole={hostRole} status={host.status} onLeave={onLeave} />
          ) : null
        }
      />
      {showModal && (
        <InviteModal
          hostPeerId={host.peerId}
          hostStatus="awaiting"
          hostRole={hostRole}
          onChooseRole={setHostRole}
          onCancel={onLeave}
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
      topBanner={<ConnectionBanner localRole={role} status={join.status} onLeave={onLeave} />}
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
      <button style={{ marginLeft: 12 }} onClick={onLeave}>
        返回单机
      </button>
    </div>
  );
}
