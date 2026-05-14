import constants, { type Player } from "../constants";
import type { Board, Cell, GameState, Point, Winner } from "./types";

export function createEmptyBoard(): Board {
  return Array.from({ length: constants.WIDTH }, () =>
    new Array<Cell>(constants.HEIGHT).fill(undefined)
  );
}

export function dropInColumn(player: Player, col: Cell[]): number | undefined {
  for (let i = 0; i < col.length; i++) {
    if (col[i] === undefined) {
      col[i] = player;
      return i;
    }
  }
  return undefined;
}

export function linePoints(
  square: Board,
  x1: number,
  y1: number,
  dx: number,
  dy: number
): Point[] {
  const points: Point[] = [[x1, y1]];
  const v = square[x1]![y1];
  for (
    let i = x1 + dx, j = y1 + dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i += dx, j += dy
  ) {
    if (square[i]![j] === v) points.push([i, j]);
    else break;
  }
  for (
    let i = x1 - dx, j = y1 - dy;
    i < constants.WIDTH && i >= 0 && j < constants.HEIGHT && j >= 0;
    i -= dx, j -= dy
  ) {
    if (square[i]![j] === v) points.push([i, j]);
    else break;
  }
  // 按位置排序，让连线高光动画沿着自然方向（左→右、下→上）逐颗揭示
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return points;
}

export function findWinLines(
  square: Board,
  x1: number,
  y1: number
): Point[][] | undefined {
  const directions: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  const lines: Point[][] = [];
  for (const [dx, dy] of directions) {
    const points = linePoints(square, x1, y1, dx, dy);
    if (points.length >= 4) lines.push(points);
  }
  return lines.length > 0 ? lines : undefined;
}

export function createInitialState(aIsStarter: boolean): GameState {
  return {
    squares: createEmptyBoard(),
    history: [],
    aTurn: aIsStarter,
    aIsStarter,
    winner: undefined,
    winLines: undefined,
    droppingCell: null,
  };
}

export function applyMove(state: GameState, columnIndex: number): GameState {
  if (state.winner !== undefined) return state;
  if (state.squares[columnIndex]?.[constants.HEIGHT - 1] !== undefined) return state;

  const newSquares = state.squares.map((c) => [...c]);
  const player = state.aTurn ? constants.PLAYER_A : constants.PLAYER_B;
  const droppedJ = dropInColumn(player, newSquares[columnIndex]!);
  if (droppedJ === undefined) return state;

  const newHistory: Point[] = [...state.history, [columnIndex, droppedJ]];
  const newWinLines = findWinLines(newSquares, columnIndex, droppedJ);

  let newWinner: Winner | undefined = undefined;
  if (newWinLines) newWinner = player;
  else if (newSquares.every((col) => col[constants.HEIGHT - 1] !== undefined))
    newWinner = 3;

  return {
    ...state,
    squares: newSquares,
    history: newHistory,
    aTurn: !state.aTurn,
    winner: newWinner,
    winLines: newWinLines,
    droppingCell: [columnIndex, droppedJ],
  };
}

export function applyReset(state: GameState): GameState {
  return createInitialState(!state.aIsStarter);
}

export function applyUndo(state: GameState): GameState {
  if (state.history.length === 0) return state;
  const last = state.history[state.history.length - 1]!;
  const newSquares = state.squares.map((c) => [...c]);
  newSquares[last[0]]![last[1]] = undefined;
  return {
    ...state,
    squares: newSquares,
    history: state.history.slice(0, -1),
    aTurn: !state.aTurn,
    droppingCell: null,
  };
}
