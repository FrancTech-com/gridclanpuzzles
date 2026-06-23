package com.gridclan.anticheat;

import java.util.List;
import java.util.Map;

/**
 * GridLockdownValidator
 * Validates tile drag moves against the current authoritative board state.
 * Server checks every drag step — no client-computed sequences accepted.
 */
class GridLockdownValidator {

    @SuppressWarnings("unchecked")
    static boolean isLegalMove(Object boardState, Object move) {
        try {
            Map<String, Object> board = (Map<String, Object>) boardState;
            Map<String, Object> m     = (Map<String, Object>) move;

            int fromX = (int) m.get("fromX");
            int fromY = (int) m.get("fromY");
            int toX   = (int) m.get("toX");
            int toY   = (int) m.get("toY");

            List<List<Integer>> grid = (List<List<Integer>>) board.get("grid");
            int rows = grid.size();
            int cols = grid.get(0).size();

            // Basic bounds check
            if (fromX < 0 || fromX >= cols || fromY < 0 || fromY >= rows) return false;
            if (toX   < 0 || toX   >= cols || toY   < 0 || toY   >= rows) return false;

            // Must be orthogonally adjacent (no diagonal drags)
            int dx = Math.abs(toX - fromX);
            int dy = Math.abs(toY - fromY);
            if (!((dx == 1 && dy == 0) || (dx == 0 && dy == 1))) return false;

            // Source cell must be occupied; destination must be empty
            int srcCell  = grid.get(fromY).get(fromX);
            int destCell = grid.get(toY).get(toX);
            return srcCell != 0 && destCell == 0;

        } catch (Exception e) {
            return false;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * SumCipherValidator
 * Verifies that the submitted digit placement is mathematically valid
 * given the current cipher state. Rejects impossible sums outright.
 */
class SumCipherValidator {

    @SuppressWarnings("unchecked")
    static boolean isMathematicallyValid(Object boardState, Object move) {
        try {
            Map<String, Object> board = (Map<String, Object>) boardState;
            Map<String, Object> m     = (Map<String, Object>) move;

            int cellIndex = (int) m.get("cellIndex");
            int digit     = (int) m.get("digit");

            if (digit < 1 || digit > 9) return false;

            List<Integer> cells  = (List<Integer>) board.get("cells");
            List<Integer> target = (List<Integer>) board.get("targetSums");

            if (cellIndex < 0 || cellIndex >= cells.size()) return false;
            if (cells.get(cellIndex) != 0) return false; // Cell already filled

            // Domain-specific: verify digit doesn't violate any partial sum constraint
            // (Full constraint propagation implemented per puzzle generation spec)
            List<List<Integer>> groups = (List<List<Integer>>) board.get("groups");
            for (int gi = 0; gi < groups.size(); gi++) {
                List<Integer> group = groups.get(gi);
                if (!group.contains(cellIndex)) continue;

                int sum = digit;
                for (int idx : group) {
                    if (idx != cellIndex) sum += cells.get(idx);
                }
                int tgt = target.get(gi);
                // Partial sum cannot already exceed target
                if (sum > tgt) return false;
            }
            return true;

        } catch (Exception e) {
            return false;
        }
    }
}

// ──────────────────────────────────────────────────────────────────────────────

/**
 * LinkedRushValidator
 * Validates that the submitted node path forms a valid connected
 * traversal through the live graph state. Prevents phantom connections.
 */
class LinkedRushValidator {

    @SuppressWarnings("unchecked")
    static boolean isConnectedPath(Object boardState, Object move) {
        try {
            Map<String, Object> board = (Map<String, Object>) boardState;
            Map<String, Object> m     = (Map<String, Object>) move;

            int fromNode = (int) m.get("fromNode");
            int toNode   = (int) m.get("toNode");

            // Graph adjacency list keyed by node index
            Map<String, List<Integer>> adj =
                (Map<String, List<Integer>>) board.get("adjacency");

            List<Integer> neighbours = adj.get(String.valueOf(fromNode));
            if (neighbours == null) return false;

            // Destination must be a live adjacent node
            if (!neighbours.contains(toNode)) return false;

            // Destination must not be already visited in current chain
            List<Integer> visited = (List<Integer>) board.get("visitedNodes");
            return visited == null || !visited.contains(toNode);

        } catch (Exception e) {
            return false;
        }
    }
}
