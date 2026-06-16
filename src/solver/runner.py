from src.solver.EightPuzzle import EightPuzzle;
from src.solver.SearchProblem2 import SearchProblem;
import argparse;
import time;
import random;
import json;
import os;


def reset_search_problem():
    """
    Reset the shared SearchProblem2 class state.
    """
    # clear shared search state
    SearchProblem.stop = False;
    SearchProblem.visited = [];
    SearchProblem.unique_states = [];
    SearchProblem.unique_state_keys = set();
    SearchProblem.depth = 0;
    SearchProblem.continue_search = False;
    SearchProblem.state_count = 0;
    SearchProblem.move_count = 0;
    SearchProblem.unique_solutions = [];
    SearchProblem.num_visited = 0;
    SearchProblem.start_time = 0.0;
    SearchProblem.depth_state_count = {};
    SearchProblem.depth_unique_count = {};
    

def WriteSolutions(problem_type, 
                   dfs_solutions, bfs_solutions, 
                   start_state, 
                   max_depth, 
                   result_match, 
                   dfs_unique_dictionary, bfs_unique_dictionary, 
                   dfs_visited_dictionary, bfs_visited_dictionary, 
                   dfs_time, bfs_time, 
                   dfs_unique, bfs_unique, 
                   dfs_visited, bfs_visited, 
                   filename="results.json", 
                   append=True):
    """
    Write a summary of DFS and BFS results to JSON.
    """
    # handle no solution cases
    dfs_sol_one = dfs_solutions[0] if dfs_solutions else None;
    bfs_sol_one = bfs_solutions[0] if bfs_solutions else None;
    winner = None;
    time_to_first = None;
    path = None;
    depth = None;

    if dfs_sol_one and bfs_sol_one:
        winner = "dfs" if dfs_sol_one[4] < bfs_sol_one[4]  else "bfs";
        time_to_first = min(dfs_sol_one[4], bfs_sol_one[4]);
        path = dfs_sol_one[0] if winner == "dfs" else bfs_sol_one[0];
        depth = dfs_sol_one[1] if winner == "dfs" else bfs_sol_one[1];
    elif dfs_sol_one:
        winner = "dfs";
        time_to_first = dfs_sol_one[4];
        path = dfs_sol_one[0];
        depth = dfs_sol_one[1];
    elif bfs_sol_one:
        winner = "bfs";
        time_to_first = bfs_sol_one[4];
        path = bfs_sol_one[0];
        depth = bfs_sol_one[1];

    summary = {
        "problem": problem_type,
        "start_state": start_state,
        "max_depth": max_depth,
        "matching_results": result_match,
        "dfs_time": dfs_time,
        "bfs_time": bfs_time,
        "dfs_solutions": len(dfs_solutions),
        "bfs_solutions": len(bfs_solutions),
        "winner": winner,
        "time_to_1st_solution": time_to_first,
        "path_to_1st_solution": path,
        "solution_depth": depth,
        "dfs_unique_states": dfs_unique,
        "bfs_unique_states": bfs_unique,
        "dfs_states_visited": dfs_visited,
        "bfs_states_visited": bfs_visited,
    }
    
    # unique depth analysis
    unique_depth_analysis = {
        "dfs_unique_depth_analysis": {
            str(depth): count for depth, count in dfs_unique_dictionary.items()
        },
        "bfs_unique_depth_analysis": {
            str(depth): count for depth, count in bfs_unique_dictionary.items()
        },
    }
    
    # visited depth analysis
    visited_depth_analysis = {
        "dfs_visited_depth_analysis": {
            str(depth): count for depth, count in dfs_visited_dictionary.items()
        },
        "bfs_visited_depth_analysis": {
            str(depth): count for depth, count in bfs_visited_dictionary.items()
        },
    }

    # non-looping paths to solution
    dfs_results = [
        {
            "path": solution[0],
            "depth": solution[1],
            "num_visited": solution[2],
            "unique_states_at_solution": solution[3],
            "time": solution[4],
        }
        for solution in dfs_solutions
    ]

    bfs_results = [
        {
            "path": solution[0],
            "depth": solution[1],
            "num_visited": solution[2],
            "unique_states_at_solution": solution[3],
            "time": solution[4],
        }
        for solution in bfs_solutions
    ]

    # structure to write to file
    log_entry = {
        "summary": summary,
        "unique_depth_analysis": unique_depth_analysis,
        "visited_depth_analysis": visited_depth_analysis,
        "dfs_results": dfs_results,
        "bfs_results": bfs_results,
        
    }

    # write or append to the JSON file
    try:
        if append and os.path.exists(filename):
            with open(filename, "r+") as file:
                # load existing data
                file.seek(0);
                try:
                    existing_data = json.load(file);
                except json.JSONDecodeError:
                    existing_data = [];

                # add comma if existing data is non-empty
                if existing_data:
                    existing_data.append(log_entry);
                else:
                    existing_data = [log_entry];

                # write back to file
                file.seek(0);
                json.dump(existing_data, file, indent=4);
                file.truncate();
        else:
            # overwrite file with new data
            with open(filename, "w") as file:
                json.dump([log_entry], file, indent=4);
    except Exception as e:
        print(f"error writing to {filename}: {e}");

