import { memo, useCallback, useRef } from "react";
import "./Board.css";
import constants, { type Player } from "./constants";
import useSound from "./useSound";

interface SquareProps {
  value: Player | undefined;
  winned: boolean;
  isLastStep: boolean;
  isDropping: boolean;
  dropRows: number;
  col: number;
  onColumnClick: (col: number) => void;
  playActive: () => void;
  playPointerUp: () => void;
}

const Square = memo(function Square({
  value,
  winned,
  isLastStep,
  isDropping,
  dropRows,
  col,
  onColumnClick,
  playActive,
  playPointerUp,
}: SquareProps) {
  let cn = "square";
  if (value !== undefined) {
    cn += value === constants.PLAYER_A ? " playerA" : " playerB";
    if (winned) {
      cn += " winned";
    }
    if (isDropping) {
      cn += " dropping";
    }
  }

  const touchFiredRef = useRef(false);

  return (
    <span>
      {isLastStep && !winned && <span className="lastStep"></span>}
      <button
        className={cn}
        style={isDropping ? { '--drop-rows': dropRows } as React.CSSProperties : undefined}
        onPointerDown={(e) => {
          playActive();
          if (e.pointerType === "touch") {
            touchFiredRef.current = true;
            onColumnClick(col);
          }
        }}
        onPointerUp={playPointerUp}
        onClick={() => {
          if (touchFiredRef.current) {
            touchFiredRef.current = false;
            return;
          }
          onColumnClick(col);
        }}
      ></button>
    </span>
  );
});

type Point = [number, number];

interface BoardProps {
  w: number;
  h: number;
  squares: (Player | undefined)[][];
  lastStep: Point | undefined;
  droppingCell: Point | null;
  aTurn: boolean;
  winPoints: Point[] | undefined;
  onClick: (col: number) => void;
}

export default function Board({
  w,
  h,
  squares,
  lastStep,
  droppingCell,
  aTurn,
  winPoints,
  onClick,
}: BoardProps) {
  // Sounds hoisted out of Square: 1 Audio per sound (was 49 × 3 = 147)
  const [playActive] = useSound("./pop-down.mp3", { volume: 0.25 });
  const [playOn] = useSound("./pop-up-on.mp3", { volume: 0.25 });
  const [playOff] = useSound("./pop-up-off.mp3", { volume: 0.25 });

  // aTurn 变化时若直接当 Square 的 prop，每步都会让全部 49 颗格子失效重渲染。
  // 用 ref 持有最新值，让 onPointerUp callback 引用稳定，memo 才能跳过未变化的格子。
  const aTurnRef = useRef(aTurn);
  aTurnRef.current = aTurn;
  const playPointerUp = useCallback(() => {
    if (aTurnRef.current) playOn();
    else playOff();
  }, [playOn, playOff]);

  const rows = [];
  for (let row = h - 1; row >= 0; --row) {
    const cols = [];
    for (let col = 0; col < w; ++col) {
      const pointValue = squares[col]![row];
      let winned = false;
      if (winPoints && pointValue) {
        winned = winPoints.some((v) => v[0] === col && v[1] === row);
      }
      const isLastStep =
        lastStep !== undefined && lastStep[0] === col && lastStep[1] === row;
      const isDropping =
        droppingCell !== null && droppingCell[0] === col && droppingCell[1] === row;

      cols.push(
        <Square
          key={col * w + row}
          value={pointValue}
          winned={winned}
          isLastStep={isLastStep}
          isDropping={isDropping}
          dropRows={constants.HEIGHT - 1 - row}
          col={col}
          onColumnClick={onClick}
          playActive={playActive}
          playPointerUp={playPointerUp}
        />
      );
    }
    rows.push(
      <div key={row} className="board-row">
        {cols}
      </div>
    );
  }
  return (
    <div className="board-stage">
      <div className="board-frame">{rows}</div>
    </div>
  );
}
