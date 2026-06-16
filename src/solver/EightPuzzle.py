from src.solver.SearchProblem2 import SearchProblem, Edge;

class EightPuzzle(SearchProblem):
    """
    This class is a subclass of SearchProblem and implements
    the logic for Eight-Puzzle Problem.
    """

    def __init__(self, state=(("1", "2", "3"), ("5", "6", "8"), ("4", "7", "e"))):
        """
        Constructor function which initializes the start state
        and the path. 

        The tuple 'state' represents the positions of each tile
        on the board, represented in a matrix form:
        ( ((0,0), (0,1), (0,2)),
          ((1,0), (1,1), (1,2)),
          ((2,0), (2,1), (2,2)) )
        
        Example: ( ("2", "3", "1"), 
                  ("4", "5", "6"),
                  ("7", "8", "e") )
        Each number here represents the tile number in the puzzle,
        "1" represents tile 1, "2" represents tile 2, and so on.
        "e" is the empty spot, which has no tile.

        Start state was randomly set.
        """
        self.state = state; # store board state
        self.path = ""; # initialize path to blank string

    
    def edges(self):
        """
        Generate all valid states from the current state.
        
        An edge represents the next possible move.
        
        This method returns a list of valid state objects.
        """
        
        # find the empty tile
        empty_tile_pos = next((x, y) for x, row in enumerate(self.state) for y, tile in enumerate(row) if tile == "e");
        
        valid_states = [];
        
        # check for solution
        if self.is_target():
            return valid_states;
        
        # generate new states
        for move in ["left", "right", "up", "down"]:
            new_state = [list(row) for row in self.state];

            x_pos, y_pos = empty_tile_pos;
            # move empty block left
            if move == "left" and y_pos > 0 :
                new_state[x_pos][y_pos] = new_state[x_pos][y_pos - 1]; # swap right
                new_state[x_pos][y_pos - 1] = "e"; # swap left
            
            # move empty block right
            elif move == "right" and y_pos < 2:
                new_state[x_pos][y_pos] = new_state[x_pos][y_pos + 1]; # swap left
                new_state[x_pos][y_pos + 1] = "e"; # swap right
            
            # move empty block up
            elif move == "up" and x_pos > 0:
                new_state[x_pos][y_pos] = new_state[x_pos - 1][y_pos]; # swap down
                new_state[x_pos - 1][y_pos] = "e"; # swap up
            
            # move empty block down
            elif move == "down" and x_pos < 2:
                new_state[x_pos][y_pos] = new_state[x_pos + 1][y_pos]; # swap up
                new_state[x_pos + 1][y_pos] = "e"; # swap down
            
            # exit when all possible moves exhausted
            else:
                continue;
            
            valid_states.append(Edge(self, move, EightPuzzle(tuple(tuple(row) for row in new_state))));
            
        return valid_states;

    def is_target(self):
        """
        Check if target state achieved.
        """
        return self.state == (("1", "2", "3"), ("4", "5", "6"), ("7", "8", "e"));
