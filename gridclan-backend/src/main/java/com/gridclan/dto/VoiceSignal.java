package com.gridclan.dto;

import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * WebRTC voice-call signalling payload for in-game group voice.
 *
 * Audio flows peer-to-peer (a full mesh — each participant holds one
 * RTCPeerConnection to every other participant). The server only relays these
 * tiny signalling frames between the players seated at one game/table, over the
 * shared STOMP connection.
 *
 *   Client sends:  /app/{kind}/{gameId}/voice
 *   Server relays: /topic/{kind}/{gameId}/voice   (every seat; each ignores its own,
 *                  and directed frames are ignored unless toUserId matches)
 *
 * Room flow (any table size, 2-8):
 *   JOIN    → I entered the voice room (broadcast; a directed JOIN back announces
 *             an existing member to the newcomer). The lower userId offers.
 *   OFFER   → SDP offer to a specific peer     (sdp + toUserId set)
 *   ANSWER  → SDP answer to a specific peer    (sdp + toUserId set)
 *   ICE     → trickled ICE candidate to a peer (candidate + toUserId set)
 *   LEAVE   → I left the voice room (broadcast); peers close my connection.
 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class VoiceSignal {

    public enum Type { JOIN, LEAVE, OFFER, ANSWER, ICE }

    private Type type;

    /** SDP blob for OFFER / ANSWER. */
    private String sdp;

    /** ICE candidate object for ICE frames (opaque pass-through). */
    private Object candidate;

    /** Directed frames (OFFER / ANSWER / ICE / directed JOIN) target this peer;
     *  null = broadcast to the whole room (plain JOIN / LEAVE). */
    private UUID toUserId;

    // Server-populated — clients must not set these (ignored / overwritten).
    private String  gameKind;
    private UUID    fromUserId;
    private String  fromName;
    private Instant sentAt;
}
