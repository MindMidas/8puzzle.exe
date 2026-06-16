import type { BoardState, ChallengeBoardResult, Difficulty, Move, SolveResult, StopReason, Tile } from "./types";

const MOVES: ReadonlySet<string> = new Set(["left", "right", "up", "down"]);
const TILES: ReadonlySet<string> = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "e"]);
const DIFFICULTIES: ReadonlySet<string> = new Set(["easy", "medium", "hard"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function isMove(value: string): value is Move {
  return MOVES.has(value);
}

function isTile(value: string): value is Tile {
  return TILES.has(value);
}

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.has(value);
}

export function parseBoard(value: unknown): BoardState | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const rows = value.map(row => {
    if (!Array.isArray(row) || row.length !== 3) return null;
    const tiles = row.map(String);
    if (!tiles.every(isTile)) return null;
    return tiles as [Tile, Tile, Tile];
  });
  if (rows.some(row => row === null)) return null;
  const [first, second, third] = rows;
  if (!first || !second || !third) return null;
  return [first, second, third];
}

export function parseSolveResult(value: unknown): SolveResult {
  if (!isRecord(value)) throw new Error("Invalid solve response.");
  const expanded = finiteNumber(value["expanded"], finiteNumber(value["visited"]));
  const moves = value["moves"];
  const parsedMoves = Array.isArray(moves) ? moves.map(String).filter(isMove) : [];
  const solved = Boolean(value["solved"]);
  const depth = integerOrNull(value["depth"]) ?? (solved ? parsedMoves.length : null);
  return {
    solved,
    moves: parsedMoves,
    elapsed: finiteNumber(value["elapsed"]),
    expanded,
    generated: finiteNumber(value["generated"]),
    depth,
    limit: finiteNumber(value["limit"]),
    stoppedReason: parseStopReason(value["stoppedReason"]),
  };
}

export function parseShuffleResult(value: unknown): {
  board: BoardState;
  difficulty: Difficulty;
  shortestMoves: number;
} {
  if (!isRecord(value)) throw new Error("Invalid shuffle response.");
  const board = parseBoard(value["board"]);
  const difficulty = value["difficulty"];
  const shortestMoves = value["shortestMoves"];
  if (!board) throw new Error("Invalid shuffle board.");
  if (typeof difficulty !== "string" || !isDifficulty(difficulty)) {
    throw new Error("Invalid shuffle difficulty.");
  }
  if (typeof shortestMoves !== "number") throw new Error("Invalid shuffle depth.");
  return {
    board,
    difficulty,
    shortestMoves,
  };
}

export function parseChallengeBoardResult(value: unknown): ChallengeBoardResult {
  if (!isRecord(value)) throw new Error("Invalid challenge response.");
  const board = parseBoard(value["board"]);
  const level = value["level"];
  const shortestMoves = value["shortestMoves"];
  if (!board) throw new Error("Invalid challenge board.");
  if (typeof level !== "number" || !Number.isInteger(level)) {
    throw new Error("Invalid challenge level.");
  }
  if (typeof shortestMoves !== "number" || !Number.isInteger(shortestMoves)) {
    throw new Error("Invalid challenge depth.");
  }
  return {
    level,
    board,
    shortestMoves,
  };
}

export function boardToApi(board: BoardState): string[][] {
  return board.map(row => [...row]);
}

export function parseStopReason(value: unknown): StopReason {
  return value === "cancelled" ? "cancelled" : null;
}
