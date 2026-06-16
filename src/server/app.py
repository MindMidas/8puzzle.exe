#!/usr/bin/env python3

import argparse;
import json;
import mimetypes;
import os;
import random;
import re;
import threading;
import time;
from collections import defaultdict, deque;
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer;
from pathlib import Path;
from urllib.parse import parse_qs, unquote, urlparse;

from src.solver.EightPuzzle import EightPuzzle;
from src.solver.SearchProblem2 import SearchProblem;

PROJECT_ROOT = Path(__file__).resolve().parents[2];
FRONTEND_ROOT = PROJECT_ROOT / "src" / "frontend" / "dist";
SOLVER_LOCK = threading.Lock();
ACTIVE_JOBS = {};
JOB_PROGRESS = {};
JOB_LOCK = threading.Lock();
RATE_LOCK = threading.Lock();
RATE_BUCKETS = defaultdict(deque);
MAX_BODY_BYTES = 2048;
MAX_ACTIVE_JOBS = 8;
MAX_SEARCH_DEPTH = 32;
RATE_LIMIT_WINDOW_SECONDS = 60;
RATE_LIMIT_REQUESTS = 30;
REQUEST_TIMEOUT_SECONDS = 20;
SHUFFLE_DEPTHS = {"easy": 10, "medium": 15, "hard": 31};
CHALLENGE_DEPTHS = (4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 31);
MOVES = {"left", "right", "up", "down"};
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,80}$");
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "0") == "1";
APP_ENV = os.environ.get("EIGHTPUZZLE_ENV", "development").strip().lower();
SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'none'; "
    "frame-ancestors 'self'; "
    "form-action 'self'"
);


def validate_board(raw_board):
    """
    Validate a JSON board and return tuple rows.
    """
    # check board shape
    if not isinstance(raw_board, list) or len(raw_board) != 3:
        raise ValueError("Board must be a 3 by 3 grid.");

    tiles = [];
    for row in raw_board:
        if not isinstance(row, list) or len(row) != 3:
            raise ValueError("Board must be a 3 by 3 grid.");

        # collect safe tile values
        for tile in row:
            tile = str(tile);
            if tile not in {"1", "2", "3", "4", "5", "6", "7", "8", "e"}:
                raise ValueError("Board tiles must be numbers 1-8 or e.");
            tiles.append(tile);

    # make sure every tile appears once
    if sorted(tiles) != ["1", "2", "3", "4", "5", "6", "7", "8", "e"]:
        raise ValueError("Board must contain each tile exactly once.");

    return tuple(tuple(str(tile) for tile in row) for row in raw_board);


def client_id(handler):
    """
    Return a short client id for rate limiting.
    """
    # only trust proxy headers when explicitly enabled
    forwarded_for = handler.headers.get("X-Forwarded-For", "") if TRUST_PROXY_HEADERS else "";
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()[:64];

    return handler.client_address[0];


def normalize_job_id(raw_job_id):
    """
    Validate a frontend job id before using it as a key.
    """
    job_id = str(raw_job_id or "");
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("jobId must be an 8-80 character id containing letters, numbers, underscores, or dashes.");
    return job_id;


def job_key(handler, raw_job_id):
    """
    Scope one job id to one client.
    """
    return f"{client_id(handler)}:{normalize_job_id(raw_job_id)}";


def rate_limited(identifier):
    """
    Check the in-memory request bucket for this client.
    """
    now = time.monotonic();

    # prune old requests and count the current window
    with RATE_LOCK:
        bucket = RATE_BUCKETS[identifier];
        while bucket and now - bucket[0] > RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft();

        if len(bucket) >= RATE_LIMIT_REQUESTS:
            return True;

        bucket.append(now);
        return False;


def job_cancelled(job_id):
    """
    Return true when a running job has been cancelled.
    """
    with JOB_LOCK:
        return job_id not in ACTIVE_JOBS;


def update_progress(job_id, depth, max_depth):
    """
    Store monotonic progress for a running search.
    """
    progress = min(99, max(1, round((depth / max_depth) * 100)));

    # never move the bar backwards
    with JOB_LOCK:
        if job_id in ACTIVE_JOBS:
            JOB_PROGRESS[job_id] = max(JOB_PROGRESS.get(job_id, 0), progress);


