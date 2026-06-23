package com.gridclan.service;

import com.gridclan.entity.enums.GameType;
import lombok.Getter;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Server-side board generator and move applicator.
 *
 * Generates the initial authoritative board state for each game type,
 * and applies validated moves to produce the next board state.
 *
 * CLIENT NEVER TOUCHES THIS LOGIC. The board is generated here,
 * sent to the client as a display payload, and replaced entirely
 * after each confirmed move.
 */
@Component
public class GameBoardGenerator {

    // ── Board Generation ───────────────────────────────────────────────────

    public Map<String, Object> generate(GameType type) {
        return switch (type) {
            case GRID_LOCKDOWN -> generateGridLockdown();
            case SUM_CIPHER    -> generateSumCipher();
            case LINKED_RUSH   -> generateLinkedRush();
        };
    }

    private Map<String, Object> generateGridLockdown() {
        // 6×6 grid of tiles (0 = empty, 1–4 = tile colour)
        int rows = 6, cols = 6;
        Random rng = new Random();
        List<List<Integer>> grid = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            List<Integer> row = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                row.add(rng.nextInt(5));  // 0=empty, 1-4=colour
            }
            grid.add(row);
        }
        Map<String, Object> board = new LinkedHashMap<>();
        board.put("type", "GRID_LOCKDOWN");
        board.put("rows", rows);
        board.put("cols", cols);
        board.put("grid", grid);
        board.put("solved", false);
        board.put("targetPattern", generateTargetPattern(rows, cols, rng));
        return board;
    }

    private List<List<Integer>> generateTargetPattern(int rows, int cols, Random rng) {
        List<List<Integer>> pattern = new ArrayList<>();
        for (int r = 0; r < rows; r++) {
            List<Integer> row = new ArrayList<>();
            for (int c = 0; c < cols; c++) {
                row.add(rng.nextInt(5));
            }
            pattern.add(row);
        }
        return pattern;
    }

    private Map<String, Object> generateSumCipher() {
        // 9 cells arranged in groups with target sums
        int size = 9;
        int[] solution = new int[size];
        Random rng = new Random();
        for (int i = 0; i < size; i++) solution[i] = rng.nextInt(9) + 1;

        List<List<Integer>> groups = List.of(
            List.of(0, 1, 2),
            List.of(3, 4, 5),
            List.of(6, 7, 8),
            List.of(0, 3, 6),
            List.of(1, 4, 7),
            List.of(2, 5, 8)
        );
        List<Integer> targets = new ArrayList<>();
        for (List<Integer> group : groups) {
            int sum = group.stream().mapToInt(i -> solution[i]).sum();
            targets.add(sum);
        }

        // Cells start empty (0) — player fills them in
        List<Integer> cells = new ArrayList<>(Collections.nCopies(size, 0));

        Map<String, Object> board = new LinkedHashMap<>();
        board.put("type", "SUM_CIPHER");
        board.put("cells", cells);
        board.put("groups", groups);
        board.put("targetSums", targets);
        board.put("solved", false);
        return board;
    }

    private Map<String, Object> generateLinkedRush() {
        // 8-node graph with random adjacency
        int nodes = 8;
        Random rng = new Random();
        Map<String, List<Integer>> adjacency = new LinkedHashMap<>();
        for (int i = 0; i < nodes; i++) {
            List<Integer> neighbours = new ArrayList<>();
            for (int j = 0; j < nodes; j++) {
                if (i != j && rng.nextBoolean()) neighbours.add(j);
            }
            adjacency.put(String.valueOf(i), neighbours);
        }

        int startNode = rng.nextInt(nodes);
        Map<String, Object> board = new LinkedHashMap<>();
        board.put("type", "LINKED_RUSH");
        board.put("nodeCount", nodes);
        board.put("adjacency", adjacency);
        board.put("currentNode", startNode);
        board.put("visitedNodes", List.of(startNode));
        board.put("targetScore", nodes);  // Visit all nodes
        board.put("solved", false);
        return board;
    }

    // ── Move Application ───────────────────────────────────────────────────

    public MoveResult applyMove(GameType type, Map<String, Object> board, Object move) {
        return switch (type) {
            case GRID_LOCKDOWN -> applyGridMove(board, move);
            case SUM_CIPHER    -> applySumMove(board, move);
            case LINKED_RUSH   -> applyRushMove(board, move);
        };
    }

    @SuppressWarnings("unchecked")
    private MoveResult applyGridMove(Map<String, Object> board, Object moveObj) {
        Map<String, Object> newBoard = deepCopy(board);
        Map<String, Object> move = (Map<String, Object>) moveObj;
        List<List<Integer>> grid = (List<List<Integer>>) newBoard.get("grid");

        int fromX = (int) move.get("fromX"), fromY = (int) move.get("fromY");
        int toX   = (int) move.get("toX"),   toY   = (int) move.get("toY");

        int tile = grid.get(fromY).get(fromX);
        grid.get(fromY).set(fromX, 0);
        grid.get(toY).set(toX, tile);
        newBoard.put("grid", grid);

        boolean solved = grid.equals(newBoard.get("targetPattern"));
        newBoard.put("solved", solved);
        return new MoveResult(newBoard, solved);
    }

    @SuppressWarnings("unchecked")
    private MoveResult applySumMove(Map<String, Object> board, Object moveObj) {
        Map<String, Object> newBoard = deepCopy(board);
        Map<String, Object> move = (Map<String, Object>) moveObj;
        List<Integer> cells = new ArrayList<>((List<Integer>) newBoard.get("cells"));

        int cellIndex = (int) move.get("cellIndex");
        int digit     = (int) move.get("digit");
        cells.set(cellIndex, digit);
        newBoard.put("cells", cells);

        // Solved when all cells are filled
        boolean solved = cells.stream().noneMatch(c -> c == 0);
        newBoard.put("solved", solved);
        return new MoveResult(newBoard, solved);
    }

    @SuppressWarnings("unchecked")
    private MoveResult applyRushMove(Map<String, Object> board, Object moveObj) {
        Map<String, Object> newBoard = deepCopy(board);
        Map<String, Object> move = (Map<String, Object>) moveObj;
        int toNode = (int) move.get("toNode");

        newBoard.put("currentNode", toNode);
        List<Integer> visited = new ArrayList<>((List<Integer>) newBoard.get("visitedNodes"));
        visited.add(toNode);
        newBoard.put("visitedNodes", visited);

        int targetScore = (int) newBoard.get("targetScore");
        boolean solved  = visited.size() >= targetScore;
        newBoard.put("solved", solved);
        return new MoveResult(newBoard, solved);
    }

    private Map<String, Object> deepCopy(Map<String, Object> original) {
        // Simple deep copy via serialization-free clone
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : original.entrySet()) {
            Object v = entry.getValue();
            if (v instanceof List<?> list) {
                List<Object> newList = new ArrayList<>();
                for (Object item : list) {
                    newList.add(item instanceof List ? new ArrayList<>((List<?>) item) : item);
                }
                copy.put(entry.getKey(), newList);
            } else {
                copy.put(entry.getKey(), v);
            }
        }
        return copy;
    }

    // ── Inner result wrapper ───────────────────────────────────────────────

    @Getter
    public static class MoveResult {
        private final Map<String, Object> state;
        private final boolean solved;

        public MoveResult(Map<String, Object> state, boolean solved) {
            this.state  = state;
            this.solved = solved;
        }
    }
}
