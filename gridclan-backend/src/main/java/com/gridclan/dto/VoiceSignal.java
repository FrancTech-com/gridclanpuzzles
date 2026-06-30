package com.gridclan.dto;

import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * WebRTC voice-call signalling payload for friend-to-friend in-game voice.
 *
 * Audio itself flows peer-to-peer (WebRTC) — the server only relays these tiny
 * signalling frames between the two players of one game session, over the shared
 * STOMP connection.
 *
 *   Client sends:  /app/{kind}/{gameId}/voice
 *   Server relays: /topic/{kind}/{gameId}/voice   (both players; each ignores its own)
 *
 * Handshake flow:
 *   REQUEST  → caller taps the mic; the friend sees "requested voice" + Accept/Decline
 *   ACCEPT   → friend accepts; caller now creates the WebRTC OFFER
 *   DECLINE  → friend declines; caller returns to idle
 *   OFFER    → caller's SDP offer            (sdp set)
 *   ANSWER   → callee's SDP answer           (sdp set)
 *   ICE      → trickled ICE candidate        (candidate set)
 *   HANGUP   → either side ends the call
 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class VoiceSignal {

    public enum Type { REQUEST, ACCEPT, DECLINE, OFFER, ANSWER, ICE, HANGUP }

    private Type type;

    /** SDP blob for OFFER / ANSWER. */
    private String sdp;

    /** ICE candidate object for ICE frames (opaque pass-through). */
    private Object candidate;

    // Server-populated — clients must not set these (ignored / overwritten).
    private String  gameKind;
    private UUID    fromUserId;
    private String  fromName;
    private Instant sentAt;
}