def reset_search_problem(job_id, max_depth, use_hooks=True):
    """
    Reset shared search state before one API solve.
    """
    # clear solver class state
    SearchProblem.stop = False;
    SearchProblem.visited = [];
    SearchProblem.unique_states = [];
    SearchProblem.unique_state_keys = set();
    SearchProblem.depth = 0;
    SearchProblem.max_depth = max_depth;
    SearchProblem.continue_search = False;
    SearchProblem.state_count = 0;
    SearchProblem.move_count = 0;
    SearchProblem.unique_solutions = [];
    SearchProblem.num_visited = 0;
    SearchProblem.generated_states = 0;
    SearchProblem.start_time = 0.0;
    SearchProblem.started = False;
    SearchProblem.depth_state_count = {};
    SearchProblem.depth_unique_count = {};
    SearchProblem.states_by_depth = {};

    if use_hooks:
        # wire server progress and cancel hooks
        SearchProblem.cancel_check = lambda: job_cancelled(job_id);
        SearchProblem.progress_callback = lambda depth, limit: update_progress(job_id, depth, limit);
    else:
        SearchProblem.cancel_check = None;
        SearchProblem.progress_callback = None;


def clear_search_problem_hooks():
    """
    Clear web callbacks after a search finishes.
    """
    SearchProblem.cancel_check = None;
    SearchProblem.progress_callback = None;


def parse_solution_path(path):
    """
    Extract legal moves from a solution path string.
    """
    moves = tuple(move for move in str(path).split() if move in MOVES);
    return moves;


def board_to_json(board):
    """
    Convert tuple rows to JSON-safe lists.
    """
    return [list(row) for row in board];


def is_production():
    """
    Return true when production safety checks should be enforced.
    """
    return APP_ENV == "production";


def validate_bind_safety(host):
    """
    Prevent accidental public binds during local development.
    """
    if host in {"0.0.0.0", "::"} and not is_production():
        raise RuntimeError("Refusing public bind without EIGHTPUZZLE_ENV=production.");


def random_board_at_depth(depth, exclude=None):
    """
    Pick a random board using SearchProblem2 bfs layers.
    """
    if not isinstance(depth, int) or depth < 1 or depth > 31:
        raise ValueError("shuffle depth must be an integer between 1 and 31.");

    goal = (("1", "2", "3"), ("4", "5", "6"), ("7", "8", "e"));

    # serialize generation because SearchProblem stores class state
    with SOLVER_LOCK:
        reset_search_problem(None, depth, use_hooks=False);
        try:
            problem = EightPuzzle(state=goal);
            problem.is_target = lambda: False;
            problem.bfs(max_depth=depth, continue_search=True);
            candidates = [state for state in SearchProblem.states_by_depth.get(depth, []) if state != exclude];
        finally:
            clear_search_problem_hooks();

    if not candidates:
        raise ValueError("No boards are available at that difficulty.");

    return random.choice(candidates);


def challenge_depth(level):
    """
    Return the target depth for one challenge level.
    """
    if not isinstance(level, int):
        raise ValueError("level must be an integer.");

    if level < 1 or level > len(CHALLENGE_DEPTHS):
        raise ValueError(f"level must be between 1 and {len(CHALLENGE_DEPTHS)}.");

    return CHALLENGE_DEPTHS[level - 1];


def solve_board(board, algorithm, max_depth, job_id):
    """
    Run SearchProblem2 through the EightPuzzle subclass.
    """
    if algorithm not in {"bfs", "dfs"}:
        raise ValueError("Algorithm must be bfs or dfs.");

    if not isinstance(max_depth, int) or max_depth < 1 or max_depth > MAX_SEARCH_DEPTH:
        raise ValueError(f"maxDepth must be an integer between 1 and {MAX_SEARCH_DEPTH}.");

    started = time.perf_counter();

    # serialize searches because SearchProblem stores class state
    with SOLVER_LOCK:
        reset_search_problem(job_id, max_depth);
        try:
            problem = EightPuzzle(state=board);
            if algorithm == "bfs":
                problem.bfs(max_depth=max_depth, continue_search=False);
            else:
                problem.dfs(max_depth=max_depth, continue_search=False);

            # read SearchProblem2 output
            stopped_reason = "cancelled" if SearchProblem.stop and job_cancelled(job_id) else None;
            solution = SearchProblem.unique_solutions[0] if SearchProblem.unique_solutions else None;
            solved = solution is not None;
            moves = parse_solution_path(solution[0]) if solution else ();
            visited = SearchProblem.num_visited;
            unique = len(SearchProblem.unique_states);
            generated = SearchProblem.generated_states;
            depth = len(moves) if solved else None;
        finally:
            clear_search_problem_hooks();

    elapsed = time.perf_counter() - started;

    return {
        "solved": solved,
        "moves": list(moves),
        "elapsed": elapsed,
        "expanded": visited,
        "generated": generated,
        "depth": depth,
        "limit": max_depth,
        "visited": visited,
        "unique": unique,
        "stoppedReason": stopped_reason,
    };


