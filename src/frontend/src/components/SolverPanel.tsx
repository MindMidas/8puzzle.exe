import type { Algorithm } from "../../types";

interface Props {
  algorithm: Algorithm;
  maxDepth: number;
  maxAllowedDepth: number;
  autoDepth: boolean;
  solving: boolean;
  onAlgorithm: (value: Algorithm) => void;
  onMaxDepth: (value: number) => void;
  onAutoDepth: (value: boolean) => void;
  onSolve: () => void;
  onCancel: () => void;
}

export function SolverPanel({
  algorithm,
  maxDepth,
  maxAllowedDepth,
  autoDepth,
  solving,
  onAlgorithm,
  onMaxDepth,
  onAutoDepth,
  onSolve,
  onCancel,
}: Props) {
  return (
    <section className="window panel-window" aria-label="Solver controls" aria-busy={solving}>
      <div className="title-bar">
        <div className="title-bar-text">View solution</div>
      </div>
      <div className="window-body">
        <div className="panel-heading">
          <h2>Run Search</h2>
        </div>
        <p className="panel-copy">
          BFS finds shortest paths. DFS goes depth-first. Limit: 32.
        </p>
        <fieldset className="solver-fieldset">
          <legend>Search algorithm</legend>
          <div className="algorithm-options">
            {(["bfs", "dfs"] as const).map(value => (
              <div className="field-row" key={value}>
                <input
                  id={`algorithm-${value}`}
                  type="radio"
                  name="algorithm"
                  checked={algorithm === value}
                  onChange={() => onAlgorithm(value)}
                />
                <label htmlFor={`algorithm-${value}`}>{value.toUpperCase()}</label>
              </div>
            ))}
          </div>
        </fieldset>
        <div className="field-row-stacked solver-depth">
          <label htmlFor="max-depth">Max depth: {maxDepth}</label>
          <input
            id="max-depth"
            type="range"
            className="has-box-indicator"
            min={1}
            max={maxAllowedDepth}
            value={maxDepth}
            onChange={event => onMaxDepth(Number(event.target.value))}
          />
        </div>
        <div className="field-row solver-mode">
          <input
            id="auto-depth"
            type="checkbox"
            checked={autoDepth}
            disabled={solving}
            onChange={event => onAutoDepth(event.target.checked)}
          />
          <label htmlFor="auto-depth">Continue depth automatically</label>
        </div>
        <div className="button-row solver-actions">
          <button type="button" disabled={solving} onClick={onSolve}>
            {solving ? "Searching..." : "Cheat"}
          </button>
          {solving && (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
