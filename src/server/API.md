# 8puzzle.exe API

This is the small JSON API used by the 8puzzle.exe web UI.

| Item | Value |
|---|---|
| Local URL | `http://127.0.0.1:8001` |
| Docker URL | `http://127.0.0.1:8020` |
| Errors | `{"error": "message"}` |
| Session | Frontend-generated `jobId`; no login required |

## Board Format

Boards are sent as a 3x3 grid of strings. Use `"e"` for the empty tile.

```json
[
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "e"]
]
```

Rules:

- exactly 3 rows
- exactly 3 tiles per row
- each of `"1"` through `"8"` and `"e"` appears once

## `GET /healthz`

Checks that the server is running.

Example response:

```json
{ "ok": true }
```

## `POST /api/shuffle`

Returns a random solvable board at an exact shortest-solution depth.

```json
{
  "difficulty": "medium",
  "exclude": [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "e"]
  ]
}
```

Params:

- `difficulty`: `easy`, `medium`, or `hard`; defaults to `medium`.
- `exclude`: optional current board to avoid returning the same board when possible.

Difficulty depths:

| Difficulty | Shortest solution |
|---|---:|
| `easy` | 10 moves |
| `medium` | 15 moves |
| `hard` | 31 moves |

Example response:

```json
{
  "board": [
    ["2", "8", "3"],
    ["1", "5", "6"],
    ["4", "7", "e"]
  ],
  "difficulty": "easy",
  "shortestMoves": 10
}
```

## `POST /api/solve`

Solves one board with the Python search code.

```json
{
  "jobId": "job-12345678",
  "algorithm": "bfs",
  "maxDepth": 15,
  "board": [
    ["1", "2", "3"],
    ["6", "e", "8"],
    ["5", "4", "7"]
  ]
}
```

Algorithms:

- `bfs` returns the shortest path when the solution is within `maxDepth`.
- `dfs` explores depth-first and may return a longer path first.

Params:

- `jobId`: frontend-generated id for this solve.
- `jobId`: 8-80 characters using letters, numbers, underscores, or dashes.
- `algorithm`: `bfs` or `dfs`.
- `maxDepth`: integer from `1` to `32`.
- `board`: validated 3x3 board.

Example response:

```json
{
  "solved": true,
  "moves": ["left", "down", "right"],
  "elapsed": 0.0342,
  "expanded": 5600,
  "generated": 12690,
  "depth": 3,
  "limit": 15,
  "stoppedReason": null
}
```

`expanded` is the number of states the solver checked. `generated` is the number of child states produced while searching. `depth` is the solution length when solved, and `limit` is the max depth used for that run. If no solution is found within `maxDepth`, `solved` is `false` and `moves` is empty.

## `POST /api/challenge-board`

Returns a random solvable board for one server-owned Challenge Mode level. The client sends only the level number; the server owns the exact shortest-solution depth.

```json
{ "level": 1 }
```

Challenge depths:

| Level range | Shortest solution |
|---|---:|
| `1` | 4 moves |
| `2` | 6 moves |
| `3` | 8 moves |
| `4` | 10 moves |
| `5` | 12 moves |
| `6` | 14 moves |
| `7` | 16 moves |
| `8` | 18 moves |
| `9` | 20 moves |
| `10` | 22 moves |
| `11` | 24 moves |
| `12` | 26 moves |
| `13` | 28 moves |
| `14` | 30 moves |
| `15` | 31 moves |

Example response:

```json
{
  "level": 1,
  "board": [
    ["1", "2", "3"],
    ["4", "e", "6"],
    ["7", "5", "8"]
  ],
  "shortestMoves": 4
}
```

Invalid or out-of-range levels return `400`.

## `GET /api/progress?jobId=...`

Returns the current progress estimate for a running solve.

Example response:

```json
{ "progress": 42 }
```

Progress is best-effort. It is monotonic during a job and reaches `100` when the solve finishes.

## `POST /api/cancel`

Cancels a running solve.

```json
{ "jobId": "job-12345678" }
```

Example response:

```json
{ "cancelled": true }
```

## Limits

- JSON body size is capped at `2048` bytes.
- Solve depth is capped at `32`.
- Challenge levels are capped to the 15 server-owned depths listed above.
- Active solve jobs are capped at `8`.
- Write endpoints are rate limited to `30` requests per minute per client.
- Search and board-generation runs are serialized because `SearchProblem2` stores shared class-level state.
- Progress and cancel operations are scoped to the requesting client plus `jobId`.
- `jobId` values are validated before they can create, cancel, or poll a solve.
- Browser `POST` requests must be same-origin by `Origin` or `Referer` when those headers are present.
- `X-Forwarded-For` is trusted only when `TRUST_PROXY_HEADERS=1`.
- Binding to `0.0.0.0` or `::` requires `EIGHTPUZZLE_ENV=production`.

## Security Headers

Every response includes:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Notes

- Shuffle generation samples from exact `SearchProblem2.bfs()` depth layers starting at the solved board.
- Challenge board generation uses the same exact-depth `SearchProblem2.bfs()` sampling.
- Solve requests run through `src/solver/EightPuzzle.py` and `src/solver/SearchProblem2.py`.
- Static frontend files are served from `src/frontend/dist`.
