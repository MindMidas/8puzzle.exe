import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { boardToApi, isDifficulty, isRecord, parseChallengeBoardResult, parseShuffleResult, parseSolveResult } from "../solverClient";
import type {
  Algorithm,
  AppMode,
  BoardState,
  ChallengeBadgeId,
  ChallengeProgress,
  Difficulty,
  Run,
  SolveResult,
} from "../types";
import { Board } from "./components/Board";
import { Header } from "./components/Header";
import { Results } from "./components/Results";
import { SolverPanel } from "./components/SolverPanel";
import {
  PUZZLE_PRESETS,
  cloneBoard,
  createRun,
  createSolutionStates,
  isSolved,
  puzzleForDifficulty,
  runKey,
} from "./model";

const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const appUrl = (path: string) => `${APP_BASE}${path}`;
const MAX_DEPTH = 32;
const DEFAULT_DIFFICULTY: Difficulty = "medium";
const APP_MODE_STORAGE_KEY = "8puzzle.mode.v1";
const CHALLENGE_STORAGE_KEY = "8puzzle.challenge.v1";
const USER_PROFILE_STORAGE_KEY = "8puzzle.profile.v1";
const CHALLENGE_LEVEL_DEPTHS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 31] as const;
const CHALLENGE_BADGES: {
  id: ChallengeBadgeId;
  label: string;
  detail: string;
  color: string;
  requiredLevel: number;
  requiredPerfects?: number;
  perfect?: boolean;
}[] = [
  { id: "silver", label: "Silver", requiredLevel: 3, detail: "clear levels 1-3", color: "silver" },
  { id: "gold", label: "Gold", requiredLevel: 6, requiredPerfects: 3, detail: "clear 1-6, at least 3 perfect", color: "gold" },
  { id: "diamond", label: "Diamond", requiredLevel: 10, requiredPerfects: 6, detail: "clear 1-10, at least 6 perfect", color: "diamond" },
  { id: "ascendant", label: "Ascendant", requiredLevel: 15, requiredPerfects: 10, detail: "clear all, at least 10 perfect", color: "ascendant" },
  { id: "immortal", label: "Immortal", requiredLevel: 15, detail: "perfect all levels", color: "immortal", perfect: true },
];

interface UserProfile {
  name: string;
  initials: string;
  color: string;
}

const defaultChallengeProgress = (): ChallengeProgress => ({
  unlockedLevel: 1,
  bestMoves: {},
  badges: [],
});

const loadAppMode = (): AppMode => {
  if (typeof localStorage === "undefined") return "free";
  const storedMode = localStorage.getItem(APP_MODE_STORAGE_KEY);
  return storedMode === "challenge" || storedMode === "free" ? storedMode : "free";
};

const clampChallengeLevel = (level: number) =>
  Math.max(1, Math.min(CHALLENGE_LEVEL_DEPTHS.length, Math.trunc(level)));

const clearedThroughLevel = (bestMoves: Record<string, number>, level: number) =>
  CHALLENGE_LEVEL_DEPTHS.slice(0, level).every((_, index) => bestMoves[String(index + 1)] !== undefined);

const perfectCountThroughLevel = (bestMoves: Record<string, number>, level: number) =>
  CHALLENGE_LEVEL_DEPTHS.slice(0, level).filter((target, index) => bestMoves[String(index + 1)] === target).length;

const totalPerfectCount = (bestMoves: Record<string, number>) =>
  perfectCountThroughLevel(bestMoves, CHALLENGE_LEVEL_DEPTHS.length);

const hasPerfectChallenge = (bestMoves: Record<string, number>) =>
  CHALLENGE_LEVEL_DEPTHS.every((target, index) => bestMoves[String(index + 1)] === target);

const badgesForProgress = (bestMoves: Record<string, number>): ChallengeBadgeId[] => {
  return CHALLENGE_BADGES.filter(badge => {
    if (badge.perfect) return hasPerfectChallenge(bestMoves);
    if (!clearedThroughLevel(bestMoves, badge.requiredLevel)) return false;
    return totalPerfectCount(bestMoves) >= (badge.requiredPerfects ?? 0);
  }).map(badge => badge.id);
};

