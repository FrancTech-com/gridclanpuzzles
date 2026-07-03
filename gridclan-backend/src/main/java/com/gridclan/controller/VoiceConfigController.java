package com.gridclan.controller;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GET /voice/ice-servers — the STUN/TURN list clients feed to RTCPeerConnection.
 *
 * WHY: with STUN only, WebRTC voice needs a direct peer-to-peer path, which
 * carrier-grade NAT (MTN/Airtel mobile data — most of our players) almost
 * always blocks. A TURN relay is the fix: when P2P fails, audio bounces off
 * the relay and the call still connects.
 *
 * Servers come from config (gridclan.voice.*, overridable per environment via
 * VOICE_TURN_URLS / VOICE_TURN_USERNAME / VOICE_TURN_CREDENTIAL) so upgrading
 * to a paid/self-hosted TURN later is an env change, not a release. Defaults
 * use the Open Relay Project's free public TURN.
 */
@RestController
@RequestMapping("/voice")
public class VoiceConfigController {

    private final VoiceProperties props;

    public VoiceConfigController(VoiceProperties props) { this.props = props; }

    @GetMapping("/ice-servers")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<List<Map<String, Object>>> iceServers() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String url : props.getStunUrls()) {
            if (url == null || url.isBlank()) continue;
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("urls", url.trim());
            out.add(s);
        }
        for (String url : props.getTurnUrls()) {
            if (url == null || url.isBlank()) continue;
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("urls", url.trim());
            if (!props.getTurnUsername().isBlank())   s.put("username",   props.getTurnUsername());
            if (!props.getTurnCredential().isBlank()) s.put("credential", props.getTurnCredential());
            out.add(s);
        }
        return ResponseEntity.ok(out);
    }

    @Component
    @ConfigurationProperties(prefix = "gridclan.voice")
    @Getter @Setter
    public static class VoiceProperties {
        private List<String> stunUrls = new ArrayList<>();
        private List<String> turnUrls = new ArrayList<>();
        private String turnUsername   = "";
        private String turnCredential = "";
    }
}
