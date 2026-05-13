import { useEffect } from "react";
import Board from "../Board";
import PlayAffect from "../effect";
import constants from "../constants";
import type { GameState } from "./types";
import type { Winner } from "./types";

interface CrownProps {
  value: Winner | undefined;
  handlePlayAgain: () => void;
}

function Crown({ value, handlePlayAgain }: CrownProps) {
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
        <button id="playAgainBtn" onClick={handlePlayAgain}>
          再玩一次
        </button>
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
      <button id="playAgainBtn" onClick={handlePlayAgain}>
        再玩一次
      </button>
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
        <Crown value={state.winner} handlePlayAgain={onPlayAgain} />
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
        {notice && (
          <div key={notice.id} className="game-notice">
            {notice.text}
          </div>
        )}
        <hr />
        {!state.winner && onUndo && <button onClick={onUndo}>悔棋</button>}
        {extraControls}
      </header>
    </div>
  );
}
