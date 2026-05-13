import { useCallback, useEffect, useRef, useState } from "react";
import constants from "../constants";
import { applyMove, applyReset, applyUndo, createInitialState } from "./gameLogic";
import type { GameState, Winner } from "./types";
import GameView, { type GameViewNotice } from "./GameView";
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
  renderExtraControls?: (state: GameState) => React.ReactNode;
  topBanner?: React.ReactNode;
  transport?: GameContainerTransport;
}

export default function GameContainer({
  extraControls,
  renderExtraControls,
  topBanner,
  transport,
}: GameContainerProps) {
  const [state, setState] = useState<GameState>(() => createInitialState(true));
  const [aLevel, setALevel] = useState(0);
  const [bLevel, setBLevel] = useState(0);
  const [notice, setNotice] = useState<GameViewNotice | null>(null);
  const [localWantsReset, setLocalWantsReset] = useState(false);
  const [remoteWantsReset, setRemoteWantsReset] = useState(false);
  const seqRef = useRef(0);
  const noticeIdRef = useRef(0);

  // P2P 再玩一次：两边都点击才真正重置；任一方对应字段被设置后，若另一方已是 true，本地立刻 applyReset
  useEffect(() => {
    if (!transport) return;
    if (localWantsReset && remoteWantsReset) {
      setState((s) => applyReset(s));
      setLocalWantsReset(false);
      setRemoteWantsReset(false);
    }
  }, [transport, localWantsReset, remoteWantsReset]);

  // 新局开始（winner 重新变成 undefined）时也确保 reset 旗子归零
  useEffect(() => {
    if (state.winner === undefined) {
      setLocalWantsReset(false);
      setRemoteWantsReset(false);
    }
  }, [state.winner]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 1500);
    return () => clearTimeout(t);
  }, [notice]);

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
      } else if (msg.type === "reset-request") {
        // 仅标记对方愿意再玩一次；上面的合意 effect 会在双方都 true 时触发 applyReset
        setRemoteWantsReset(true);
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
      if (transport && !isLocalTurn()) {
        noticeIdRef.current += 1;
        setNotice({ id: noticeIdRef.current, text: "轮到对方下子" });
        return;
      }
      // 先用当前 state 检验 move 是否会改变盘面；StrictMode 下 setState 的 updater
      // 会被调用两次，所以 send 必须放在 updater 外面，否则消息会被发送两次。
      const next = applyMove(state, col);
      if (next === state) return;
      setState(next);
      if (transport) {
        seqRef.current += 1;
        transport.send({ type: "move", col, seq: seqRef.current });
      }
    },
    [state, transport, isLocalTurn]
  );

  const handlePlayAgain = useCallback(() => {
    if (!transport) {
      setState((s) => applyReset(s));
      return;
    }
    if (localWantsReset) return; // 防重复点击
    setLocalWantsReset(true);
    seqRef.current += 1;
    transport.send({ type: "reset-request", seq: seqRef.current });
  }, [transport, localWantsReset]);

  const handleUndo = useCallback(() => {
    setState((s) => applyUndo(s));
  }, []);

  const playAgainState = !transport
    ? "idle"
    : localWantsReset && !remoteWantsReset
    ? "waiting-peer"
    : !localWantsReset && remoteWantsReset
    ? "peer-waiting"
    : "idle";

  return (
    <GameView
      state={state}
      aLevel={aLevel}
      bLevel={bLevel}
      onColumnClick={handleColumnClick}
      onPlayAgain={handlePlayAgain}
      onUndo={transport ? undefined : handleUndo}
      extraControls={renderExtraControls ? renderExtraControls(state) : extraControls}
      topBanner={topBanner}
      notice={notice}
      playAgainState={playAgainState}
    />
  );
}