const loadChallengeProgress = (): ChallengeProgress => {
  if (typeof localStorage === "undefined") return defaultChallengeProgress();
  try {
    const raw = localStorage.getItem(CHALLENGE_STORAGE_KEY);
    if (!raw) return defaultChallengeProgress();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultChallengeProgress();
    const bestMoves: Record<string, number> = {};
    const storedBestMoves = parsed["bestMoves"];
    if (isRecord(storedBestMoves)) {
      for (const [key, value] of Object.entries(storedBestMoves)) {
        if (/^\d+$/.test(key) && typeof value === "number" && Number.isFinite(value) && value >= 0) {
          bestMoves[key] = Math.trunc(value);
        }
      }
    }
    const storedUnlockedLevel = parsed["unlockedLevel"];
    const unlockedLevel = typeof storedUnlockedLevel === "number" ? clampChallengeLevel(storedUnlockedLevel) : 1;
    const badges = badgesForProgress(bestMoves);
    return {
      unlockedLevel,
      bestMoves,
      badges,
    };
  } catch {
    return defaultChallengeProgress();
  }
};

const PROFILE_ADJECTIVES = [
  "Win98",
  "Pixelated",
  "Turbo",
  "Kernel",
  "Bitmap",
  "Taskbar",
  "Dialog",
  "Shortcut",
] as const;

const PROFILE_NOUNS = [
  "Cursor",
  "Wizard",
  "Icon",
  "Folder",
  "Slider",
  "Toolbar",
  "Applet",
  "Window",
  "Tile",
] as const;

const PROFILE_COLORS = ["#000080", "#008080", "#800080", "#008000", "#808000", "#800000"] as const;

const randomItem = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)] ?? items[0]!;

const createUserProfile = (): UserProfile => {
  const adjective = randomItem(PROFILE_ADJECTIVES);
  const noun = randomItem(PROFILE_NOUNS);
  const number = Math.floor(100 + Math.random() * 900);
  return {
    name: `${adjective}${noun}${number}`,
    initials: `${adjective[0]}${noun[0]}`.toUpperCase(),
    color: randomItem(PROFILE_COLORS),
  };
};

const loadUserProfile = (): UserProfile => {
  if (typeof localStorage === "undefined") return createUserProfile();
  try {
    const raw = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) {
        const storedName = parsed["name"];
        const storedInitials = parsed["initials"];
        const storedColor = parsed["color"];
        if (
          typeof storedName === "string"
          && typeof storedInitials === "string"
          && typeof storedColor === "string"
        ) {
          return {
            name: storedName.slice(0, 24),
            initials: storedInitials.slice(0, 2).toUpperCase(),
            color: storedColor,
          };
        }
      }
    }
    const next = createUserProfile();
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return createUserProfile();
  }
};

