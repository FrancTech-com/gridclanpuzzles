package com.gridclan;

import com.gridclan.entity.GameChatMessage;
import com.gridclan.repository.GameChatMessageRepository;
import com.gridclan.repository.UserRepository;
import com.gridclan.service.GameChatService;
import com.gridclan.service.GameParticipantResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GameChatServiceTest {

    @Mock GameChatMessageRepository repo;
    @Mock UserRepository            userRepo;
    @Mock GameParticipantResolver   participantResolver;
    @Mock SimpMessagingTemplate     broker;

    @InjectMocks GameChatService service;

    private final UUID GAME = UUID.randomUUID();
    private final UUID USER = UUID.randomUUID();

    @Test
    void record_persistsAndBroadcasts() {
        when(participantResolver.isParticipant("scrabble", GAME, USER)).thenReturn(true);
        when(userRepo.findById(USER)).thenReturn(java.util.Optional.empty());
        when(repo.save(any())).thenAnswer(i -> {
            GameChatMessage m = i.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        Map<String, Object> out = service.record("scrabble", GAME, USER, "  gg wp  ");

        assertThat(out).isNotNull();
        assertThat(out.get("content")).isEqualTo("gg wp");   // trimmed
        assertThat(out.get("id")).isNotNull();               // clients dedupe by id
        verify(repo).save(any());
        verify(broker).convertAndSend(eq("/topic/game/scrabble/" + GAME + "/chat"), eq(out));
    }

    @Test
    void record_nonParticipant_rejectedWithoutSaving() {
        when(participantResolver.isParticipant("gomoku", GAME, USER)).thenReturn(false);

        assertThat(service.record("gomoku", GAME, USER, "hi")).isNull();
        verifyNoInteractions(repo, broker);
    }

    @Test
    void record_overlongMessage_truncatedTo300() {
        when(participantResolver.isParticipant("scrabble", GAME, USER)).thenReturn(true);
        when(userRepo.findById(USER)).thenReturn(java.util.Optional.empty());
        when(repo.save(any())).thenAnswer(i -> {
            GameChatMessage m = i.getArgument(0);
            m.setId(UUID.randomUUID());
            return m;
        });

        Map<String, Object> out = service.record("scrabble", GAME, USER, "x".repeat(500));
        assertThat(((String) out.get("content"))).hasSize(GameChatService.MAX_MSG_LEN);
    }

    @Test
    void history_nonParticipant_forbidden() {
        when(participantResolver.isParticipant("battleship", GAME, USER)).thenReturn(false);
        assertThatThrownBy(() -> service.history("battleship", GAME, USER))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void history_returnsOldestFirst() {
        when(participantResolver.isParticipant("scrabble", GAME, USER)).thenReturn(true);
        GameChatMessage newer = msg("second", Instant.now());
        GameChatMessage older = msg("first",  Instant.now().minusSeconds(60));
        // repo returns newest-first; service must reverse for display
        when(repo.findByKindAndGameIdOrderByCreatedAtDesc(eq("scrabble"), eq(GAME), any()))
            .thenReturn(List.of(newer, older));

        List<Map<String, Object>> out = service.history("scrabble", GAME, USER);
        assertThat(out).extracting(m -> m.get("content")).containsExactly("first", "second");
    }

    private GameChatMessage msg(String content, Instant at) {
        return GameChatMessage.builder()
            .id(UUID.randomUUID()).kind("scrabble").gameId(GAME)
            .senderId(USER).senderName("P").content(content).createdAt(at)
            .build();
    }
}
