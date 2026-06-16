import type { Algorithm, BoardState, Difficulty, Move, Run, SolveMode, SolveResult } from "../types";

export const GOAL_STATE: BoardState = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "e"],
];

export const PUZZLE_PRESETS: Record<Difficulty, { boards: BoardState[]; shortestMoves: number }> = {
  easy: {
    boards: [
      [["1", "2", "3"], ["6", "e", "8"], ["5", "4", "7"]],
      [["e", "2", "3"], ["1", "6", "8"], ["5", "4", "7"]],
      [["1", "2", "3"], ["5", "8", "7"], ["4", "6", "e"]],
      [["1", "2", "e"], ["5", "8", "3"], ["4", "6", "7"]],
      [["1", "2", "3"], ["4", "5", "8"], ["e", "6", "7"]],
    ],
    shortestMoves: 10,
  },
  medium: {
    boards: [
      [["1", "2", "3"], ["e", "8", "7"], ["6", "5", "4"]],
      [["1", "2", "3"], ["6", "7", "e"], ["5", "8", "4"]],
      [["1", "2", "3"], ["e", "6", "7"], ["5", "8", "4"]],
      [["1", "e", "3"], ["6", "2", "7"], ["5", "8", "4"]],
      [["6", "1", "2"], ["e", "8", "3"], ["5", "4", "7"]],
    ],
    shortestMoves: 15,
  },
  hard: {
    boards: [
      [["8", "6", "7"], ["2", "5", "4"], ["3", "e", "1"]],
      [["6", "4", "7"], ["8", "5", "e"], ["3", "2", "1"]],
    ],
    shortestMoves: 31,
  },
};

export function puzzleForDifficulty(difficulty: Difficulty, exclude?: BoardState): BoardState {
  const boards = PUZZLE_PRESETS[difficulty].boards;
  const choices = exclude ? boards.filter(board => boardKey(board) !== boardKey(exclude)) : boards;
  return cloneBoard(choices[Math.floor(Math.random() * choices.length)] ?? boards[0]!);
}

export const MOVE_LABELS: Record<Move, string> = {
  left: "slide left",
  right: "slide right",
  up: "slide up",
  down: "slide down",
};

export function cloneBoard(board: BoardState): BoardState {
  return [
    [...board[0]],
    [...board[1]],
    [...board[2]],
  ];
}

export function boardKey(board: BoardState): string {
  return board.flat().join("");
}

export function isSolved(board: BoardState): boolean {
  return boardKey(board) === boardKey(GOAL_STATE);
}

export function findEmpty(board: BoardState): { row: number; col: number } {
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (board[row]?.[col] === "e") return { row, col };
    }
  }
  return { row: 2, col: 2 };
}

export function isSolvable(board: BoardState): boolean {
  const flat = board.flat().filter(tile => tile !== "e");
  let inversions = 0;
  for (let i = 0; i < flat.length; i += 1) {
    for (let j = i + 1; j < flat.length; j += 1) {
      if (Number(flat[i]) > Number(flat[j])) inversions += 1;
    }
  }
  return inversions % 2 === 0;
}

export function applyMove(board: BoardState, move: Move): BoardState | null {
  const next = cloneBoard(board);
  const { row, col } = findEmpty(next);
  const currentRow = next[row];
  if (!currentRow) return null;

  if (move === "left" && col > 0) {
    currentRow[col] = currentRow[col - 1]!;
    currentRow[col - 1] = "e";
    return next;
  }
  if (move === "right" && col < 2) {
    currentRow[col] = currentRow[col + 1]!;
    currentRow[col + 1] = "e";
    return next;
  }
  if (move === "up" && row > 0) {
    const above = next[row - 1];
    if (!above) return null;
    currentRow[col] = above[col]!;
    above[col] = "e";
    return next;
  }
  if (move === "down" && row < 2) {
    const below = next[row + 1];
    if (!below) return null;
    currentRow[col] = below[col]!;
    below[col] = "e";
    return next;
  }
  return null;
}

export function trySlideTile(board: BoardState, row: number, col: number): BoardState | null {
  const empty = findEmpty(board);
  const rowDelta = row - empty.row;
  const colDelta = col - empty.col;
  if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) return null;

  if (rowDelta === -1) return applyMove(board, "up");
  if (rowDelta === 1) return applyMove(board, "down");
  if (colDelta === -1) return applyMove(board, "left");
  return applyMove(board, "right");
}

export function createSolutionStates(start: BoardState, moves: Move[]): BoardState[] {
  const states: BoardState[] = [cloneBoard(start)];
  for (const move of moves) {
    const next = applyMove(states.at(-1) ?? start, move);
    if (next) states.push(next);
  }
  return states;
}

export function runKey(board: BoardState, algorithm: Algorithm, maxDepth: number, mode: SolveMode): string {
  return `${boardKey(board)}::${algorithm}::${maxDepth}::${mode}`;
}

export function createRun(
  id: number,
  board: BoardState,
  algorithm: Algorithm,
  mode: SolveMode,
  maxDepth: number,
  result: SolveResult,
): Run {
  return {
    id,
    key: runKey(board, algorithm, maxDepth, mode),
    algorithm,
    mode,
    maxDepth,
    board: cloneBoard(board),
    moves: result.moves,
    solved: result.solved,
    moveCount: result.solved ? result.moves.length : 0,
    elapsed: result.elapsed,
    expanded: result.expanded,
    generated: result.generated,
    depth: result.depth,
    limit: result.limit,
    stoppedReason: result.stoppedReason ?? null,
  };
}

export function algorithmLabel(algorithm: Algorithm): string {
  return algorithm.toUpperCase();
}
