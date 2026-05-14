import { useRef } from "react";
import "./Board.css";
import constants, { type Player } from "./constants";
import useSound from "./useSound";

interface SquareProps {
  value: Player | undefined;
  winned: boolean;
  isLastStep: boolean;
  isDropping: boolean;
  dropRows: number;
  aTurn: boolean;
  onClick: () => void;
}

function Square({ value, winned, isLastStep, isDropping, dropRows, aTurn, onClick }: SquareProps) {
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

  const [playActive] = useSound("./pop-down.mp3", { volume: 0.25 });
  const [playOn] = useSound("./pop-up-on.mp3", { volume: 0.25 });
  const [playOff] = useSound("./pop-up-off.mp3", { volume: 0.25 });

  // WeChat's WebView (X5) often intercepts touch as scroll before click fires.
  // Trigger the move directly on pointerdown for touch and suppress the
  // synthesized click. Mouse/keyboard still use the regular click handler.
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
            onClick();
          }
        }}
        onPointerUp={() => {
          if (aTurn) playOn();
          else playOff();
        }}
        onClick={() => {
          if (touchFiredRef.current) {
            touchFiredRef.current = false;
            return;
          }
          onClick();
        }}
      ></button>
    </span>
  );
}

type Point = [number, number];

interface BoardProps {
  w: number;
  h: number;
  squares: (Player | undefined)[][];
  lastStep: Point | undefined;
  droppingCell: Point | null;
  aTurn: boolean;
  winPoints: Point[] | undefined;
  onClick: (i: number, j: number) => void;
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
          aTurn={aTurn}
          onClick={() => onClick(col, row)}
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