const createJobId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export function App() {
  const [initialChallengeProgress] = useState(() => loadChallengeProgress());
  const [userProfile] = useState(() => loadUserProfile());
  const [appMode, setAppMode] = useState<AppMode>(() => loadAppMode());
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [puzzleDifficulty, setPuzzleDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const [puzzleStart, setPuzzleStart] = useState<BoardState>(() => puzzleForDifficulty(DEFAULT_DIFFICULTY));
  const [board, setBoard] = useState<BoardState>(() => cloneBoard(puzzleStart));
  const [manualMoves, setManualMoves] = useState(0);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress>(() => initialChallengeProgress);
  const [challengeLevel, setChallengeLevel] = useState(() => initialChallengeProgress.unlockedLevel);
  const [challengeStart, setChallengeStart] = useState<BoardState>(() => cloneBoard(PUZZLE_PRESETS.easy.boards[0]!));
  const [challengeBoard, setChallengeBoard] = useState<BoardState>(() => cloneBoard(PUZZLE_PRESETS.easy.boards[0]!));
  const [challengeMoves, setChallengeMoves] = useState(0);
  const [challengeTarget, setChallengeTarget] = useState<number>(CHALLENGE_LEVEL_DEPTHS[0]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [algorithm, setAlgorithm] = useState<Algorithm>("bfs");
  const [maxDepth, setMaxDepth] = useState(PUZZLE_PRESETS[DEFAULT_DIFFICULTY].shortestMoves);
  const [autoDepth, setAutoDepth] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [solving, setSolving] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const activeJobId = useRef<string | null>(null);
  const activeDepth = useRef(0);
  const autoStartDepth = useRef(1);
  const autoEndDepth = useRef(MAX_DEPTH);
  const hydratedMode = useRef(false);

  const active = runs.find(run => run.id === activeId) ?? null;
  const inChallenge = appMode === "challenge";
  const challengeSolved = isSolved(challengeBoard);
  const playback = !inChallenge && Boolean(active?.solved);
  const solutionStates = useMemo(
    () => (active?.solved ? createSolutionStates(active.board, active.moves) : []),
    [active],
  );
  const displayBoard = inChallenge ? challengeBoard : playback ? (solutionStates[step] ?? board) : board;
  const totalSteps = active?.solved ? active.moves.length : 0;
  const solved = inChallenge ? challengeSolved : isSolved(displayBoard);
  const currentMoves = inChallenge ? challengeMoves : manualMoves;
  const currentShortest = inChallenge ? challengeTarget : PUZZLE_PRESETS[puzzleDifficulty].shortestMoves;

  const resetPlayback = useCallback(() => {
    setActiveId(null);
    setStep(0);
    setPlaying(false);
    setSearchProgress(0);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(challengeProgress));
    } catch {
      // Progress is cosmetic, so storage failures should not break play.
    }
  }, [challengeProgress]);

  useEffect(() => {
    try {
      localStorage.setItem(APP_MODE_STORAGE_KEY, appMode);
    } catch {
      // Mode persistence is cosmetic.
    }
  }, [appMode]);

  const completeChallengeLevel = useCallback((level: number, moves: number) => {
    setChallengeProgress(current => {
      const key = String(level);
      const currentBest = current.bestMoves[key];
      const nextBestMoves = {
        ...current.bestMoves,
        [key]: currentBest === undefined ? moves : Math.min(currentBest, moves),
      };
      const unlockedLevel = clampChallengeLevel(Math.max(current.unlockedLevel, level + 1));
      const badges = badgesForProgress(nextBestMoves);
      return {
        unlockedLevel,
        bestMoves: nextBestMoves,
        badges,
      };
    });
  }, []);

  const loadChallengeLevel = useCallback(async (level: number) => {
    const safeLevel = clampChallengeLevel(level);
    resetPlayback();
    setChallengeLoading(true);
    setError(null);
    try {
      const response = await fetch(appUrl("/api/challenge-board"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: safeLevel }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "Could not load challenge board.",
        );
      }
      const result = parseChallengeBoardResult(payload);
      setChallengeLevel(result.level);
      setChallengeTarget(result.shortestMoves);
      setChallengeStart(cloneBoard(result.board));
      setChallengeBoard(result.board);
      setChallengeMoves(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load challenge board.");
    } finally {
      setChallengeLoading(false);
    }
  }, [resetPlayback]);

  useEffect(() => {
    if (!hydratedMode.current && appMode === "challenge") {
      hydratedMode.current = true;
      void loadChallengeLevel(challengeLevel);
    }
  }, [appMode, challengeLevel, loadChallengeLevel]);

  const chooseMode = (mode: AppMode) => {
    if (appMode === mode) return;
    if (solving) cancel();
    resetPlayback();
    setAppMode(mode);
    setError(null);
    if (mode === "challenge") {
      void loadChallengeLevel(challengeLevel);
    }
  };

  const handleBoardMove = (next: BoardState) => {
    if (inChallenge) {
      if (challengeSolved) return;
      const nextMoves = challengeMoves + 1;
      setChallengeBoard(next);
      setChallengeMoves(nextMoves);
      if (isSolved(next)) completeChallengeLevel(challengeLevel, nextMoves);
      return;
    }

    resetPlayback();
    setBoard(next);
    setManualMoves(current => current + 1);
  };

  const chooseDifficulty = (value: Difficulty) => {
    resetPlayback();
    setDifficulty(value);
    setMaxDepth(PUZZLE_PRESETS[value].shortestMoves);
    setError(null);
  };

  const shufflePuzzle = async () => {
    resetPlayback();
    setShuffling(true);
    setError(null);
    try {
      const response = await fetch(appUrl("/api/shuffle"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty,
          exclude: boardToApi(board),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String(payload.error)
            : "Could not shuffle puzzle.",
        );
      }
      const result = parseShuffleResult(payload);
      setPuzzleStart(cloneBoard(result.board));
      setBoard(result.board);
      setPuzzleDifficulty(result.difficulty);
      setMaxDepth(result.shortestMoves);
    } catch (reason) {
      const fallback = puzzleForDifficulty(difficulty, board);
      setPuzzleStart(cloneBoard(fallback));
      setBoard(fallback);
      setPuzzleDifficulty(difficulty);
      setMaxDepth(PUZZLE_PRESETS[difficulty].shortestMoves);
      setError(reason instanceof Error ? reason.message : "Could not shuffle puzzle.");
    } finally {
      setManualMoves(0);
      setShuffling(false);
    }
  };

  const resetPuzzle = () => {
    resetPlayback();
    setBoard(cloneBoard(puzzleStart));
    setManualMoves(0);
    setMaxDepth(PUZZLE_PRESETS[puzzleDifficulty].shortestMoves);
    setError(null);
  };

  const updateMaxDepth = (value: number) => {
    const safeValue = Number.isFinite(value) ? value : PUZZLE_PRESETS[difficulty].shortestMoves;
    setMaxDepth(Math.max(1, Math.min(MAX_DEPTH, Math.trunc(safeValue))));
  };

  useEffect(() => {
    if (!playing || !totalSteps) return;
    const timer = window.setInterval(() => {
      setStep(current => {
        if (current >= totalSteps) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [playing, totalSteps]);

  useEffect(() => {
    if (!solving) return;
    const timer = window.setInterval(async () => {
      const jobId = activeJobId.current;
      if (!jobId) return;
      try {
        const response = await fetch(appUrl(`/api/progress?jobId=${encodeURIComponent(jobId)}`));
        const payload: unknown = await response.json();
        const progress = isRecord(payload) ? payload["progress"] : null;
        if (
          response.ok
          && typeof progress === "number"
        ) {
          if (autoDepth) {
            const span = Math.max(1, autoEndDepth.current - autoStartDepth.current + 1);
            const depthOffset = Math.max(0, activeDepth.current - autoStartDepth.current);
            const depthProgress = Math.max(0, Math.min(99, progress)) / 100;
            const nextProgress = Math.max(0, Math.min(99, ((depthOffset + depthProgress) / span) * 100));
            setSearchProgress(current => Math.max(current, nextProgress));
          } else {
            const nextProgress = Math.max(0, Math.min(99, progress));
            setSearchProgress(current => Math.max(current, nextProgress));
          }
        }
      } catch {
        // The solve request remains authoritative if progress polling briefly fails.
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [autoDepth, solving]);

  const loadRun = (run: Run) => {
    setActiveId(run.id);
    setBoard(cloneBoard(run.board));
    setAlgorithm(run.algorithm);
    setAutoDepth(run.mode === "auto");
    setMaxDepth(run.maxDepth);
    setStep(0);
    setPlaying(false);
    setSearchProgress(100);
    setError(null);
  };

  const requestSolve = async (
    snapshot: BoardState,
    controller: AbortController,
    depth: number,
  ): Promise<SolveResult> => {
    const jobId = createJobId();
    activeJobId.current = jobId;
    activeDepth.current = depth;
    const response = await fetch(appUrl("/api/solve"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId,
        board: boardToApi(snapshot),
        algorithm,
        maxDepth: depth,
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : "Could not solve puzzle.",
      );
    }
    return parseSolveResult(payload);
  };

  const solve = async () => {
    if (inChallenge) return;
    resetPlayback();
    const mode = autoDepth ? "auto" : "fixed";
    const key = runKey(board, algorithm, maxDepth, mode);
    const existing = runs.find(run => run.key === key);
    if (existing) {
      loadRun(existing);
      return;
    }

    const snapshot = cloneBoard(board);
    const controller = new AbortController();
    abort.current = controller;
    autoStartDepth.current = maxDepth;
    autoEndDepth.current = autoDepth ? MAX_DEPTH : maxDepth;
    setSolving(true);
    setSearchProgress(0);
    setError(null);

    const started = performance.now();
    let finalDepth = maxDepth;
    try {
      let result: SolveResult | null = null;
      let totalElapsed = 0;
      let totalExpanded = 0;
      let totalGenerated = 0;

      for (let depth = maxDepth; depth <= autoEndDepth.current; depth += 1) {
        finalDepth = depth;
        result = await requestSolve(snapshot, controller, depth);
        totalElapsed += result.elapsed;
        totalExpanded += result.expanded;
        totalGenerated += result.generated;
        if (result.solved || !autoDepth || result.stoppedReason) break;
      }

      if (!result) throw new Error("Could not solve puzzle.");
      const run: Run = {
        ...createRun(nextId.current++, snapshot, algorithm, mode, finalDepth, {
          ...result,
          elapsed: totalElapsed,
          expanded: totalExpanded,
          generated: totalGenerated,
          limit: finalDepth,
        }),
        key,
      };
      setRuns(current => [...current, run]);
      loadRun(run);
      setSearchProgress(100);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        const run: Run = {
          id: nextId.current++,
          key,
          algorithm,
          mode,
          maxDepth: finalDepth,
          board: snapshot,
          moves: [],
          solved: false,
          moveCount: 0,
          elapsed: (performance.now() - started) / 1000,
          expanded: 0,
          generated: 0,
          depth: null,
          limit: finalDepth,
          stoppedReason: "cancelled",
        };
        setRuns(current => [...current, run]);
        loadRun(run);
      } else {
        setError(reason instanceof Error ? reason.message : "Could not solve puzzle.");
      }
    } finally {
      abort.current = null;
      activeJobId.current = null;
      activeDepth.current = 0;
      setSolving(false);
    }
  };

  const cancel = () => {
    abort.current?.abort();
    const jobId = activeJobId.current;
    if (jobId) {
      void fetch(appUrl("/api/cancel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
    }
  };

  const resetChallenge = () => {
    resetPlayback();
    setChallengeBoard(cloneBoard(challengeStart));
    setChallengeMoves(0);
    setError(null);
  };

  const nextChallengeLevel = () => {
    if (challengeLevel >= CHALLENGE_LEVEL_DEPTHS.length) return;
    void loadChallengeLevel(challengeLevel + 1);
  };

  const chooseChallengeLevel = (level: number) => {
    if (level > challengeProgress.unlockedLevel) return;
    void loadChallengeLevel(level);
  };

  const challengeBest = challengeProgress.bestMoves[String(challengeLevel)];
  const earnedBadges = CHALLENGE_BADGES.filter(badge => challengeProgress.badges.includes(badge.id));
  const challengeNote = solved
    ? challengeMoves === challengeTarget
      ? `Perfect: level ${challengeLevel} cleared in ${challengeMoves} moves.`
      : `Cleared: level ${challengeLevel} cleared in ${challengeMoves} moves. Target was ${challengeTarget}.`
    : `Level ${challengeLevel}: solve this board in ${challengeTarget} moves.`;

  return (
    <div className="app-frame">
      <Header appMode={appMode} onModeChange={chooseMode} />
      <main className="app-main">
        <section className="window info-window" aria-label={`${inChallenge ? "Levels" : "Practice"} information`}>
          <div className="title-bar">
            <div className="title-bar-text">Information</div>
          </div>
          <div className="window-body">
            <div className="sunken-panel profile-card info-profile-card">
              <div
                className="profile-avatar"
                style={{ "--profile-color": userProfile.color } as CSSProperties}
                aria-hidden="true"
              >
                {userProfile.initials}
              </div>
              <div className="profile-copy">
                <div className="profile-meta-row">
                  <span className="profile-label">User</span>
                  <div className="profile-badges" aria-label="Earned badges">
                    {CHALLENGE_BADGES.map(badge => {
                      const earned = challengeProgress.badges.includes(badge.id);
                      return (
                        <span
                          key={badge.id}
                          className={`profile-badge badge-card badge-${badge.color} ${earned ? "earned" : ""}`}
                          title={`${badge.label}: ${earned ? "earned" : "locked"}`}
                          aria-label={`${badge.label}, ${earned ? "earned" : "locked"}`}
                        >
                          <span className="badge-icon" aria-hidden="true" />
                        </span>
                      );
                    })}
                  </div>
                </div>
                <strong>{userProfile.name}</strong>
              </div>
            </div>
            <div className="sunken-panel mode-guide">
              {inChallenge ? (
                <>
                  <strong>Levels mode</strong>
                  <p>
                    Levels are the challenge side of the game. You still move tiles the normal way, but the solver is hidden so each board has to be cleared by hand.
                  </p>
                  <strong>How it works</strong>
                  <ul>
                    <li>Click a tile beside the empty space to slide it into the blank.</li>
                    <li>Each level has a target move count based on the shortest BFS solution.</li>
                    <li>Retry restarts the same board, so you can improve without losing the puzzle.</li>
                    <li>Solving the current board unlocks the next level.</li>
                    <li>Your best move count is saved locally for each level.</li>
                  </ul>
                  <strong>Goal</strong>
                  <p>
                    Clear all 15 levels, then come back to lower your best move counts. A perfect clear means you matched the target exactly.
                  </p>
                  <strong>Rewards</strong>
                  <p>
                    Badges are earned from level clears and perfect clears. They show up in your profile once unlocked.
                  </p>
                  <ul>
                    <li>Silver: clear levels 1-3.</li>
                    <li>Gold: clear 1-6 with at least 3 perfect clears total.</li>
                    <li>Diamond: clear 1-10 with at least 6 perfect clears total.</li>
                    <li>Ascendant: clear all 15 with at least 10 perfect clears total.</li>
                    <li>Immortal: solve all 15 in the shortest move count.</li>
                  </ul>
                </>
              ) : (
                <>
                  <strong>Practice mode</strong>
                  <p>
                    Practice is the free-play mode. Use it to learn the puzzle, try different difficulties, and compare your route against the Python solver.
                  </p>
                  <strong>Board controls</strong>
                  <ul>
                    <li>Click a tile beside the empty space to slide it into the blank.</li>
                    <li>The goal is tiles 1-8 in order with the empty space in the bottom-right.</li>
                    <li>Choose Easy, Medium, or Hard before shuffling to pick the shortest-solution depth.</li>
                    <li>Shuffle creates a new solvable board at that exact difficulty.</li>
                    <li>Reset returns to the current shuffled board without changing the puzzle.</li>
                  </ul>
                  <strong>Solver cheat</strong>
                  <p>
                    Run Search sends the current board to the server. BFS finds the shortest move list. DFS explores depth-first up to the selected max depth, so it is useful for seeing how a different search behaves.
                  </p>
                  <strong>Use it to learn</strong>
                  <p>
                    Replay the solver path step by step, compare it to your own moves, and check expanded, generated, and overhead counts to see how much work each search did.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>
        <section className={`window game-window ${solved ? "is-solved" : ""}`} aria-label="8-puzzle game">
          <div className="title-bar">
            <div className="title-bar-text">Puzzle</div>
            <div className="title-bar-controls">
              <button type="button" aria-label="Minimize" disabled />
              <button type="button" aria-label="Maximize" disabled />
              <button type="button" aria-label="Close" disabled />
            </div>
          </div>
          <div className={`status-bar game-status ${inChallenge ? "challenge-status-grid" : ""}`} aria-label="Game status">
            <p className="status-bar-field">Moves: {currentMoves}</p>
            <p className="status-bar-field">Status: {solved ? "Solved" : "Playing"}</p>
            <p className="status-bar-field">{inChallenge ? "Target" : "Shortest"}: {currentShortest}</p>
            {inChallenge && (
              <>
              <p className="status-bar-field">Level: {challengeLevel} / {CHALLENGE_LEVEL_DEPTHS.length}</p>
              <p className="status-bar-field">Best: {challengeBest ?? "—"}</p>
              <p className="status-bar-field">Reward: {earnedBadges.length} / {CHALLENGE_BADGES.length}</p>
              </>
            )}
          </div>
          {!inChallenge && (
            <div className="status-bar game-hint">
              <p className="status-bar-field">Click a tile next to the empty space.</p>
            </div>
          )}
          <div className="window-body">
            <div className="game-content">
              <div className="board-stage">
                <Board
                  board={displayBoard}
                  playback={inChallenge ? challengeSolved || challengeLoading : playback}
                  onMove={handleBoardMove}
                />
              </div>
            </div>
            <div className="sunken-panel desktop-note">
              {inChallenge ? (
                <>{challengeLoading ? "Loading level board..." : challengeNote}</>
              ) : solved ? (
                <>
                  <strong>Solved:</strong> board is in goal order.
                </>
              ) : (
                <>
                  <strong>{puzzleDifficulty[0]?.toUpperCase()}{puzzleDifficulty.slice(1)}:</strong>{" "}
                  the shortest solution is {PUZZLE_PRESETS[puzzleDifficulty].shortestMoves} moves.
                </>
              )}
            </div>
            {inChallenge ? (
              <div className="button-row manual-controls">
                <button type="button" disabled={challengeLoading} onClick={resetChallenge}>
                  Retry
                </button>
                <button
                  type="button"
                  disabled={!challengeSolved || challengeLevel >= CHALLENGE_LEVEL_DEPTHS.length || challengeLoading}
                  onClick={nextChallengeLevel}
                >
                  Next level
                </button>
              </div>
            ) : (
              <div className="button-row manual-controls">
                <label htmlFor="difficulty">Difficulty</label>
                <select
                  id="difficulty"
                  value={difficulty}
                  disabled={solving || shuffling}
                  onChange={event => {
                    if (isDifficulty(event.target.value)) chooseDifficulty(event.target.value);
                  }}
                >
                  <option value="easy">Easy (10 moves)</option>
                  <option value="medium">Medium (15 moves)</option>
                  <option value="hard">Hard (31 moves)</option>
                </select>
                <button type="button" disabled={solving || shuffling} onClick={() => void shufflePuzzle()}>
                  {shuffling ? "Shuffling..." : "Shuffle"}
                </button>
                <button type="button" disabled={solving || shuffling} onClick={resetPuzzle}>
                  Reset
                </button>
              </div>
            )}
          </div>
        </section>
        <aside className={`side-column ${inChallenge ? "is-challenge" : ""}`}>
          {inChallenge ? (
            <section className="window panel-window challenge-panel" aria-label="Progress">
                <div className="title-bar">
                  <div className="title-bar-text">Progress</div>
                </div>
                <div className="window-body">
                  <div className="panel-heading">
                    <h2>Levels</h2>
                  </div>
                  <p className="panel-copy">
                    Clear levels manually to unlock badges. The solver is disabled here.
                  </p>
                  <div className="challenge-levels" aria-label="Challenge levels">
                    {CHALLENGE_LEVEL_DEPTHS.map((depth, index) => {
                      const level = index + 1;
                      const unlocked = level <= challengeProgress.unlockedLevel;
                      const best = challengeProgress.bestMoves[String(level)];
                      return (
                        <button
                          key={level}
                          type="button"
                          className={level === challengeLevel ? "active" : ""}
                          disabled={!unlocked || challengeLoading}
                          onClick={() => chooseChallengeLevel(level)}
                        >
                          {level}: {depth}
                          {best !== undefined ? ` (${best})` : ""}
                        </button>
                      );
                    })}
                  </div>
                  <div className="panel-heading badges-heading">
                    <h2>Badges</h2>
                  </div>
                  <div className="sunken-panel challenge-rewards">
                    <div className="challenge-badges">
                      {CHALLENGE_BADGES.map(badge => {
                        const earned = challengeProgress.badges.includes(badge.id);
                        return (
                          <div
                            key={badge.id}
                            className={`badge-card badge-${badge.color} ${earned ? "earned" : ""}`}
                            aria-label={`${badge.label}, ${earned ? "earned" : "locked until " + badge.detail}`}
                          >
                            <span className="badge-icon" aria-hidden="true" />
                            <span className="badge-name">{badge.label}</span>
                            <span className="badge-detail">{earned ? "unlocked" : "not unlocked yet"}</span>
                            <span className="badge-status">{earned ? "earned" : "locked"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {error && <p className="sunken-panel status-note" role="alert">{error}</p>}
                </div>
            </section>
          ) : (
            <>
              <SolverPanel
                algorithm={algorithm}
                maxDepth={maxDepth}
                maxAllowedDepth={MAX_DEPTH}
                autoDepth={autoDepth}
                solving={solving}
                onAlgorithm={setAlgorithm}
                onMaxDepth={updateMaxDepth}
                onAutoDepth={setAutoDepth}
                onSolve={() => void solve()}
                onCancel={cancel}
              />
              <Results
                active={active}
                solving={solving}
                progress={searchProgress}
                error={error}
                step={step}
                playing={playing}
                onStep={value => {
                  setPlaying(false);
                  setStep(Math.max(0, Math.min(totalSteps, value)));
                }}
                onPlay={() => {
                  if (step === totalSteps) setStep(0);
                  setPlaying(current => !current);
                }}
              />
            </>
          )}
        </aside>
      </main>
      <footer className="app-footer">
        <p>
          &copy; {new Date().getFullYear()} MindMidas ·{" "}
          <a href="https://github.com/MindMidas/8puzzle.exe" rel="noopener noreferrer" target="_blank">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