def CompareSolutions(solutions1, solutions2):
    """
    Compare solution path sets from two searches.
    """
    # extract paths from solutions
    paths1 = {solution[0] for solution in solutions1};
    paths2 = {solution[0] for solution in solutions2};

    # compare paths
    return paths1 == paths2;

def RandomPuzzles(filename, num_states=50):
    """
    Generate random start states and save them to JSON.
    """
    states = [];
    for _ in range(num_states):
        # generate a random start state by shuffling the tiles
        tiles = ["1", "2", "3", "4", "5", "6", "7", "8", "e"];
        random.shuffle(tiles);
        state = [tiles[:3], tiles[3:6], tiles[6:]];
        states.append(state);

    # save the states as a list in a JSON file
    with open(filename, "w") as file:
        json.dump(states, file, indent=4);

def GetPuzzle(filename, index=0):
    """
    Load one puzzle from a JSON file.
    """
    with open(filename, "r") as file:
        puzzles = json.load(file);
        if 0 <= index < len(puzzles):
            # convert to tuples
            return tuple(tuple(row) for row in puzzles[index]);
        else:
            raise IndexError("Index out of range for puzzles in file.");

if __name__ == "__main__":
    # set up args parsing
    parser = argparse.ArgumentParser(
        description="Run Eight Puzzle with BFS, DFS, or both",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        "algorithm",
        choices=["dfs", "bfs", "both"],
        help="search algorithm to use (dfs, bfs, or both)"
    )
    parser.add_argument(
        "-c",
        action="store_true",
        default=False,
        help="continue searching"
    )
    parser.add_argument(
        "-d",
        type=int,
        default=25,
        help="search up to max depth"
    )
    parser.add_argument(
        "-l",
        action="store_true",
        default=False,
        help="run algorithm on 50 random puzzles"
    )
    
    args = parser.parse_args();

    # execute the algorithms based on the argument
    if args.algorithm in ["dfs", "bfs", "both"]:
        print(f"running {args.algorithm} on eightpuzzle with continue_search={args.c}");

        RandomPuzzles("50Puzzles.txt");

        loop = 50 if args.l else 1;

        for i in range(loop):
            problem_type = "Eight Puzzle Problem";
            start_state = GetPuzzle("50Puzzles.txt", index=i);
            problem = EightPuzzle(state=start_state);

            # initialize result containers
            dfs_solutions = [];
            bfs_solutions = [];
            dfs_time, bfs_time = None, None;
            dfs_visited, bfs_visited = 0, 0;
            dfs_unique, bfs_unique = 0, 0;
            dfs_unique_dictionary = {};
            dfs_visited_dictionary = {};
            
            bfs_unique_dictionary = {};
            bfs_visited_dictionary = {};

            # run dfs
            if args.algorithm in ["dfs", "both"]:
                reset_search_problem();
                
                # log time
                dfs_time = time.perf_counter();
                problem.dfs(max_depth=args.d, continue_search=args.c);
                dfs_time = time.perf_counter() - dfs_time;
                
                # save dfs results
                dfs_visited_dictionary = SearchProblem.depth_state_count;
                dfs_unique_dictionary = SearchProblem.depth_unique_count;
                dfs_unique = len(SearchProblem.unique_states);
                dfs_solutions = SearchProblem.unique_solutions;
                dfs_visited = SearchProblem.num_visited;
            
            # run bfs
            if args.algorithm in ["bfs", "both"]:
                reset_search_problem();
                
                # log time
                bfs_time = time.perf_counter();
                problem.bfs(max_depth=args.d, continue_search=args.c);
                bfs_time = time.perf_counter() - bfs_time;
                
                # save bfs results
                bfs_unique_dictionary = SearchProblem.depth_unique_count;
                bfs_visited_dictionary = SearchProblem.depth_state_count;
                bfs_unique = len(SearchProblem.unique_states);
                bfs_solutions = SearchProblem.unique_solutions;
                bfs_visited = SearchProblem.num_visited;
                
            # compare results and log
            if args.algorithm == "both":
                result = CompareSolutions(dfs_solutions, bfs_solutions);
            else: 
                result = "N/A";

            # determine whether to append to the file
            append = False if i == 0 else True;
            
            # log solutions
            WriteSolutions( problem_type=problem_type,
                            dfs_solutions=dfs_solutions,
                            bfs_solutions=bfs_solutions,
                            start_state=start_state,
                            max_depth=args.d,
                            result_match=result,
                            dfs_unique_dictionary=dfs_unique_dictionary,
                            bfs_unique_dictionary=bfs_unique_dictionary,
                            dfs_visited_dictionary=dfs_visited_dictionary,
                            bfs_visited_dictionary=bfs_visited_dictionary,
                            dfs_time=dfs_time,
                            bfs_time=bfs_time,
                            dfs_unique=dfs_unique,
                            bfs_unique=bfs_unique,
                            dfs_visited=dfs_visited,
                            bfs_visited=bfs_visited,
                            filename="results.json",
                            append=append
                           );

        print("search completed, solutions saved in results.json\n");
