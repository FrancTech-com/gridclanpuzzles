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
 * Single-elimination tournament bracket engine.
 *
 * Players join while a tournament is UPCOMING. At its start time the scheduler
 * calls {@link #start}, which locks the joined players, seeds round 1, and
 * creates a real per-game match for each pairing (via the PvP services). As
 * games finish, {@link #reconcile} marks matches complete, eliminates losers,
 * and—once a round is fully resolved—pairs the winners into the next round.
 * When one player remains the tournament is COMPLETED with a champion.
 *
 * The three games stay pure-skill (normal PvP games, no hints/revives).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TournamentBracketService {

    public static final Set<String> GAME_KEYS = Set.of("SCRABBLE", "GOMOKU", "BATTLESHIP");
    private static final Random RANDOM = new Random();

    private final TournamentRepository            tournamentRepo;
    private final TournamentMatchRepository       matchRepo;
    private final TournamentParticipantRepository participantRepo;
    private final UserRepository                  userRepo;
    private final ScrabbleGameService             scrabble;
    private final GomokuGameService               gomoku;
    private final BattleshipGameService           battleship;

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
        createRound(t, 1, players);
        t.setStatus("ACTIVE");
        t.setCurrentRound(1);
        tournamentRepo.save(t);
        log.info("Tournament {} started with {} players", t.getId(), players.size());
    }

    // ── Reconcile finished matches; advance rounds ────────────────────────

    @Transactional
    public void reconcile(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus())) return;
        List<TournamentMatch> round = matchRepo.findByTournamentIdAndRound(t.getId(), t.getCurrentRound());

        for (TournamentMatch m : round) {
            if ("ACTIVE".equals(m.getStatus()) && m.getGameId() != null
                    && gameComplete(m.getGameType(), m.getGameId())) {
                resolveMatch(m, gameWinner(m.getGameType(), m.getGameId()));
            }
        }
        if (round.stream().allMatch(this::isResolved)) advanceRound(t, round);
    }

    /** Force-resolve everything at endsAt (unfinished match → game winner, else player1). */
    @Transactional
    public void forceComplete(Tournament t) {
        if (!"ACTIVE".equals(t.getStatus())) return;
        int guard = 0;
        while ("ACTIVE".equals(t.getStatus()) && guard++ < 32) {
            List<TournamentMatch> round = matchRepo.findByTournamentIdAndRound(t.getId(), t.getCurrentRound());
            for (TournamentMatch m : round) {
                if ("ACTIVE".equals(m.getStatus())) {
                    UUID w = (m.getGameId() != null && gameComplete(m.getGameType(), m.getGameId()))
                        ? gameWinner(m.getGameType(), m.getGameId())
                        : m.getPlayer1Id();
                    resolveMatch(m, w);
                }
            }
            advanceRound(t, round);
        }
        log.info("Tournament {} force-completed at endsAt", t.getId());
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /** The viewer's state: where to go (play / wait / eliminated / champion). */
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
        r.put("currentRound",    t.getCurrentRound());

        boolean joined = participantRepo.existsByTournamentIdAndUserId(tournamentId, userId);
        r.put("joined", joined);
        if (!joined)                              { r.put("state", "NOT_JOINED");    return r; }
        if ("UPCOMING".equals(t.getStatus()))     { r.put("state", "WAITING_START"); return r; }
        if ("CANCELLED".equals(t.getStatus()))    { r.put("state", "CANCELLED");     return r; }
        if (userId.equals(t.getWinnerId()))       { r.put("state", "CHAMPION");      return r; }

        List<TournamentMatch> mine = matchRepo.findByTournamentIdOrderByRoundAscSlotAsc(tournamentId).stream()
            .filter(m -> userId.equals(m.getPlayer1Id()) || userId.equals(m.getPlayer2Id()))
            .toList();

        // An active match in the current round → go play it.
        for (TournamentMatch m : mine) {
            if ("ACTIVE".equals(m.getStatus()) && m.getRound() == t.getCurrentRound()) {
                UUID opp = userId.equals(m.getPlayer1Id()) ? m.getPlayer2Id() : m.getPlayer1Id();
                Map<String, Object> cm = new LinkedHashMap<>();
                cm.put("matchId",      m.getId().toString());
                cm.put("round",        m.getRound());
                cm.put("gameType",     m.getGameType());
                cm.put("gameId",       m.getGameId() != null ? m.getGameId().toString() : null);
                cm.put("opponentName", displayName(opp));
                r.put("state", "PLAYING");
                r.put("currentMatch", cm);
                return r;
            }
        }

        // Lost a match → eliminated (single-elim → at most one loss).
        for (TournamentMatch m : mine) {
            if ("COMPLETE".equals(m.getStatus()) && m.getWinnerId() != null && !userId.equals(m.getWinnerId())) {
                r.put("state", "ELIMINATED");
                r.put("eliminatedRound", m.getRound());
                return r;
            }
        }

        if ("COMPLETED".equals(t.getStatus())) r.put("state", "DONE");
        else                                   r.put("state", "WAITING_NEXT");  // won, awaiting next opponent
        return r;
    }

    /** Bracket view: rounds → matches with player names + winners. */
    @Transactional(readOnly = true)
    public Map<String, Object> bracket(UUID tournamentId) {
        TreeMap<Integer, List<Map<String, Object>>> rounds = new TreeMap<>();
        for (TournamentMatch m : matchRepo.findByTournamentIdOrderByRoundAscSlotAsc(tournamentId)) {
            Map<String, Object> mm = new LinkedHashMap<>();
            mm.put("slot",    m.getSlot());
            mm.put("player1", displayName(m.getPlayer1Id()));
            mm.put("player2", m.getPlayer2Id() != null ? displayName(m.getPlayer2Id()) : "(bye)");
            mm.put("winner",  m.getWinnerId() != null ? displayName(m.getWinnerId()) : null);
            mm.put("status",  m.getStatus());
            rounds.computeIfAbsent(m.getRound(), k -> new ArrayList<>()).add(mm);
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("tournamentId", tournamentId.toString());
        r.put("rounds", rounds);
        return r;
    }

    // ── Internals ─────────────────────────────────────────────────────────

    /** Pair players (in order) into matches for a round; odd one out gets a bye. */
    private void createRound(Tournament t, int round, List<UUID> players) {
        int slot = 0;
        for (int i = 0; i < players.size(); i += 2) {
            UUID p1 = players.get(i);
            UUID p2 = (i + 1 < players.size()) ? players.get(i + 1) : null;
            if (p2 == null) {
                matchRepo.save(TournamentMatch.builder()
                    .tournamentId(t.getId()).round(round).slot(slot)
                    .player1Id(p1).player2Id(null).gameType(t.getGameType())
                    .winnerId(p1).status("BYE").build());
            } else {
                UUID gameId = createGame(t.getGameType(), p1, p2);
                matchRepo.save(TournamentMatch.builder()
                    .tournamentId(t.getId()).round(round).slot(slot)
                    .player1Id(p1).player2Id(p2).gameType(t.getGameType())
                    .gameId(gameId).status("ACTIVE").build());
            }
            slot++;
        }
    }

    private void resolveMatch(TournamentMatch m, UUID winner) {
        m.setWinnerId(winner);
        m.setStatus("COMPLETE");
        matchRepo.save(m);
        UUID loser = winner != null && winner.equals(m.getPlayer1Id()) ? m.getPlayer2Id() : m.getPlayer1Id();
        if (loser != null && !loser.equals(winner)) eliminate(m.getTournamentId(), loser);
    }

    private void eliminate(UUID tournamentId, UUID userId) {
        participantRepo.findByTournamentIdAndUserId(tournamentId, userId).ifPresent(p -> {
            p.setStatus("ELIMINATED");
            participantRepo.save(p);
        });
    }

    private void advanceRound(Tournament t, List<TournamentMatch> round) {
        List<UUID> winners = round.stream()
            .sorted(Comparator.comparingInt(TournamentMatch::getSlot))
            .map(TournamentMatch::getWinnerId)
            .filter(Objects::nonNull)
            .toList();

        if (winners.size() <= 1) {
            t.setStatus("COMPLETED");
            t.setWinnerId(winners.isEmpty() ? null : winners.get(0));
            tournamentRepo.save(t);
            if (!winners.isEmpty())
                participantRepo.findByTournamentIdAndUserId(t.getId(), winners.get(0))
                    .ifPresent(p -> { p.setFinalRank(1); participantRepo.save(p); });
            log.info("Tournament {} completed — champion {}", t.getId(), t.getWinnerId());
            return;
        }
        int next = t.getCurrentRound() + 1;
        createRound(t, next, new ArrayList<>(winners));
        t.setCurrentRound(next);
        tournamentRepo.save(t);
    }

    private boolean isResolved(TournamentMatch m) {
        return "COMPLETE".equals(m.getStatus()) || "BYE".equals(m.getStatus());
    }

    // ── Game-type dispatch ────────────────────────────────────────────────

    private UUID createGame(String gameType, UUID p1, UUID p2) {
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.createMatch(p1, p2);
            case "GOMOKU"     -> gomoku.createMatch(p1, p2);
            case "BATTLESHIP" -> battleship.createMatch(p1, p2);
            default -> throw new IllegalArgumentException("Unsupported tournament game: " + gameType);
        };
    }

    private boolean gameComplete(String gameType, UUID gameId) {
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.isMatchComplete(gameId);
            case "GOMOKU"     -> gomoku.isMatchComplete(gameId);
            case "BATTLESHIP" -> battleship.isMatchComplete(gameId);
            default -> false;
        };
    }

    private UUID gameWinner(String gameType, UUID gameId) {
        return switch (gameType) {
            case "SCRABBLE"   -> scrabble.matchWinner(gameId);
            case "GOMOKU"     -> gomoku.matchWinner(gameId);
            case "BATTLESHIP" -> battleship.matchWinner(gameId);
            default -> null;
        };
    }

    private String displayName(UUID userId) {
        if (userId == null) return null;
        return userRepo.findById(userId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : u.getUsername())
            .orElse("Player");
    }
}
