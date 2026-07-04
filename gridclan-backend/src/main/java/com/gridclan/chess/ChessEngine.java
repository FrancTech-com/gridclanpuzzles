package com.gridclan.chess;

import java.util.ArrayList;
import java.util.List;

/**
 * Server-authoritative chess rules engine.
 *
 * State is a FEN string (board, side to move, castling rights, en-passant
 * square, halfmove clock, fullmove number). Moves are UCI coordinate strings
 * ("e2e4", promotions "e7e8q"). Full legality: check detection, castling
 * through/out of check, en passant, promotion, and game-over detection
 * (checkmate, stalemate, 50-move rule, insufficient material).
 *
 * Board layout: {@code board[0]} is rank 8, {@code board[7]} is rank 1;
 * column 0 is file 'a'. Uppercase pieces are white.
 */
public final class ChessEngine {

    public static final String START_FEN =
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    private final char[][] board = new char[8][8];
    private boolean whiteToMove;
    private boolean castleWK, castleWQ, castleBK, castleBQ;
    private int epRow = -1, epCol = -1;     // en-passant target square (behind the pawn)
    private int halfmove;                    // plies since last pawn move / capture
    private int fullmove;

    private ChessEngine() {}

    // ── FEN ──────────────────────────────────────────────────────────────────

    public static ChessEngine fromFen(String fen) {
        ChessEngine e = new ChessEngine();
        String[] parts = fen.trim().split("\\s+");
        String[] ranks = parts[0].split("/");
        for (int r = 0; r < 8; r++) {
            int c = 0;
            for (char ch : ranks[r].toCharArray()) {
                if (Character.isDigit(ch)) {
                    for (int i = 0; i < ch - '0'; i++) e.board[r][c++] = '.';
                } else {
                    e.board[r][c++] = ch;
                }
            }
        }
        e.whiteToMove = parts.length < 2 || parts[1].equals("w");
        String rights = parts.length > 2 ? parts[2] : "KQkq";
        e.castleWK = rights.indexOf('K') >= 0;
        e.castleWQ = rights.indexOf('Q') >= 0;
        e.castleBK = rights.indexOf('k') >= 0;
        e.castleBQ = rights.indexOf('q') >= 0;
        String ep = parts.length > 3 ? parts[3] : "-";
        if (!ep.equals("-") && ep.length() == 2) {
            e.epCol = ep.charAt(0) - 'a';
            e.epRow = 8 - (ep.charAt(1) - '0');
        }
        e.halfmove = parts.length > 4 ? Integer.parseInt(parts[4]) : 0;
        e.fullmove = parts.length > 5 ? Integer.parseInt(parts[5]) : 1;
        return e;
    }

    public String toFen() {
        StringBuilder sb = new StringBuilder();
        for (int r = 0; r < 8; r++) {
            int empty = 0;
            for (int c = 0; c < 8; c++) {
                if (board[r][c] == '.') empty++;
                else {
                    if (empty > 0) { sb.append(empty); empty = 0; }
                    sb.append(board[r][c]);
                }
            }
            if (empty > 0) sb.append(empty);
            if (r < 7) sb.append('/');
        }
        sb.append(whiteToMove ? " w " : " b ");
        String rights = (castleWK ? "K" : "") + (castleWQ ? "Q" : "")
                      + (castleBK ? "k" : "") + (castleBQ ? "q" : "");
        sb.append(rights.isEmpty() ? "-" : rights);
        sb.append(' ');
        sb.append(epRow < 0 ? "-" : "" + (char) ('a' + epCol) + (8 - epRow));
        sb.append(' ').append(halfmove).append(' ').append(fullmove);
        return sb.toString();
    }

    public boolean whiteToMove() { return whiteToMove; }
    public int fullmoveNumber()  { return fullmove; }

    /** Board rows rank 8 → rank 1, '.' for empty (for client rendering). */
    public List<String> rows() {
        List<String> rows = new ArrayList<>(8);
        for (int r = 0; r < 8; r++) rows.add(new String(board[r]));
        return rows;
    }

    // ── Legal moves ──────────────────────────────────────────────────────────

    /** Every legal move for the side to move, as UCI strings. */
    public List<String> legalMoves() {
        List<String> legal = new ArrayList<>();
        for (String mv : pseudoMoves()) {
            ChessEngine next = copy();
            next.applyUnchecked(mv);
            // After my move (it's now the opponent's turn) my king must be safe.
            if (!next.kingAttacked(whiteToMove)) legal.add(mv);
        }
        return legal;
    }

    /** Is the side to move currently in check? */
    public boolean inCheck() { return kingAttacked(whiteToMove); }

    /**
     * Game status for the side to move: ACTIVE, CHECKMATE, STALEMATE,
     * DRAW_50 (fifty-move rule) or DRAW_MATERIAL (insufficient material).
     */
    public String status() {
        if (insufficientMaterial()) return "DRAW_MATERIAL";
        if (legalMoves().isEmpty()) return inCheck() ? "CHECKMATE" : "STALEMATE";
        if (halfmove >= 100)        return "DRAW_50";
        return "ACTIVE";
    }