class RequestHandler(BaseHTTPRequestHandler):
    """
    Serve static files and the JSON puzzle API.
    """
    server_version = "EightPuzzleHTTP/1.0";

    def setup(self):
        """
        Add a socket timeout to each request.
        """
        super().setup();
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS);

    def send_security_headers(self):
        """
        Send small default security headers.
        """
        self.send_header("X-Content-Type-Options", "nosniff");
        self.send_header("X-Frame-Options", "SAMEORIGIN");
        self.send_header("Referrer-Policy", "no-referrer");
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        self.send_header("Content-Security-Policy", SECURITY_POLICY);
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "public, max-age=300");

    def send_json(self, status, payload):
        """
        Send a JSON response.
        """
        data = json.dumps(payload).encode("utf-8");
        self.send_response(status);
        self.send_header("Content-Type", "application/json");
        self.send_header("Content-Length", str(len(data)));
        self.send_security_headers();
        self.end_headers();
        self.wfile.write(data);

    def read_json_body(self):
        """
        Read and validate one JSON request body.
        """
        # require json content
        content_type = self.headers.get("Content-Type", "");
        if "application/json" not in content_type:
            raise ValueError("Content-Type must be application/json.");

        # bound request size
        try:
            content_length = int(self.headers.get("Content-Length", "0"));
        except ValueError as error:
            raise ValueError("Invalid Content-Length.") from error;

        if content_length <= 0:
            raise ValueError("Request body is required.");

        if content_length > MAX_BODY_BYTES:
            raise ValueError("Request body is too large.");

        body = self.rfile.read(content_length).decode("utf-8");
        payload = json.loads(body);

        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.");

        return payload;

    def request_origin_allowed(self):
        """
        Check same-origin headers for state-changing requests.
        """
        host = self.headers.get("Host", "");
        allowed = {f"http://{host}", f"https://{host}"};

        # prefer origin when browsers provide it
        origin = self.headers.get("Origin");
        if origin:
            return origin in allowed;

        referer = self.headers.get("Referer");
        if referer:
            parsed = urlparse(referer);
            return f"{parsed.scheme}://{parsed.netloc}" in allowed;

        # allow curl and same-process tools that do not send browser headers
        return True;

    def serve_static(self, path):
        """
        Serve the built frontend safely.
        """
        relative_path = "index.html" if path == "/" else unquote(path).lstrip("/");
        requested = (FRONTEND_ROOT / relative_path).resolve();

        # block path traversal
        if FRONTEND_ROOT not in requested.parents and requested != FRONTEND_ROOT:
            self.send_error(403);
            return;

        # fall back to spa entry
        if not requested.is_file():
            requested = FRONTEND_ROOT / "index.html";

        if not requested.is_file():
            self.send_error(404, "Frontend is not built. Run ./build build.");
            return;

        data = requested.read_bytes();
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream";
        self.send_response(200);
        self.send_header("Content-Type", content_type);
        self.send_header("Content-Length", str(len(data)));
        self.send_security_headers();
        self.end_headers();
        self.wfile.write(data);

    def serve_static_head(self, path):
        """
        Send static headers without a response body.
        """
        relative_path = "index.html" if path == "/" else unquote(path).lstrip("/");
        requested = (FRONTEND_ROOT / relative_path).resolve();

        # block path traversal
        if FRONTEND_ROOT not in requested.parents and requested != FRONTEND_ROOT:
            self.send_error(403);
            return;

        # fall back to spa entry
        if not requested.is_file():
            requested = FRONTEND_ROOT / "index.html";

        if not requested.is_file():
            self.send_error(404, "Frontend is not built. Run ./build build.");
            return;

        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream";
        self.send_response(200);
        self.send_header("Content-Type", content_type);
        self.send_header("Content-Length", str(requested.stat().st_size));
        self.send_security_headers();
        self.end_headers();

    def do_HEAD(self):
        """
        Handle simple header checks.
        """
        parsed = urlparse(self.path);
        path = parsed.path;

        if path == "/healthz":
            self.send_response(200);
            self.send_header("Content-Type", "application/json");
            self.send_header("Content-Length", "12");
            self.send_security_headers();
            self.end_headers();
            return;

        if path.startswith("/api/"):
            self.send_response(404);
            self.send_header("Content-Type", "application/json");
            self.send_header("Content-Length", "35");
            self.send_security_headers();
            self.end_headers();
            return;

        self.serve_static_head(path);

    def do_GET(self):
        """
        Handle health, progress, and frontend requests.
        """
        parsed = urlparse(self.path);
        path = parsed.path;

        if path == "/healthz":
            self.send_json(200, {"ok": True});
            return;

        if path == "/api/progress":
            try:
                scoped_job_id = job_key(self, parse_qs(parsed.query).get("jobId", [""])[0]);
            except ValueError as error:
                self.send_json(400, {"error": str(error)});
                return;
            with JOB_LOCK:
                progress = JOB_PROGRESS.get(scoped_job_id, 0);
            self.send_json(200, {"progress": progress});
            return;

        if path.startswith("/api/"):
            self.send_json(404, {"error": "API endpoint not found."});
            return;

        self.serve_static(path);

    def do_POST(self):
        """
        Handle solve, shuffle, and cancel requests.
        """
        path = urlparse(self.path).path;

        try:
            # reject cross-site browser posts
            if not self.request_origin_allowed():
                self.send_json(403, {"error": "Cross-origin requests are not allowed."});
                return;

            # rate limit write endpoints
            if rate_limited(client_id(self)):
                self.send_json(429, {"error": "Too many requests. Please wait and try again."});
                return;

            payload = self.read_json_body();

            if path == "/api/cancel":
                scoped_job_id = job_key(self, payload.get("jobId", ""));
                with JOB_LOCK:
                    if scoped_job_id in ACTIVE_JOBS:
                        del ACTIVE_JOBS[scoped_job_id];
                    JOB_PROGRESS.pop(scoped_job_id, None);
                self.send_json(200, {"cancelled": True});
                return;

            if path == "/api/shuffle":
                difficulty = str(payload.get("difficulty", "medium"));
                if difficulty not in SHUFFLE_DEPTHS:
                    raise ValueError("difficulty must be easy, medium, or hard.");

                # avoid returning the same board when possible
                raw_exclude = payload.get("exclude");
                exclude = validate_board(raw_exclude) if raw_exclude is not None else None;
                depth = SHUFFLE_DEPTHS[difficulty];
                board = random_board_at_depth(depth, exclude=exclude);

                self.send_json(200, {
                    "board": board_to_json(board),
                    "difficulty": difficulty,
                    "shortestMoves": depth,
                });
                return;

            if path == "/api/challenge-board":
                level = payload.get("level", 1);
                if not isinstance(level, int):
                    level = int(level);

                depth = challenge_depth(level);
                board = random_board_at_depth(depth);

                self.send_json(200, {
                    "level": level,
                    "board": board_to_json(board),
                    "shortestMoves": depth,
                });
                return;

            if path != "/api/solve":
                self.send_json(404, {"error": "API endpoint not found."});
                return;

            # validate solve payload
            scoped_job_id = job_key(self, payload.get("jobId", ""));
            board = validate_board(payload.get("board"));
            algorithm = str(payload.get("algorithm", "bfs"));
            max_depth = payload.get("maxDepth", 18);
            if not isinstance(max_depth, int):
                max_depth = int(max_depth);

            # register active job
            with JOB_LOCK:
                if len(ACTIVE_JOBS) >= MAX_ACTIVE_JOBS:
                    self.send_json(429, {"error": "Server is busy. Please try again shortly."});
                    return;
                ACTIVE_JOBS[scoped_job_id] = True;
                JOB_PROGRESS[scoped_job_id] = 0;

            try:
                result = solve_board(board, algorithm, max_depth, scoped_job_id);
                with JOB_LOCK:
                    JOB_PROGRESS[scoped_job_id] = 100;
            finally:
                with JOB_LOCK:
                    ACTIVE_JOBS.pop(scoped_job_id, None);
                    JOB_PROGRESS.pop(scoped_job_id, None);

            self.send_json(200, result);
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)});
        except Exception as error:
            print(f"solver failed: {error}");
            self.send_json(500, {"error": "Solver failed."});


def main():
    """
    Start the local web server.
    """
    parser = argparse.ArgumentParser(description="Run the Eight Puzzle web app.");
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"));
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8001")));
    args = parser.parse_args();

    validate_bind_safety(args.host);
    os.chdir(PROJECT_ROOT);
    server = ThreadingHTTPServer((args.host, args.port), RequestHandler);
    print(f"8puzzle.exe running at http://{args.host}:{args.port}");

    try:
        server.serve_forever();
    except KeyboardInterrupt:
        pass;
    finally:
        server.server_close();


if __name__ == "__main__":
    main();
