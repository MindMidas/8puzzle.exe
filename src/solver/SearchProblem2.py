import time;
from collections import deque;

class SearchProblem:
  """
  This class represents the superclass for a search problem.
  
  The class itself rerpresents a specific search problem
  (graph), while instances of the class represent states
  (nodes) of the problem.

  Programmers should subclass this superclass filling in
  specific versions of the methods that are stubbed below.
  """

  stop = False;	# class variable to end search - single variable 
                # accessible to all instances of the class

  visited = [];	# class variable that holds the states visited
                # along the path to the current node - used to
                # avoid loops

  unique_states = []; # class variable that holds unique states
                      # visited by a search
  
  unique_state_keys = set(); # fast membership check for unique states

  depth = 0;  # class variable that holds the depth the dfs has
              # reached, used to avoid exceeding max recursion
              # depth

  max_depth = 18;    # maximum search depth
                     # to search

  continue_search = False;
                # choose whether the search algorithm should
                # continue to search for more solutions after it has found
                # one

  state_count = 0; # class variable that holds the number of
                   # states at a given depth

  move_count = 0; # class variable that holds the number of
                  # moves that are possible from a given depth

  unique_solutions = []; # list of unique solutions
  
  num_visited = 0; # track num visited

  generated_states = 0; # track child states produced while searching
  
  start_time = 0.0; # timer
  
  started = False; # keep track of started or not
  
  depth_state_count = {}; # dictionary for depth and total states
  
  depth_unique_count = {}; # dictionary for depth and unique states

  states_by_depth = {}; # dictionary for edge depth and generated states

  cancel_check = None; # optional callback to cancel long-running searches
  
  progress_callback = None; # optional callback for current depth



  def __init__( self, state=None ):
    """
    Stub
    Constructor function for a search problem.

    Each subclass should supply a constructor method that can
    operate with no arguments other than the implicit "self"
    argument to create the start state of a problem.

    It should also supply a constructor method that accepts a
    "state" argument containing a string that represents an
    arbitrary state in the given search problem.

    It should also initialize the "path" member variable to a
    (blank) string.
    """
    raise NotImplementedError("__init__");

  def edges( self ):
    """
    Stub
    This method must supply a list or iterator for the Edges
    leading out of the current state.
    """
    raise NotImplementedError("edges");

  def is_target( self ):
    """
    Stub
    This method must return True if the current state is a goal
    state and False otherwise.
    """

    raise NotImplementedError("is_target");

  def __repr__( self ):
    """
    This method must return a string representation of the
    current state which can be "eval"ed to generate an instance
    of the current state.
    """

    return self.__class__.__name__ + "( " + repr(self.state) + \
    ")";

  def target_found( self ):
    """
    This method is called when the target is found.

    By default it prints out the path that was followed to get
    to the current state.
    """
    
    elapsed_time = time.perf_counter() - SearchProblem.start_time;
    
    SearchProblem.unique_solutions.append((str(self.path), 
                                           SearchProblem.depth, 
                                           SearchProblem.num_visited,
                                           len(SearchProblem.unique_states),
                                           elapsed_time,));
  def dfs( self, max_depth=None, continue_search=None ):
    """
    Perform a depth first search originating from the node,
    "self".
    Recursive method.
    """
    
    # record the start time on first call
    if SearchProblem.depth == 0 and not SearchProblem.started:
      SearchProblem.start_time = time.perf_counter();
      SearchProblem.started = True;
    
    if continue_search:
      SearchProblem.continue_search = continue_search;
    
    if max_depth:
      SearchProblem.max_depth = max_depth;

    # increase depth for each recursive call
    SearchProblem.depth += 1;
    
    # number of states visited
    SearchProblem.num_visited += 1;

    # prepare depth counters
    if SearchProblem.depth not in SearchProblem.depth_state_count:
        SearchProblem.depth_state_count[SearchProblem.depth] = 0;
        SearchProblem.depth_unique_count[SearchProblem.depth] = 0;

    state_key = repr(self.state);
    if state_key not in SearchProblem.unique_state_keys:
      SearchProblem.depth_unique_count[SearchProblem.depth] += 1;
      SearchProblem.unique_state_keys.add(state_key);
      SearchProblem.unique_states.append(self.state);

    SearchProblem.depth_state_count[SearchProblem.depth] += 1;
    
    if SearchProblem.stop: # check class variable and stop
                           # searching...
      return;
    
    if SearchProblem.cancel_check and SearchProblem.cancel_check():
      SearchProblem.stop = True;
      return;
    
    if SearchProblem.progress_callback:
      SearchProblem.progress_callback(SearchProblem.depth, SearchProblem.max_depth);

    if (SearchProblem.depth > SearchProblem.max_depth):
                                      # check class variable and
                                      # stop search that exceeds
                                      # desired recursion depth
      return;

    # check to see if the start state is already the target
    if SearchProblem.depth==1 and self.is_target():
      self.target_found();

      if not SearchProblem.continue_search:
        SearchProblem.stop = True;
        return;

    for action in self.edges(): # consider each edge leading out
                                # of this node

      SearchProblem.generated_states += 1;

      action.destination.path = self.path + " " + str(action.label);	
					# get the label associated with the
					# action and append it to the path
					# string

      if repr(action.destination.state) in \
      SearchProblem.visited:
        continue;          # skip if we've visited this one
                           # before

      SearchProblem.visited.append( repr(self.state) );

      if action.destination.is_target(): 
        # check if destination of edge is target node
        action.destination.target_found();  # perform target
                                            # found action
        if not SearchProblem.continue_search:  # stop searching if not
                                        # required
          SearchProblem.stop = True;    # set class variable to
                                        # record that we
          break;                        # are done

      action.destination.dfs();            # resume recursive
                                           # search

      SearchProblem.visited.pop();
      SearchProblem.depth -= 1;
      
  def bfs( self, max_depth=None, continue_search=None ):
    """
    Perform a breadth-first search (BFS) up to a specified depth.
    max_depth: The maximum depth to search.
    """
    
    if continue_search:
      SearchProblem.continue_search = continue_search;
      
    if max_depth:
      SearchProblem.max_depth = max_depth;
    
    # record the start time
    SearchProblem.start_time = time.perf_counter();
    
    # set queue on first call
    queue = deque([(self, set(), 1,)]);
    
    # add start state to visited
    SearchProblem.visited = {repr(self.state)};
    
    while queue:
      
      # pop first element in the queue and set variables
      curr_state, path, SearchProblem.depth = queue.popleft();
      
      if SearchProblem.cancel_check and SearchProblem.cancel_check():
        SearchProblem.stop = True;
        return;
      
      if SearchProblem.progress_callback:
        SearchProblem.progress_callback(SearchProblem.depth - 1, SearchProblem.max_depth);
      
      # stop searching if max depth reached
      if SearchProblem.depth > SearchProblem.max_depth + 1:
        return;
      
      # number of states visited
      SearchProblem.num_visited += 1;
      
      # set dictionary at current depth if not done
      if SearchProblem.depth not in SearchProblem.depth_state_count:
          SearchProblem.depth_unique_count[SearchProblem.depth] = 0;
          SearchProblem.depth_state_count[SearchProblem.depth] = 0;
      
      # check if state is unique and append
      state_key = repr(curr_state.state);
      if state_key not in SearchProblem.unique_state_keys:
        SearchProblem.depth_unique_count[SearchProblem.depth] += 1;
        SearchProblem.unique_state_keys.add(state_key);
        SearchProblem.unique_states.append(curr_state.state); # add unique state
        
        # store bfs layers by move count for board generation
        edge_depth = SearchProblem.depth - 1;
        if edge_depth not in SearchProblem.states_by_depth:
          SearchProblem.states_by_depth[edge_depth] = [];
        SearchProblem.states_by_depth[edge_depth].append(curr_state.state);
      
      # increment visited dictionary at depth
      SearchProblem.depth_state_count[SearchProblem.depth] += 1;
      
      # check if current state is target
      if curr_state.is_target():
        
        SearchProblem.depth -= 1; # depth is edge not node
        
        # log solution
        curr_state.target_found();
        
        SearchProblem.depth += 1; # reset after logging
        
        # exit if continue_search is false
        if not SearchProblem.continue_search:
          return;
        
      # consider each edge leading out of current node
      for action in curr_state.edges():
        
        SearchProblem.generated_states += 1;
        
        # looping path ignore
        if repr(action.destination.state) in path:
          continue;
        
        # copy current_state path and add current_state to path 
        action_path = path.copy();
        action_path.add(repr(curr_state.state));
        
        # set action label to current path + action label
        action.destination.path = curr_state.path + " " + str(action.label);

        # check if unvisited and add to queue
        if repr(action.destination.state) not in SearchProblem.visited:
            SearchProblem.visited.add(repr(action.destination.state));
            queue.append((action.destination, action_path, SearchProblem.depth + 1));
        

class Edge:
  """
  This class represents an edge between two nodes in a
  SearchProblem.
  Each edge has a "source" (which is a subclass of
  SearchProblem), a "destination" (also a subclass of
  SearchProblem) and a text "label".
  """

  def __init__( self, source, label, destination ):
    """
    Constructor function assigns member variables "source",
    "label" and "destination" as specified.
    """
    self.source = source;
    self.label = label;
    self.destination = destination;

  def __repr__( self ):
    return "Edge(" + repr( self.source ) + "," + \
                     repr( self.label ) + "," + \
                     repr( self.destination ) + ")";
