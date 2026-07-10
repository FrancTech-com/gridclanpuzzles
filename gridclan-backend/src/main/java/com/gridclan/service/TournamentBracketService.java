package com.gridclan.service;

import com.gridclan.entity.Tournament;
import com.gridclan.entity.TournamentMatch;
import com.gridclan.entity.TournamentParticipant;
import com.gridclan.exception.InvalidSessionStateException;
import com.gridclan.repository.TournamentMatchRepository;
import com.gridclan.repository.TournamentParticipantRepository;
import com.gridclan.repository.TournamentRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Tournament engine with three formats, picked by game:
 *
 * <ul>
 *   <li><b>KNOCKOUT</b> (Gomoku, Battleship, Chess): classic single elimination —
 *       pairs, winner advances, loser is out.</li>
 *   <li><b>GROUPS</b> (Scrabble): players are split into groups of up to 4 and each
 *       group plays ONE shared 4-player board; the top two scores advance. When four
 *       (or fewer) remain they play a last group board whose top two meet in a
 *       head-to-head FINAL while 3rd/4th play a THIRD_PLACE match. Everyone knocked
 *       out of round 1 drops into a CONSOLATION draw run the same way.</li>
 *   <li><b>TABLES</b> (Monopoly): tables of up to 8; each table's winner advances
 *       until a single final table decides the champion.</li>
 * </ul>
 *
 * Players join while a tournament is UPCOMING. At its start time the scheduler
 * calls {@link #start}; as games finish {@link #reconcile} resolves matches and
 * seeds the next round. Anyone — especially eliminated players — can watch any
 * live match through the ids exposed by {@link #myStatus}/{@link #bracket}.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TournamentBracketService {

    public static final Set<String> GAME_KEYS =
        Set.of("SCRABBLE", "GOMOKU", "BATTLESHIP", "CHESS", "MONOPOLY");
    private static final Random RANDOM = new Random();

    private final TournamentRepository            tournamentRepo;
    private final TournamentMatchRepository       matchRepo;
    private final TournamentParticipantRepository participantRepo;
    private final UserRepository                  userRepo;
    private final ScrabbleGameService             scrabble;
    private final GomokuGameService               gomoku;
    private final BattleshipGameService           battleship;
    private final ChessGameService                chess;
    private final MonopolyGameService             monopoly;

    // ── Format selection ──────────────────────────────────────────────────

    private static String format(String gameType) {
        return switch (gameType) {
            case "SCRABBLE" -> "GROUPS";
            case "MONOPOLY" -> "TABLES";
            default          -> "KNOCKOUT";
        };
    }

    private static int groupSize(String gameType) {
        return "MONOPOLY".equals(gameType) ? 8 : 4;
    }

    /** How many players leave a group match alive: top 2 in Scrabble groups,
     *  the winner only at a Monopoly table, and never more than size-1. */
    private static int advancers(String gameType, int size) {
        int base = "MONOPOLY".equals(gameType) ? 1 : 2;
        return Math.max(1, Math.min(base, size - 1));
    }

    // ── Join (UPCOMING only) ──────────────────────────────────────────────

    @Transactional
    public void join(UUID userId, UUID tournamentId) {
        Tournament t = tournamentRepo.findById(tournamentId)
            .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        if (!"UPCOMING".equals(t.getStatus()))
            throw new InvalidSessionStateException("Joining is closed for this tournament.");
        if (participantRepo.existsByTournamentIdAndUserId(tournamentId, userId)) return;
        participantRepo.save(TournamentParticipant.builder()
            .tournamentId(tournamentId).userId(userId).status("ACTIVE").build());
    }

    // ── Start: lock players, seed round 1 ─────────────────────────────────

    @Transactional
    public void start(Tournament t) {
        if (!"UPCOMING".equals(t.getStatus())) return;

        List<UUID> players = new ArrayList<>(participantRepo.findByTournamentId(t.getId()).stream()
            .filter(p -> "ACTIVE".equals(p.getStatus()))
            .map(TournamentParticipant::getUserId)
            .toList());

        if (players.size() < 2) {
            t.setStatus("CANCELLED");
            tournamentRepo.save(t);
            log.info("Tournament {} cancelled — only {} player(s) joined", t.getId(), players.size());
            return;
        }

        Collections.shuffle(players, RANDOM);
        createRound(t, "MAIN", 1, players);
        t.setStatus("ACTIVE");
        t.setCurrentRound(1);
        tournamentRepo.save(t);
        log.info("Tournament {} started with {} players ({} format)",
            t.getId(), players.size(), format(t.getGameType()));
    }

    // ── Reconcile finished matches; advance rounds ────────────────────────

    @Transactional
    public void reconcile(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus()) || t.getPausedAt() != null) return;
        for (String bracket : List.of("MAIN", "CONSOLATION")) {
            int round = latestRound(t.getId(), bracket);
            if (round == 0) continue;
            List<TournamentMatch> matches =
                matchRepo.findByTournamentIdAndBracketAndRound(t.getId(), bracket, round);
            for (TournamentMatch m : matches) {
                if ("ACTIVE".equals(m.getStatus()) && m.getGameId() != null
                        && gameComplete(m.getGameType(), m.getGameId())) {
                    resolveMatch(m);
                }
            }
            if (!matches.isEmpty() && matches.stream().allMatch(this::isResolved)) {
                advanceBracket(t, bracket, round, matches);
            }
        }
        maybeComplete(t);
    }

    // ── Pause / resume (creator or admin) ─────────────────────────────────

    /** Freeze a running tournament: the scheduler stops advancing it and all its
     *  in-progress match games are paused (their turn clocks stop). */
    @Transactional
    public void pause(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus()) || t.getPausedAt() != null) return;
        t.setPausedAt(java.time.Instant.now());
        tournamentRepo.save(t);
        setMatchesPaused(t, true);
        log.info("Tournament {} paused", t.getId());
    }

    /** Resume a paused tournament: unpause its match games and push the
     *  force-complete backstop (endsAt) out by however long it was paused. */
    @Transactional
    public void resume(Tournament t) {
        if (t.getPausedAt() == null) return;
        long pausedSecs = java.time.Duration.between(t.getPausedAt(), java.time.Instant.now()).getSeconds();
        if (t.getEndsAt() != null) t.setEndsAt(t.getEndsAt().plusSeconds(Math.max(0, pausedSecs)));
        t.setPausedAt(null);
        tournamentRepo.save(t);
        setMatchesPaused(t, false);
        log.info("Tournament {} resumed after {}s", t.getId(), pausedSecs);
    }

    private void setMatchesPaused(Tournament t, boolean paused) {
        for (TournamentMatch m : matchRepo.findByTournamentIdAndStatus(t.getId(), "ACTIVE")) {
            if (m.getGameId() == null) continue;
            switch (m.getGameType()) {
                case "SCRABBLE"   -> scrabble.setPaused(m.getGameId(), paused);
                case "GOMOKU"     -> gomoku.setPaused(m.getGameId(), paused);
                case "BATTLESHIP" -> battleship.setPaused(m.getGameId(), paused);
                case "CHESS"      -> chess.setPaused(m.getGameId(), paused);
                case "MONOPOLY"   -> monopoly.setPaused(m.getGameId(), paused);
                default -> { }
            }
        }
    }

    /** Force-resolve everything at endsAt (unfinished match → current game ranking). */
    @Transactional
    public void forceComplete(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus()) || t.getPausedAt() != null) return;
        int guard = 0;
        while ("ACTIVE".equals(t.getStatus()) && guard++ < 32) {
            boolean progressed = false;
            for (String bracket : List.of("MAIN", "CONSOLATION")) {
                int round = latestRound(t.getId(), bracket);
                if (round == 0) continue;
                List<TournamentMatch> matches =
                    matchRepo.findByTournamentIdAndBracketAndRound(t.getId(), bracket, round);
                for (TournamentMatch m : matches) {
                    if ("ACTIVE".equals(m.getStatus())) { resolveMatch(m); progressed = true; }
                }
                if (!matches.isEmpty() && matches.stream().allMatch(this::isResolved)) {
                    advanceBracket(t, bracket, round, matches);
                    progressed = true;
                }
            }
            maybeComplete(t);
            if (!progressed) break;
        }
        if ("ACTIVE".equals(t.getStatus())) {
            // Safety net: crown the best remaining player so the tournament ends.
            t.setStatus("COMPLETED");
            tournamentRepo.save(t);
        }
        log.info("Tournament {} force-completed at endsAt", t.getId());
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /** The viewer's state: where to go (play / wait / watch / champion). */
    @Transactional
    public Map<String, Object> myStatus(UUID userId, UUID tournamentId) {
        Tournament t = tournamentRepo.findById(tournamentId)
            .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        reconcile(t);                                   // lazy refresh on tap-in
        t = tournamentRepo.findById(tournamentId).orElse(t);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("tournamentId",    tournamentId.toString());
        r.put("tournamentStatus", t.getStatus());
        r.put("gameType",        t.getGameType());
        r.put("format",          format(t.getGameType()));
        r.put("currentRound",    t.getCurrentRound());
        if (t.getWinnerId() != null) r.put("championName", displayName(t.getWinnerId()));

        // Every live match is watchable — spectators (and the curious) tap in.
        r.put("liveMatches", liveMatches(tournamentId));

        boolean joined = participantRepo.existsByTournamentIdAndUserId(tournamentId, userId);
        r.put("joined", joined);
        if (!joined)                              { r.put("state", "NOT_JOINED");    return r; }
        if ("UPCOMING".equals(t.getStatus()))     { r.put("state", "WAITING_START"); return r; }
        if ("CANCELLED".equals(t.getStatus()))    { r.put("state", "CANCELLED");     return r; }
        if (userId.equals(t.getWinnerId()))       { r.put("state", "CHAMPION");      return r; }

        // An active match with my seat → go play it.
        for (TournamentMatch m : matchRepo.findByTournamentIdAndStatus(tournamentId, "ACTIVE")) {
            if (!m.hasPlayer(userId)) continue;
            Map<String, Object> cm = new LinkedHashMap<>();
            cm.put("matchId",  m.getId().toString());
            cm.put("round",    m.getRound());
            cm.put("bracket",  m.getBracket());
            cm.put("kind",     m.getKind());
            cm.put("gameType", m.getGameType());
            cm.put("gameId",   m.getGameId() != null ? m.getGameId().toString() : null);
            cm.put("opponents", opponentNames(m, userId));
            r.put("state", "PLAYING");
            r.put("currentMatch", cm);
            return r;
        }

        String pStatus = participantRepo.findByTournamentIdAndUserId(tournamentId, userId)
            .map(TournamentParticipant::getStatus).orElse("ACTIVE");
        if ("ELIMINATED".equals(pStatus)) {
            r.put("state", "ELIMINATED");
            return r;
        }
        if ("COMPLETED".equals(t.getStatus())) r.put("state", "DONE");
        else                                   r.put("state", "WAITING_NEXT");  // alive, awaiting the next round
        return r;
    }

    /** Bracket view: per-draw rounds → matches with all players + qualifiers. */
    @Transactional(readOnly = true)
    public Map<String, Object> bracket(UUID tournamentId) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("tournamentId", tournamentId.toString());
        r.put("rounds",             bracketRounds(tournamentId, "MAIN"));
        r.put("consolationRounds",  bracketRounds(tournamentId, "CONSOLATION"));
        return r;
    }

    private TreeMap<Integer, List<Map<String, Object>>> bracketRounds(UUID tournamentId, String bracket) {
        TreeMap<Integer, List<Map<String, Object>>> rounds = new TreeMap<>();
        for (TournamentMatch m : matchRepo.findByTournamentIdAndBracketOrderByRoundAscSlotAsc(tournamentId, bracket)) {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("slot",    m.getSlot());
            mm.put("kind",    m.getKind());
            mm.put("players", m.allPlayers().stream().map(this::displayName).toList());
            mm.put("player1", displayName(m.getPlayer1Id()));
            mm.put("player2", m.getPlayer2Id() != null ? displayName(m.getPlayer2Id()) : "(bye)");
            mm.put("winner",  m.getWinnerId() != null ? displayName(m.getWinnerId()) : null);
            mm.put("runnerUp", m.getRunnerUpId() != null ? displayName(m.getRunnerUpId()) : null);
            mm.put("status",  m.getStatus());
            mm.put("gameType", m.getGameType());
            mm.put("gameId",  m.getGameId() != null ? m.getGameId().toString() : null);
            rounds.computeIfAbsent(m.getRound(), k -> new ArrayList<>()).add(mm);
        }
        return rounds;
    }

    /** Active matches with enough info for a "watch live" list. */
    private List<Map<String, Object>> liveMatches(UUID tournamentId) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (TournamentMatch m : matchRepo.findByTournamentIdAndStatus(tournamentId, "ACTIVE")) {
            if (m.getGameId() == null) continue;
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("matchId",  m.getId().toString());
            mm.put("round",    m.getRound());
            mm.put("bracket",  m.getBracket());
            mm.put("kind",     m.getKind());
            mm.put("gameType", m.getGameType());
            mm.put("gameId",   m.getGameId().toString());
            mm.put("players",  m.allPlayers().stream().map(this::displayName).toList());
            out.add(mm);
        }
        return out;
    }

    // ── Internals ─────────────────────────────────────────────────────────

    private int latestRound(UUID tournamentId, String bracket) {
        return matchRepo.findByTournamentIdAndBracketOrderByRoundAscSlotAsc(tournamentId, bracket).stream()
            .mapToInt(TournamentMatch::getRound).max().orElse(0);
    }

    /**
     * Seed a round for a bracket: knockout pairs, or groups/tables of up to
     * {@link #groupSize}. Two players make a FINAL in the main draw of a
     * groups/tables format; a lone player is a BYE.
     */
    private void createRound(Tournament t, String bracket, int round, List<UUID> players) {
        String fmt = format(t.getGameType());
        if (fmt.equals("KNOCKOUT")) {
            int slot = 0;
            for (int i = 0; i < players.size(); i += 2) {
                UUID p1 = players.get(i);
                UUID p2 = (i + 1 < players.size()) ? players.get(i + 1) : null;
                saveMatch(t, bracket, "H2H", round, slot++, p2 == null ? List.of(p1) : List.of(p1, p2));
            }
            return;
        }

        if (players.size() == 2) {
            saveMatch(t, bracket, "FINAL", round, 0, players);
            return;
        }
        int size = groupSize(t.getGameType());
        List<List<UUID>> groups = partition(players, size);
        int slot = 0;
        for (List<UUID> group : groups) {
            saveMatch(t, bracket, "GROUP", round, slot++, group);
        }
    }

    /** Split into balanced groups of at most {@code size} (never a group of 1 when n ≥ 2). */
    static List<List<UUID>> partition(List<UUID> players, int size) {
        int n = players.size();
        int groups = (n + size - 1) / size;
        List<List<UUID>> out = new ArrayList<>();
        int idx = 0;
        for (int gi = 0; gi < groups; gi++) {
            int remaining = n - idx;
            int groupsLeft = groups - gi;
            int take = (remaining + groupsLeft - 1) / groupsLeft;   // balanced sizes
            out.add(new ArrayList<>(players.subList(idx, idx + take)));
            idx += take;
        }
        return out;
    }

    private void saveMatch(Tournament t, String bracket, String kind, int round, int slot, List<UUID> players) {
        TournamentMatch.TournamentMatchBuilder b = TournamentMatch.builder()
            .tournamentId(t.getId()).round(round).slot(slot)
            .bracket(bracket).kind(kind).gameType(t.getGameType());
        b.player1Id(players.get(0));
        if (players.size() > 1) b.player2Id(players.get(1));
        if (players.size() > 2) b.player3Id(players.get(2));
        if (players.size() > 3) b.player4Id(players.get(3));
        if (players.size() > 4) {
            StringBuilder extra = new StringBuilder();
            for (int i = 4; i < players.size(); i++) {
                if (extra.length() > 0) extra.append(',');
                extra.append(players.get(i));
            }
            b.extraPlayers(extra.toString());
        }
        if (players.size() == 1) {
            b.winnerId(players.get(0)).status("BYE");
        } else {
            b.gameId(createGame(t.getGameType(), players)).status("ACTIVE");
        }
        matchRepo.save(b.build());
    }

    /** Resolve a finished (or force-ended) match from the backing game's ranking. */
    private void resolveMatch(TournamentMatch m) {
        List<UUID> ranking = gameRanking(m.getGameType(), m.getGameId());
        if (ranking.isEmpty()) ranking = m.allPlayers();
        m.setWinnerId(ranking.get(0));
        if (ranking.size() > 1) m.setRunnerUpId(ranking.get(1));
        m.setStatus("COMPLETE");
        matchRepo.save(m);
    }

    /** All matches of a round resolved → qualifiers move on, the rest drop out. */
    private void advanceBracket(Tournament t, String bracket, int round, List<TournamentMatch> matches) {
        String gameType = t.getGameType();

        // A finished FINAL settles the draw (and, for MAIN, crowns the champion).
        Optional<TournamentMatch> fin = matches.stream()
            .filter(m -> "FINAL".equals(m.getKind()) && "COMPLETE".equals(m.getStatus())).findFirst();
        if (fin.isPresent()) {
            settleFinalRound(t, bracket, matches, fin.get());
            return;
        }
        if (matches.stream().anyMatch(m -> "FINAL".equals(m.getKind()))) return;   // final still running

        // Collect qualifiers per match; everyone else in the match is knocked out.
        List<UUID> qualifiers = new ArrayList<>();
        List<UUID> knockedOut = new ArrayList<>();
        for (TournamentMatch m : matches) {
            List<UUID> players = m.allPlayers();
            if ("BYE".equals(m.getStatus())) { qualifiers.add(m.getPlayer1Id()); continue; }
            List<UUID> ranked = rankedPlayers(m);
            int q = "H2H".equals(m.getKind()) ? 1 : advancers(gameType, players.size());
            for (int i = 0; i < ranked.size(); i++) {
                if (i < q) qualifiers.add(ranked.get(i));
                else       knockedOut.add(ranked.get(i));
            }
        }

        boolean lastGroupStage = !format(gameType).equals("KNOCKOUT")
            && matches.size() == 1 && "GROUP".equals(matches.get(0).getKind())
            && qualifiers.size() == 2;
        if (lastGroupStage && knockedOut.size() >= 2) {
            // The top two non-qualifiers play THIRD_PLACE instead of dropping out.
            knockedOut = knockedOut.size() > 2
                ? new ArrayList<>(knockedOut.subList(2, knockedOut.size()))
                : new ArrayList<>();
        }

        // First-round Scrabble eliminees drop into the consolation draw.
        if ("MAIN".equals(bracket) && round == 1 && format(gameType).equals("GROUPS")
                && knockedOut.size() >= 2) {
            for (UUID u : knockedOut) setParticipantStatus(t.getId(), u, "CONSOLATION");
            Collections.shuffle(knockedOut, RANDOM);
            createRound(t, "CONSOLATION", 1, knockedOut);
        } else {
            for (UUID u : knockedOut) eliminate(t.getId(), u);
        }

        if (qualifiers.size() <= 1) {
            // The draw is decided without a final (e.g. one table left standing).
            if ("MAIN".equals(bracket) && !qualifiers.isEmpty()) crownChampion(t, qualifiers.get(0));
            return;
        }

        int next = round + 1;
        if (lastGroupStage) {
            // Top two of the last group board meet head-to-head; 3rd/4th play for bronze.
            TournamentMatch g = matches.get(0);
            List<UUID> ranked = rankedPlayers(g);
            saveMatch(t, bracket, "FINAL", next, 0, List.of(ranked.get(0), ranked.get(1)));
            if (ranked.size() >= 4) {
                saveMatch(t, bracket, "THIRD_PLACE", next, 1, List.of(ranked.get(2), ranked.get(3)));
            }
        } else {
            Collections.shuffle(qualifiers, RANDOM);
            createRound(t, bracket, next, qualifiers);
        }
        if ("MAIN".equals(bracket)) {
            t.setCurrentRound(next);
            tournamentRepo.save(t);
        }
    }

    /** In the last-group special case 3rd/4th aren't knocked out yet — they play for bronze. */
    private List<UUID> rankedPlayers(TournamentMatch m) {
        List<UUID> ranked = m.getGameId() != null
            ? new ArrayList<>(gameRanking(m.getGameType(), m.getGameId()))
            : new ArrayList<>();
        for (UUID p : m.allPlayers()) if (!ranked.contains(p)) ranked.add(p);
        ranked.retainAll(m.allPlayers());
        return ranked;
    }

    private void settleFinalRound(Tournament t, String bracket, List<TournamentMatch> matches, TournamentMatch fin) {
        UUID winner = fin.getWinnerId();
        UUID loser = fin.allPlayers().stream().filter(p -> !p.equals(winner)).findFirst().orElse(null);
        if ("MAIN".equals(bracket)) {
            crownChampion(t, winner);
            if (loser != null) setFinalRank(t.getId(), loser, 2);
            for (TournamentMatch m : matches) {
                if ("THIRD_PLACE".equals(m.getKind()) && m.getWinnerId() != null) {
                    setFinalRank(t.getId(), m.getWinnerId(), 3);
                }
            }
        }
        // Everyone in this round who isn't the draw's winner is done playing.
        for (TournamentMatch m : matches) {
            for (UUID p : m.allPlayers()) {
                if (!p.equals(winner) || "CONSOLATION".equals(bracket)) eliminate(t.getId(), p);
            }
        }
    }

    private void crownChampion(Tournament t, UUID winner) {
        t.setWinnerId(winner);
        participantRepo.findByTournamentIdAndUserId(t.getId(), winner)
            .ifPresent(p -> { p.setFinalRank(1); participantRepo.save(p); });
        tournamentRepo.save(t);
        log.info("Tournament {} champion decided: {}", t.getId(), winner);
        maybeComplete(t);
    }

    /** COMPLETED once a champion exists and no match is still running anywhere. */
    private void maybeComplete(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus()) || t.getWinnerId() == null) return;
        boolean anyLive = !matchRepo.findByTournamentIdAndStatus(t.getId(), "ACTIVE").isEmpty();
        if (!anyLive) {
            t.setStatus("COMPLETED");
            tournamentRepo.save(t);
            log.info("Tournament {} completed — champion {}", t.getId(), t.getWinnerId());
        }
    }

    private void setParticipantStatus(UUID tournamentId, UUID userId, String status) {
        participantRepo.findByTournamentIdAndUserId(tournamentId, userId).ifPresent(p -> {
            p.setStatus(status);
            participantRepo.save(p);
        });
    }

    private void eliminate(UUID tournamentId, UUID userId) {
        setParticipantStatus(tournamentId, userId, "ELIMINATED");
    }

    private void setFinalRank(UUID tournamentId, UUID userId, int rank) {
        participantRepo.findByTournamentIdAndUserId(tournamentId, userId).ifPresent(p -> {
            p.setFinalRank(rank);
            participantRepo.save(p);
        });
    }

    private boolean isResolved(TournamentMatch m) {
        return "COMPLETE".equals(m.getStatus()) || "BYE".equals(m.getStatus());
    }

    private List<String> opponentNames(TournamentMatch m, UUID userId) {
        return m.allPlayers().stream()
            .filter(p -> !p.equals(userId))
            .map(this::displayName)
            .toList();
    }

    // ── Game-type dispatch ────────────────────────────────────────────────

    private UUID createGame(String gameType, List<UUID> players) {
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.createGroupMatch(players);
            case "GOMOKU"     -> gomoku.createMatch(players.get(0), players.get(1));
            case "BATTLESHIP" -> battleship.createMatch(players.get(0), players.get(1));
            case "CHESS"      -> chess.createMatch(players.get(0), players.get(1));
            case "MONOPOLY"   -> monopoly.createTableMatch(players);
            default -> throw new IllegalArgumentException("Unsupported tournament game: " + gameType);
        };
    }

    private boolean gameComplete(String gameType, UUID gameId) {
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.isMatchComplete(gameId);
            case "GOMOKU"     -> gomoku.isMatchComplete(gameId);
            case "BATTLESHIP" -> battleship.isMatchComplete(gameId);
            case "CHESS"      -> chess.isMatchComplete(gameId);
            case "MONOPOLY"   -> monopoly.isMatchComplete(gameId);
            default -> false;
        };
    }

    /** Full final ordering when the game supports it; winner-first otherwise. */
    private List<UUID> gameRanking(String gameType, UUID gameId) {
        if (gameId == null) return List.of();
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.matchRanking(gameId);
            case "MONOPOLY"   -> monopoly.matchRanking(gameId);
            case "GOMOKU"     -> winnerFirst(gomoku.matchWinner(gameId));
            case "BATTLESHIP" -> winnerFirst(battleship.matchWinner(gameId));
            case "CHESS"      -> winnerFirst(chess.matchWinner(gameId));
            default -> List.of();
        };
    }

    private static List<UUID> winnerFirst(UUID winner) {
        return winner == null ? List.of() : List.of(winner);
    }

    private String displayName(UUID userId) {
        if (userId == null) return null;
        return userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");
    }
}
