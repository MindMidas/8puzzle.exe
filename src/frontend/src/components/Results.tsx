import { useEffect, useRef } from "react";
import type { Run } from "../../types";
import { MOVE_LABELS, algorithmLabel } from "../model";

interface Props {
  active: Run | null;
  solving: boolean;
  progress: number;
  error: string | null;
  step: number;
  playing: boolean;
  onStep: (step: number) => void;
  onPlay: () => void;
}

export function Results({ active, solving, progress, error, step, playing, onStep, onPlay }: Props) {
  const moves = active?.moves ?? [];
  const total = active?.solved ? moves.length : 0;
  const overhead = active ? Math.max(0, active.expanded - active.moveCount) : 0;
  const visibleProgress = solving && progress < 1 ? 1 : progress;
  const selectedRow = useRef<HTMLTableRowElement | null>(null);
  const movePanel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const panel = movePanel.current;
    const row = selectedRow.current;
    if (!panel || !row) return;
    const headerHeight = panel.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const rowTop = row.offsetTop;
    const rowBottom = rowTop + row.offsetHeight;
    const visibleTop = panel.scrollTop + headerHeight;
    const visibleBottom = panel.scrollTop + panel.clientHeight;
    if (rowTop < visibleTop) panel.scrollTop = Math.max(0, rowTop - headerHeight);
    if (rowBottom > visibleBottom) panel.scrollTop = rowBottom - panel.clientHeight;
  }, [step]);

  return (
    <section className="window panel-window results-window" aria-label="Solver results">
      <div className="title-bar">
        <div className="title-bar-text">Solver output</div>
      </div>
      <div className="window-body">
        <div
          className="progress-indicator segmented"
          aria-label="Search progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(visibleProgress)}
        >
          <span className="progress-indicator-bar" style={{ width: `${visibleProgress}%` }} />
        </div>
        <div className="panel-heading">
          <h2>
            {solving
              ? "Searching..."
              : active
                ? `${algorithmLabel(active.algorithm)} ${active.mode === "auto" ? "AUTO" : ""}`.trim()
                : "No run yet"}
          </h2>
        </div>

        {error ? (
          <p className="sunken-panel status-note" role="alert">{error}</p>
        ) : active ? (
          <>
            <div className="metrics-grid">
              <div className="sunken-panel metric">
                <span>Moves</span>
                <strong>{active.solved ? active.moveCount : "—"}</strong>
              </div>
              <div className="sunken-panel metric">
                <span>Time</span>
                <strong>{`${(active.elapsed * 1000).toFixed(1)} ms`}</strong>
              </div>
              <div className="sunken-panel metric">
                <span>Expanded</span>
                <strong>{active.expanded.toLocaleString()}</strong>
              </div>
              <div className="sunken-panel metric">
                <span>Generated</span>
                <strong>{active.generated.toLocaleString()}</strong>
              </div>
              <div className="sunken-panel metric">
                <span>Overhead</span>
                <strong>{overhead.toLocaleString()}</strong>
              </div>
            </div>

            {active.solved && (
              <>
                <div className="playback" aria-label="Solution playback controls">
                  <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)}>
                    ◀
                  </button>
                  <button
                    type="button"
                    className="play"
                    disabled={!total}
                    aria-pressed={playing}
                    onClick={onPlay}
                  >
                    {playing ? "❚❚" : "▶"}
                  </button>
                  <button type="button" disabled={step === total} onClick={() => onStep(step + 1)}>
                    ▶
                  </button>
                  <span className="step-count">
                    Step {step} / {total}
                  </span>
                </div>
                <div className="sunken-panel move-list-frame">
                  <table className="move-table move-table-header" aria-hidden="true">
                    <thead>
                      <tr>
                        <th>Step</th>
                        <th>Move</th>
                      </tr>
                    </thead>
                  </table>
                  <div className="move-panel" ref={movePanel}>
                    <table className="interactive move-table" aria-label="Solution moves">
                    <tbody className="move-table-body">
                      {moves.map((move, index) => (
                        <tr
                          key={`${move}-${index}`}
                          className={step === index + 1 ? "highlighted" : ""}
                          ref={step === index + 1 ? selectedRow : undefined}
                          tabIndex={0}
                          onClick={() => onStep(index + 1)}
                          onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onStep(index + 1);
                            }
                          }}
                        >
                          <td>{index + 1}</td>
                          <td>{MOVE_LABELS[move]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </>
            )}

            {!active.solved && (
              <p className="sunken-panel status-note" role="status">
                {active.stoppedReason === "cancelled"
                  ? "Search cancelled."
                  : "No solution found within the depth limit."}
              </p>
            )}
          </>
        ) : (
          <p className="sunken-panel move-empty">Run BFS or DFS to watch the solver replay its move sequence.</p>
        )}
      </div>
    </section>
  );
}
