import { useEffect } from "react";
import Board from "../Board";
import PlayAffect from "../effect";
import constants from "../constants";
import type { GameState } from "./types";
import type { Winner } from "./types";

export type PlayAgainState = "idle" | "waiting-peer" | "peer-waiting";

interface CrownProps {
  value: Winner | undefined;
  handlePlayAgain: () => void;
  playAgainState: PlayAgainState;
}

function PlayAgainButton({
  handlePlayAgain,
  playAgainState,
}: {
  handlePlayAgain: () => void;
  playAgainState: PlayAgainState;
}) {
  if (playAgainState === "waiting-peer") {
    return (
      <button id="playAgainBtn" disabled>
        等待对方确认...
      </button>
    );
  }
  const label = playAgainState === "peer-waiting" ? "再玩一次（对方已确认）" : "再玩一次";
  return (
    <button id="playAgainBtn" onClick={handlePlayAgain}>
      {label}
    </button>
  );
}

function Crown({ value, handlePlayAgain, playAgainState }: CrownProps) {
  useEffect(() => {
    if (value) {
      const btn = document.querySelector(".crownSpan");
      if (btn instanceof HTMLElement) PlayAffect(btn);
    }
  }, [value]);

  if (!value) return null;

  if (value !== 3) {
    const cn = value === constants.PLAYER_A ? "playerA crown" : "playerB crown";
    return (
      <div className="crownDiv">
        <span className="crownSpan">
          <button className={cn}></button>
        </span>
        <br />
        贏了！
        <br />
        <PlayAgainButton handlePlayAgain={handlePlayAgain} playAgainState={playAgainState} />
        <hr />
      </div>
    );
  }

  return (
    <div className="crownDiv">
      <span className="crownSpan">
        <button className="playerA crown"></button>
        <button className="playerB crown"></button>
      </span>
      <br />
      <PlayAgainButton handlePlayAgain={handlePlayAgain} playAgainState={playAgainState} />
      <hr />
    </div>
  );
}

export interface GameViewNotice {
  id: number;
  text: string;
}

export interface GameViewProps {
  state: GameState;
  aLevel: number;
  bLevel: number;
  onColumnClick: (col: number) => void;
  onPlayAgain: () => void;
  onUndo?: () => void;
  topBanner?: React.ReactNode;
  extraControls?: React.ReactNode;
  notice?: GameViewNotice | null;
  playAgainState?: PlayAgainState;
}

export default function GameView({
  state,
  aLevel,
  bLevel,
  onColumnClick,
  onPlayAgain,
  onUndo,
  topBanner,
  extraControls,
  notice,
  playAgainState = "idle",
}: GameViewProps) {
  const lastStep = state.history.length > 0 ? state.history[state.history.length - 1] : undefined;
  return (
    <div
      className="App"
      style={{
        ["--playerA-img" as never]: `url('/tanson_${aLevel}.jpg')`,
        ["--playerB-img" as never]: `url('/sherly_${bLevel}.jpg')`,
      } as React.CSSProperties}
    >
      <header className="App-header">
        {topBanner}
        <Crown
          value={state.winner}
          handlePlayAgain={onPlayAgain}
          playAgainState={playAgainState}
        />
        <Board
          w={constants.WIDTH}
          h={constants.HEIGHT}
          squares={state.squares}
          lastStep={lastStep}
          droppingCell={state.droppingCell}
          aTurn={state.aTurn}
          winPoints={state.winPoints}
          onClick={(i) => onColumnClick(i)}
        />
        <div className="game-notice-slot">
          {notice && (
            <div key={notice.id} className="game-notice">
              {notice.text}
            </div>
          )}
        </div>
        <hr />
        {!state.winner && onUndo && <button onClick={onUndo}>悔棋</button>}
        {extraControls}
      </header>
    </div>
  );
}
