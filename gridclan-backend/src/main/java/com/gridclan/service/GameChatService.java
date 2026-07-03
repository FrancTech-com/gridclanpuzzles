package com.gridclan.service;

import com.gridclan.entity.GameChatMessage;
import com.gridclan.repository.GameChatMessageRepository;
import com.gridclan.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * In-game chat between the two players of a real-time game — now persistent
 * (short-lived) with dual delivery:
 *
 *   fast path: broadcast on /topic/game/{kind}/{gameId}/chat (instant when the
 *              WebSocket is up)
 *   safe path: rows in game_chat_messages, served over REST — history loads on
 *              entry and a 4s poll delivers messages even with the socket down
 *              (the same fallback pattern the game moves use).
 *
 * Clients dedupe by message id, so receiving a message on both paths is fine.
 * Chat stays throwaway: a nightly job purges rows older than 7 days.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GameChatService {

    private final GameChatMessageRepository repo;
    private final UserRepository            userRepo;
    private final GameParticipantResolver   participantResolver;
    private final SimpMessagingTemplate     broker;

    public static final int MAX_MSG_LEN  = 300;
    public static final int HISTORY_SIZE = 200;

    /** Persist + broadcast one message. Returns the message view, or null if
     *  the sender isn't a player of this game / the content is empty. */
    @Transactional
    public Map<String, Object> record(String kind, UUID gameId, UUID senderId, String rawContent) {
        if (!participantResolver.isParticipant(kind, gameId, senderId)) {
            log.debug("Game chat rejected — userId={} not a player of {} {}", senderId, kind, gameId);
            return null;
        }
        String content = rawContent == null ? "" : rawContent.trim();
        if (content.isEmpty()) return null;
        if (content.length() > MAX_MSG_LEN) content = content.substring(0, MAX_MSG_LEN);

        String name = userRepo.findById(senderId)
            .map(u -> u.getDisplayName() != null ? u.getDisplayName() : "Player")
            .orElse("Player");

        GameChatMessage saved = repo.save(GameChatMessage.builder()
            .kind(kind).gameId(gameId)
            .senderId(senderId).senderName(name)
            .content(content)
            .build());

        Map<String, Object> view = view(saved);
        broker.convertAndSend("/topic/game/" + kind + "/" + gameId + "/chat", view);
        return view;
    }

    /** Last {@value HISTORY_SIZE} messages, oldest → newest. Participants only. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> history(String kind, UUID gameId, UUID userId) {
        if (!participantResolver.isParticipant(kind, gameId, userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a player of this game.");
        }
        List<GameChatMessage> newestFirst =
            repo.findByKindAndGameIdOrderByCreatedAtDesc(kind, gameId, PageRequest.of(0, HISTORY_SIZE));
        List<Map<String, Object>> out = new ArrayList<>(newestFirst.size());
        for (GameChatMessage m : newestFirst) out.add(view(m));
        Collections.reverse(out);
        return out;
    }

    /** Nightly at 03:30 EAT: purge chat older than 7 days — throwaway by design. */
    @Scheduled(cron = "0 30 3 * * *", zone = "Africa/Kampala")
    @Transactional
    public void purgeOldMessages() {
        int deleted = repo.deleteOlderThan(Instant.now().minus(7, ChronoUnit.DAYS));
        if (deleted > 0) log.info("Game chat purge: {} messages older than 7 days removed", deleted);
    }

    private Map<String, Object> view(GameChatMessage m) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id",         m.getId().toString());
        out.put("senderId",   m.getSenderId().toString());
        out.put("senderName", m.getSenderName());
        out.put("content",    m.getContent());
        out.put("sentAt",     m.getCreatedAt().toString());
        return out;
    }
}
