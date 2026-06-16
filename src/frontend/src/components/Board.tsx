import type { BoardState } from "../../types";
import { trySlideTile } from "../model";

interface Props {
  board: BoardState;
  playback: boolean;
  onMove: (next: BoardState) => void;
}

export function Board({ board, playback, onMove }: Props) {
  const handleTileClick = (row: number, col: number) => {
    if (playback) return;
    const next = trySlideTile(board, row, col);
    if (next) onMove(next);
  };

  return (
    <div className="board-wrap">
      <div className={`puzzle-board ${playback ? "playback-mode" : ""}`} aria-label="3 by 3 sliding puzzle board">
        {board.map((row, rowIndex) =>
          row.map((tile, colIndex) => {
            const isEmpty = tile === "e";
            if (isEmpty) {
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className="empty-slot"
                  role="img"
                  aria-label={`Empty slot row ${rowIndex + 1} column ${colIndex + 1}`}
                />
              );
            }

            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                className="tile-button"
                aria-label={`Tile ${tile} row ${rowIndex + 1} column ${colIndex + 1}`}
                aria-disabled={playback}
                onClick={() => handleTileClick(rowIndex, colIndex)}
              >
                {tile}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
