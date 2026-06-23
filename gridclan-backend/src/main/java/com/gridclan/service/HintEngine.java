package com.gridclan.service;

import com.gridclan.entity.enums.GameType;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Server-side hint engine.
 *
 * Hints are BLOCKED for COMMUNITY_TOURNAMENT sessions — enforced in
 * GameSessionService.requestHint() BEFORE this class is ever called.
 *
 * For allowed tiers: computes the next best move suggestion and
 * returns it as hint data. Points (50) are deducted in the service
 * layer before the hint is returned, so a disconnect cannot grant
 * a free hint.
 */
@Component
public class HintEngine {

    public Object compute(GameType type, Map<String, Object> boardState) {
        return switch (type) {
            case GRID_LOCKDOWN -> hintGridLockdown(boardState);
            case SUM_CIPHER    -> hintSumCipher(boardState);
            case LINKED_RUSH   -> hintLinkedRush(boardState);
        };
    }

    @SuppressWarnings("unchecked")
    private Object hintGridLockdown(Map<String, Object> board) {
        List<List<Integer>> grid    = (List<List<Integer>>) board.get("grid");
        List<List<Integer>> target  = (List<List<Integer>>) board.get("targetPattern");
        int rows = grid.size(), cols = grid.get(0).size();

        // Find first cell that differs from target and suggest moving it
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (!grid.get(r).get(c).equals(target.get(r).get(c))) {
                    int targetVal = target.get(r).get(c);
                    // Find where targetVal currently is
                    for (int sr = 0; sr < rows; sr++) {
                        for (int sc = 0; sc < cols; sc++) {
                            if (grid.get(sr).get(sc).equals(targetVal)) {
                                return Map.of(
                                    "type",    "MOVE_SUGGESTION",
                                    "fromX",   sc, "fromY", sr,
                                    "toX",     c,  "toY",   r,
                                    "message", "Move this tile to match the target pattern"
                                );
                            }
                        }
                    }
                }
            }
        }
        return Map.of("type", "NONE", "message", "Puzzle is already solved!");
    }

    @SuppressWarnings("unchecked")
    private Object hintSumCipher(Map<String, Object> board) {
        List<Integer> cells   = (List<Integer>) board.get("cells");
        List<Integer> targets = (List<Integer>) board.get("targetSums");
        List<List<Integer>> groups = (List<List<Integer>>) board.get("groups");

        // Find the first empty cell that has only one valid digit option
        for (int i = 0; i < cells.size(); i++) {
            if (cells.get(i) != 0) continue;
            final int cellIdx = i;

            for (int digit = 1; digit <= 9; digit++) {
                boolean valid = true;
                for (int gi = 0; gi < groups.size(); gi++) {
                    List<Integer> group = groups.get(gi);
                    if (!group.contains(cellIdx)) continue;
                    int partial = digit;
                    for (int idx : group) {
                        if (idx != cellIdx) partial += cells.get(idx);
                    }
                    if (partial > targets.get(gi)) { valid = false; break; }
                }
                if (valid) {
                    return Map.of(
                        "type",      "DIGIT_SUGGESTION",
                        "cellIndex", cellIdx,
                        "digit",     digit,
                        "message",   "Try placing " + digit + " in this cell"
                    );
                }
            }
        }
        return Map.of("type", "NONE", "message", "Check your current entries for conflicts.");
    }

    @SuppressWarnings("unchecked")
    private Object hintLinkedRush(Map<String, Object> board) {
        int currentNode = (int) board.get("currentNode");
        List<Integer> visited = (List<Integer>) board.get("visitedNodes");
        Map<String, List<Integer>> adj = (Map<String, List<Integer>>) board.get("adjacency");

        // Suggest the next unvisited neighbour
        List<Integer> neighbours = adj.getOrDefault(String.valueOf(currentNode), List.of());
        for (int neighbour : neighbours) {
            if (!visited.contains(neighbour)) {
                return Map.of(
                    "type",     "NODE_SUGGESTION",
                    "toNode",   neighbour,
                    "message",  "Move to node " + neighbour + " — it is unvisited"
                );
            }
        }
        return Map.of("type", "STUCK", "message", "No unvisited neighbours from current node.");
    }
}
