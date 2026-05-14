import { describe, expect, it } from "vitest";
import constants from "../constants";
import {
  createEmptyBoard,
  dropInColumn,
  linePoints,
  findWinLines,
  createInitialState,
  applyMove,
  applyReset,
} from "./gameLogic";

describe("createEmptyBoard", () => {
  it("returns WIDTH columns each of HEIGHT undefined cells", () => {
    const b = createEmptyBoard();
    expect(b).toHaveLength(constants.WIDTH);
    expect(b[0]).toHaveLength(constants.HEIGHT);
    expect(b.every((col) => col.every((c) => c === undefined))).toBe(true);
  });
});

describe("dropInColumn", () => {
  it("places the player in the first empty slot and returns its row", () => {
    const col = [undefined, undefined, undefined, undefined, undefined, undefined];
    const row = dropInColumn(constants.PLAYER_A, col);
    expect(row).toBe(0);
    expect(col[0]).toBe(constants.PLAYER_A);
  });

  it("stacks on top of existing pieces", () => {
    const col = [constants.PLAYER_A, undefined, undefined, undefined, undefined, undefined];
    const row = dropInColumn(constants.PLAYER_B, col);
    expect(row).toBe(1);
    expect(col[1]).toBe(constants.PLAYER_B);
  });

  it("returns undefined when column is full", () => {
    const col = Array(constants.HEIGHT).fill(constants.PLAYER_A);
    const row = dropInColumn(constants.PLAYER_B, col);
    expect(row).toBeUndefined();
  });
});

describe("findWinLines", () => {
  it("detects 4 in a row horizontally", () => {
    const board = createEmptyBoard();
    for (let i = 0; i < 4; i++) board[i]![0] = constants.PLAYER_A;
    const lines = findWinLines(board, 3, 0);
    expect(lines).toHaveLength(1);
    expect(lines![0]).toHaveLength(4);
  });

  it("detects 4 in a row vertically", () => {
    const board = createEmptyBoard();
    for (let j = 0; j < 4; j++) board[0]![j] = constants.PLAYER_A;
    expect(findWinLines(board, 0, 3)).toHaveLength(1);
  });

  it("detects 4 in a row diagonal /", () => {
    const board = createEmptyBoard();
    for (let k = 0; k < 4; k++) board[k]![k] = constants.PLAYER_A;
    expect(findWinLines(board, 3, 3)).toHaveLength(1);
  });

  it("detects 4 in a row diagonal \\\\", () => {
    const board = createEmptyBoard();
    for (let k = 0; k < 4; k++) board[k]![3 - k] = constants.PLAYER_A;
    expect(findWinLines(board, 3, 0)).toHaveLength(1);
  });

  it("returns undefined when there's no line of 4", () => {
    const board = createEmptyBoard();
    board[0]![0] = constants.PLAYER_A;
    expect(findWinLines(board, 0, 0)).toBeUndefined();
  });

  it("detects multiple winning lines through the same point", () => {
    // Horizontal + diagonal / through (3, 3)
    const board = createEmptyBoard();
    // horizontal at row 3: (0,3) (1,3) (2,3) (3,3) (4,3)
    for (let i = 0; i <= 4; i++) board[i]![3] = constants.PLAYER_A;
    // diagonal /: (0,0) (1,1) (2,2) (3,3)
    for (let k = 0; k < 3; k++) board[k]![k] = constants.PLAYER_A;
    const lines = findWinLines(board, 3, 3);
    expect(lines).toHaveLength(2);
  });
});

describe("linePoints", () => {
  it("returns 1 point when standalone", () => {
    const board = createEmptyBoard();
    board[0]![0] = constants.PLAYER_A;
    expect(linePoints(board, 0, 0, 1, 0)).toHaveLength(1);
  });
});

describe("applyMove", () => {
  it("places a piece and toggles turn on a valid move", () => {
    const s = createInitialState(true);
    const next = applyMove(s, 0);
    expect(next).not.toBe(s);
    expect(next.squares[0]![0]).toBe(constants.PLAYER_A);
    expect(next.aTurn).toBe(false);
    expect(next.history).toEqual([[0, 0]]);
    expect(next.droppingCell).toEqual([0, 0]);
  });

  it("returns the same state when the column is full", () => {
    let s = createInitialState(true);
    for (let i = 0; i < constants.HEIGHT; i++) s = applyMove(s, 0);
    const full = applyMove(s, 0);
    expect(full).toBe(s);
  });

  it("detects a horizontal win", () => {
    let s = createInitialState(true);
    s = applyMove(s, 0);
    s = applyMove(s, 0);
    s = applyMove(s, 1);
    s = applyMove(s, 1);
    s = applyMove(s, 2);
    s = applyMove(s, 2);
    s = applyMove(s, 3);
    expect(s.winner).toBe(constants.PLAYER_A);
    expect(s.winLines).toBeDefined();
  });

  it("locks the board after a winner is set", () => {
    let s = createInitialState(true);
    s = applyMove(s, 0);
    s = applyMove(s, 1);
    s = applyMove(s, 0);
    s = applyMove(s, 1);
    s = applyMove(s, 0);
    s = applyMove(s, 1);
    s = applyMove(s, 0);
    expect(s.winner).toBe(constants.PLAYER_A);
    const after = applyMove(s, 2);
    expect(after).toBe(s);
  });
});

describe("applyReset", () => {
  it("alternates starter on reset", () => {
    let s = createInitialState(true);
    s = applyMove(s, 0);
    const reset = applyReset(s);
    expect(reset.aIsStarter).toBe(false);
    expect(reset.aTurn).toBe(false);
    expect(reset.squares).toEqual(createEmptyBoard());
    expect(reset.history).toEqual([]);
    expect(reset.winner).toBeUndefined();
  });
});
