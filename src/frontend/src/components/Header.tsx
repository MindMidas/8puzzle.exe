import type { AppMode } from "../../types";

type HeaderProps = {
  appMode: AppMode;
  onModeChange: (mode: AppMode) => void;
};

export function Header({ appMode, onModeChange }: HeaderProps) {
  return (
    <header className="window app-header">
      <div className="title-bar">
        <div className="title-bar-text">8puzzle.exe</div>
        <div className="mode-tabs" role="tablist" aria-label="Play mode">
          <button
            type="button"
            className={appMode === "free" ? "active" : ""}
            aria-selected={appMode === "free"}
            aria-pressed={appMode === "free"}
            onClick={() => onModeChange("free")}
          >
            Practice
          </button>
          <button
            type="button"
            className={appMode === "challenge" ? "active" : ""}
            aria-selected={appMode === "challenge"}
            aria-pressed={appMode === "challenge"}
            onClick={() => onModeChange("challenge")}
          >
            Levels
          </button>
        </div>
      </div>
    </header>
  );
}