    /** Apply a move that MUST already be legal (validate via legalMoves first). */
    public void applyUci(String uci) { applyUnchecked(uci); }

    // ── Move generation ──────────────────────────────────────────────────────

    private static final int[][] KNIGHT = {{-2,-1},{-2,1},{-1,-2},{-1,2},{1,-2},{1,2},{2,-1},{2,1}};
    private static final int[][] KING   = {{-1,-1},{-1,0},{-1,1},{0,-1},{0,1},{1,-1},{1,0},{1,1}};
    private static final int[][] ROOK   = {{-1,0},{1,0},{0,-1},{0,1}};
    private static final int[][] BISHOP = {{-1,-1},{-1,1},{1,-1},{1,1}};

    private List<String> pseudoMoves() {
        List<String> moves = new ArrayList<>();
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                char p = board[r][c];
                if (p == '.' || isWhite(p) != whiteToMove) continue;
                switch (Character.toUpperCase(p)) {
                    case 'P' -> pawnMoves(r, c, moves);
                    case 'N' -> stepMoves(r, c, KNIGHT, moves);
                    case 'K' -> { stepMoves(r, c, KING, moves); castleMoves(r, c, moves); }
                    case 'R' -> slideMoves(r, c, ROOK, moves);
                    case 'B' -> slideMoves(r, c, BISHOP, moves);
                    case 'Q' -> { slideMoves(r, c, ROOK, moves); slideMoves(r, c, BISHOP, moves); }
                    default -> { }
                }
            }
        }
        return moves;
    }

    private void pawnMoves(int r, int c, List<String> moves) {
        int dir = whiteToMove ? -1 : 1;
        int startRow = whiteToMove ? 6 : 1;
        int nr = r + dir;
        if (in(nr) && board[nr][c] == '.') {
            addPawnMove(r, c, nr, c, moves);
            if (r == startRow && board[r + 2 * dir][c] == '.') {
                moves.add(uci(r, c, r + 2 * dir, c));
            }
        }
        for (int dc : new int[]{-1, 1}) {
            int nc = c + dc;
            if (!in(nr) || !in(nc)) continue;
            char target = board[nr][nc];
            boolean enemy = target != '.' && isWhite(target) != whiteToMove;
            boolean ep    = nr == epRow && nc == epCol;
            if (enemy || ep) addPawnMove(r, c, nr, nc, moves);
        }
    }

    private void addPawnMove(int r, int c, int nr, int nc, List<String> moves) {
        if (nr == 0 || nr == 7) {
            for (char promo : new char[]{'q', 'r', 'b', 'n'}) moves.add(uci(r, c, nr, nc) + promo);
        } else {
            moves.add(uci(r, c, nr, nc));
        }
    }

    private void stepMoves(int r, int c, int[][] deltas, List<String> moves) {
        for (int[] d : deltas) {
            int nr = r + d[0], nc = c + d[1];
            if (!in(nr) || !in(nc)) continue;
            char target = board[nr][nc];
            if (target == '.' || isWhite(target) != whiteToMove) moves.add(uci(r, c, nr, nc));
        }
    }

    private void slideMoves(int r, int c, int[][] dirs, List<String> moves) {
        for (int[] d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            while (in(nr) && in(nc)) {
                char target = board[nr][nc];
                if (target == '.') {
                    moves.add(uci(r, c, nr, nc));
                } else {
                    if (isWhite(target) != whiteToMove) moves.add(uci(r, c, nr, nc));
                    break;
                }
                nr += d[0]; nc += d[1];
            }
        }
    }

    private void castleMoves(int r, int c, List<String> moves) {
        // King must be on its start square with rights intact; squares between
        // empty; the king may not castle out of, through, or into check.
        boolean white = whiteToMove;
        int home = white ? 7 : 0;
        if (r != home || c != 4 || kingAttacked(white)) return;
        boolean kSide = white ? castleWK : castleBK;
        boolean qSide = white ? castleWQ : castleBQ;
        if (kSide && board[home][5] == '.' && board[home][6] == '.'
                && board[home][7] == (white ? 'R' : 'r')
                && !attacked(home, 5, !white) && !attacked(home, 6, !white)) {
            moves.add(uci(home, 4, home, 6));
        }
        if (qSide && board[home][3] == '.' && board[home][2] == '.' && board[home][1] == '.'
                && board[home][0] == (white ? 'R' : 'r')
                && !attacked(home, 3, !white) && !attacked(home, 2, !white)) {
            moves.add(uci(home, 4, home, 2));
        }
    }

    // ── Attack detection ─────────────────────────────────────────────────────

    private boolean kingAttacked(boolean white) {
        char king = white ? 'K' : 'k';
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                if (board[r][c] == king) return attacked(r, c, !white);
            }
        }
        return false;   // no king (shouldn't happen) — treat as safe
    }

    /** Is (r,c) attacked by the given side? */
    private boolean attacked(int r, int c, boolean byWhite) {
        // Pawns
        int dir = byWhite ? 1 : -1;   // attacker sits one rank "behind" its push
        for (int dc : new int[]{-1, 1}) {
            int pr = r + dir, pc = c + dc;
            if (in(pr) && in(pc) && board[pr][pc] == (byWhite ? 'P' : 'p')) return true;
        }
        // Knights
        for (int[] d : KNIGHT) {
            int nr = r + d[0], nc = c + d[1];
            if (in(nr) && in(nc) && board[nr][nc] == (byWhite ? 'N' : 'n')) return true;
        }
        // King
        for (int[] d : KING) {
            int nr = r + d[0], nc = c + d[1];
            if (in(nr) && in(nc) && board[nr][nc] == (byWhite ? 'K' : 'k')) return true;
        }
        // Sliders
        if (ray(r, c, ROOK,   byWhite ? "RQ" : "rq")) return true;
        return ray(r, c, BISHOP, byWhite ? "BQ" : "bq");
    }

    private boolean ray(int r, int c, int[][] dirs, String attackers) {
        for (int[] d : dirs) {
            int nr = r + d[0], nc = c + d[1];
            while (in(nr) && in(nc)) {
                char p = board[nr][nc];
                if (p != '.') {
                    if (attackers.indexOf(p) >= 0) return true;
                    break;
                }
                nr += d[0]; nc += d[1];
            }
        }
        return false;
    }

    // ── Apply ────────────────────────────────────────────────────────────────

    private void applyUnchecked(String uci) {
        int fc = uci.charAt(0) - 'a', fr = 8 - (uci.charAt(1) - '0');
        int tc = uci.charAt(2) - 'a', tr = 8 - (uci.charAt(3) - '0');
        char piece = board[fr][fc];
        char captured = board[tr][tc];
        boolean pawn = Character.toUpperCase(piece) == 'P';

        // En passant capture: the victim pawn is beside the destination.
        if (pawn && tr == epRow && tc == epCol && captured == '.') {
            board[fr][tc] = '.';
            captured = 'p';   // flag as a capture for the halfmove clock
        }

        // Castling: also move the rook.
        if (Character.toUpperCase(piece) == 'K' && Math.abs(tc - fc) == 2) {
            if (tc == 6) { board[fr][5] = board[fr][7]; board[fr][7] = '.'; }
            else         { board[fr][3] = board[fr][0]; board[fr][0] = '.'; }
        }

        board[tr][tc] = uci.length() > 4
            ? (whiteToMove ? Character.toUpperCase(uci.charAt(4)) : Character.toLowerCase(uci.charAt(4)))
            : piece;
        board[fr][fc] = '.';

        // Castling rights: king or rook moved / rook captured.
        if (piece == 'K') { castleWK = castleWQ = false; }
        if (piece == 'k') { castleBK = castleBQ = false; }
        if ((fr == 7 && fc == 0) || (tr == 7 && tc == 0)) castleWQ = false;
        if ((fr == 7 && fc == 7) || (tr == 7 && tc == 7)) castleWK = false;
        if ((fr == 0 && fc == 0) || (tr == 0 && tc == 0)) castleBQ = false;
        if ((fr == 0 && fc == 7) || (tr == 0 && tc == 7)) castleBK = false;

        // En-passant target: only right after a double pawn push.
        if (pawn && Math.abs(tr - fr) == 2) { epRow = (fr + tr) / 2; epCol = fc; }
        else                                { epRow = -1; epCol = -1; }

        halfmove = (pawn || captured != '.') ? 0 : halfmove + 1;
        if (!whiteToMove) fullmove++;
        whiteToMove = !whiteToMove;
    }

    // ── Draw by material ─────────────────────────────────────────────────────

    /** K vs K, K+minor vs K, or K+B vs K+B with same-coloured bishops. */
    private boolean insufficientMaterial() {
        List<int[]> extras = new ArrayList<>();   // non-king pieces: {pieceUpper, squareColour}
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                char p = board[r][c];
                if (p == '.' || Character.toUpperCase(p) == 'K') continue;
                char u = Character.toUpperCase(p);
                if (u == 'P' || u == 'R' || u == 'Q') return false;
                extras.add(new int[]{u, (r + c) % 2});
            }
        }
        if (extras.size() <= 1) return true;
        if (extras.size() == 2) {
            int[] a = extras.get(0), b = extras.get(1);
            return a[0] == 'B' && b[0] == 'B' && a[1] == b[1];
        }
        return false;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private ChessEngine copy() {
        ChessEngine e = new ChessEngine();
        for (int r = 0; r < 8; r++) System.arraycopy(board[r], 0, e.board[r], 0, 8);
        e.whiteToMove = whiteToMove;
        e.castleWK = castleWK; e.castleWQ = castleWQ;
        e.castleBK = castleBK; e.castleBQ = castleBQ;
        e.epRow = epRow; e.epCol = epCol;
        e.halfmove = halfmove; e.fullmove = fullmove;
        return e;
    }

    private static boolean in(int i)        { return i >= 0 && i < 8; }
    private static boolean isWhite(char p)  { return Character.isUpperCase(p); }

    private static String uci(int fr, int fc, int tr, int tc) {
        return "" + (char) ('a' + fc) + (8 - fr) + (char) ('a' + tc) + (8 - tr);
    }
}
