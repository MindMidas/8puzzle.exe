export type Tile = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "e";
export type Move = "left" | "right" | "up" | "down";
export type Algorithm = "bfs" | "dfs";
export type Difficulty = "easy" | "medium" | "hard";
export type StopReason = "cancelled" | null;
export type SolveMode = "fixed" | "auto";
export type AppMode = "free" | "challenge";
export type ChallengeBadgeId = "silver" | "gold" | "diamond" | "ascendant" | "immortal";

export type BoardState = [
  [Tile, Tile, Tile],
  [Tile, Tile, Tile],
  [Tile, Tile, Tile],
];

export interface SolveResult {
  solved: boolean;
  moves: Move[];
  elapsed: number;
  expanded: number;
  generated: number;
  depth: number | null;
  limit: number;
  stoppedReason?: StopReason | undefined;
}

export interface Run {
  id: number;
  key: string;
  algorithm: Algorithm;
  mode: SolveMode;
  maxDepth: number;
  board: BoardState;
  moves: Move[];
  solved: boolean;
  moveCount: number;
  elapsed: number;
  expanded: number;
  generated: number;
  depth: number | null;
  limit: number;
  stoppedReason: StopReason;
}

export interface ChallengeBoardResult {
  level: number;
  board: BoardState;
  shortestMoves: number;
}

export interface ChallengeProgress {
  unlockedLevel: number;
  bestMoves: Record<string, number>;
  badges: ChallengeBadgeId[];
}
