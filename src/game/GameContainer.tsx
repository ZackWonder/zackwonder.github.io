import { useCallback, useEffect, useRef, useState } from "react";
import constants from "../constants";
import { applyMove, applyReset, applyUndo, createInitialState } from "./gameLogic";
import type { GameState, Winner } from "./types";
import GameView from "./GameView";
import type { PeerMessage, PlayerRole } from "../p2p/protocol";

function playWinSound(winner: Winner) {
  const soundMap: Record<number, string> = {
    [constants.PLAYER_A]: "./tansonwin.mp3",
    [constants.PLAYER_B]: "./sherlywin.mp3",
    3: "./allwin.mp3",
  };
  const url = soundMap[winner];
  if (url) {
    const audio = new Audio(url);
    audio.volume = 0.25;
    audio.play().catch(() => {});
  }
}

type AvatarSlot = {
  name: "tanson" | "sherly";
  level: number;
  setLevel: (n: number) => void;
};

function probeNextLevel(slot: AvatarSlot): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = `/${slot.name}_${slot.level + 1}.jpg`;
  });
}

async function tryUpgradeOrReset(winner: AvatarSlot, loser: AvatarSlot): Promise<void> {
  const winnerHasNext = await probeNextLevel(winner);
  if (winnerHasNext) {
    winner.setLevel(winner.level + 1);
    return;
  }
  const loserHasNext = await probeNextLevel(loser);
  if (!loserHasNext) {
    winner.setLevel(0);
    loser.setLevel(0);
  }
}

export interface GameContainerTransport {
  send: (msg: PeerMessage) => void;
  onMessage: (handler: (msg: PeerMessage) => void) => () => void;
  localRole: PlayerRole;
}

export interface GameContainerProps {
  extraControls?: React.ReactNode;
  topBanner?: React.ReactNode;
  transport?: GameContainerTransport;
}

export default function GameContainer({ extraControls, topBanner, transport }: GameContainerProps) {
  const [state, setState] = useState<GameState>(() => createInitialState(true));
  const [aLevel, setALevel] = useState(0);
  const [bLevel, setBLevel] = useState(0);
  const seqRef = useRef(0);

  // 落子后处理胜利音效 + 头像升级（observe 模式：在 state.winner 变化时触发）
  useEffect(() => {
    if (state.winner === undefined) return;
    playWinSound(state.winner);
    if (state.winner === 3) return;
    const slotA: AvatarSlot = { name: "tanson", level: aLevel, setLevel: setALevel };
    const slotB: AvatarSlot = { name: "sherly", level: bLevel, setLevel: setBLevel };
    if (state.winner === constants.PLAYER_A) void tryUpgradeOrReset(slotA, slotB);
    else void tryUpgradeOrReset(slotB, slotA);
  }, [state.winner]); // 故意只 watch winner

  // 清掉 droppingCell 的动画状态
  useEffect(() => {
    if (state.droppingCell === null) return;
    const t = setTimeout(() => {
      setState((s) => (s.droppingCell ? { ...s, droppingCell: null } : s));
    }, 400);
    return () => clearTimeout(t);
  }, [state.droppingCell]);

  // P2P: 订阅对方消息
  useEffect(() => {
    if (!transport) return;
    const unsub = transport.onMessage((msg) => {
      if (msg.type === "move") {
        setState((s) => applyMove(s, msg.col));
      } else if (msg.type === "reset") {
        setState((s) => applyReset(s));
      }
    });
    return unsub;
  }, [transport]);

  const isLocalTurn = useCallback(() => {
    if (!transport) return true;
    const localIsA = transport.localRole === "A";
    return state.aTurn === localIsA;
  }, [state.aTurn, transport]);

  const handleColumnClick = useCallback(
    (col: number) => {
      if (transport && !isLocalTurn()) return;
      setState((s) => {
        const next = applyMove(s, col);
        if (next !== s && transport) {
          seqRef.current += 1;
          transport.send({ type: "move", col, seq: seqRef.current });
        }
        return next;
      });
    },
    [transport, isLocalTurn]
  );

  const handlePlayAgain = useCallback(() => {
    setState((s) => applyReset(s));
    if (transport) {
      seqRef.current += 1;
      transport.send({ type: "reset", seq: seqRef.current });
    }
  }, [transport]);

  const handleUndo = useCallback(() => {
    setState((s) => applyUndo(s));
  }, []);

  return (
    <GameView
      state={state}
      aLevel={aLevel}
      bLevel={bLevel}
      onColumnClick={handleColumnClick}
      onPlayAgain={handlePlayAgain}
      onUndo={transport ? undefined : handleUndo}
      extraControls={extraControls}
      topBanner={topBanner}
    />
  );
}
