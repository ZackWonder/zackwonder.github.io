import type { Player } from "../constants";

export type Point = [number, number];

export type Winner = Player | 3;

export type Cell = Player | undefined;

export type Board = Cell[][];

export interface GameState {
  squares: Board;
  history: Point[];
  aTurn: boolean;
  aIsStarter: boolean;
  winner: Winner | undefined;
  winPoints: Point[] | undefined;
  droppingCell: Point | null;
}
