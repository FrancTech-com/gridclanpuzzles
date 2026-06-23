package com.gridclan.config;

import com.gridclan.security.JwtService;
import io.jsonwebtoken.Claims;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WebSocket / STOMP configuration for GridClan community chat.
 *
 * Architecture:
 *   Client connects: WS wss://api.gridclanpuzzle.win/ws?token=<JWT>
 *   STOMP CONNECT:   Authorization header or token query param
 *   Subscribe:       /topic/community/{communityId}
 *   Publish (send):  /app/community/{communityId}/chat
 *   Server → client: /topic/community/{communityId}
 *
 * Security:
 *   JwtChannelInterceptor validates JWT on every CONNECT frame.
 *   User-to-user destinations disabled — only community broadcast.
 *   Rate limiting: RateLimitFilter still applies to the HTTP upgrade request.
 *
 * Broker (blueprint § WebSocket scalability):
 *   Default: simple in-process broker — good to ~10k connections on one
 *   instance.
 *   Scale-out: set gridclan.ws.relay.enabled=true to relay /topic through
 *   an external STOMP broker (RabbitMQ with the STOMP plugin, port 61613)
 *   so chat fans out across multiple Spring Boot instances. Zero client
 *   changes — the switch is config-only.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final JwtService jwtService;

    @Value("${gridclan.ws.relay.enabled:false}")  private boolean relayEnabled;
    @Value("${gridclan.ws.relay.host:localhost}") private String  relayHost;
    @Value("${gridclan.ws.relay.port:61613}")     private int     relayPort;
    @Value("${gridclan.ws.relay.login:guest}")    private String  relayLogin;
    @Value("${gridclan.ws.relay.passcode:guest}") private String  relayPasscode;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        if (relayEnabled) {
            // External STOMP broker — multi-instance fan-out
            registry.enableStompBrokerRelay("/topic")
                .setRelayHost(relayHost)
                .setRelayPort(relayPort)
                .setClientLogin(relayLogin)
                .setClientPasscode(relayPasscode)
                .setSystemLogin(relayLogin)
                .setSystemPasscode(relayPasscode);
        } else {
            // Simple in-process broker for community topic broadcasts
            registry.enableSimpleBroker("/topic");
        }
        // Client sends to /app/community/{id}/chat
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
            .addInterceptors(new TokenHandshakeInterceptor())
            // Allow React Native and web clients
            .setAllowedOriginPatterns("*")
            .withSockJS()   // Fallback for environments without native WS
                .setHeartbeatTime(25_000);
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new JwtChannelInterceptor(jwtService));
    }

    // ── Extract token from query param during HTTP upgrade ────────────────

    static class TokenHandshakeInterceptor implements HandshakeInterceptor {
        @Override
        public boolean beforeHandshake(ServerHttpRequest req, ServerHttpResponse res,
                                       WebSocketHandler handler, Map<String, Object> attrs) {
            String query = req.getURI().getQuery();
            if (query != null && query.contains("token=")) {
                for (String param : query.split("&")) {
                    if (param.startsWith("token=")) {
                        attrs.put("jwtToken", param.substring(6));
                        break;
                    }
                }
            }
            return true;
        }

        @Override
        public void afterHandshake(ServerHttpRequest req, ServerHttpResponse res,
                                   WebSocketHandler handler, Exception ex) {}
    }

    // ── JWT validation on STOMP CONNECT frame ────────────────────────────

    @RequiredArgsConstructor
    @Slf4j
    static class JwtChannelInterceptor implements ChannelInterceptor {

        private final JwtService jwtService;

        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

            if (accessor == null) return message;
            if (!StompCommand.CONNECT.equals(accessor.getCommand())) return message;

            // Try Authorization header first, then session attribute from handshake
            String token = accessor.getFirstNativeHeader("Authorization");
            if (token != null && token.startsWith("Bearer ")) {
                token = token.substring(7);
            } else {
                Object attrToken = accessor.getSessionAttributes() != null
                    ? accessor.getSessionAttributes().get("jwtToken") : null;
                token = attrToken != null ? attrToken.toString() : null;
            }

            if (token == null) {
                log.warn("WS CONNECT rejected — no token");
                throw new org.springframework.security.access.AccessDeniedException(
                    "Missing authentication token");
            }

            try {
                Claims claims = jwtService.validateAndParse(token);
                UUID userId   = UUID.fromString(claims.getSubject());
                String role   = (String) claims.get("role");

                UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(
                        userId, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role)));

                accessor.setUser(auth);
                log.debug("WS CONNECT authenticated: userId={}", userId);

            } catch (Exception e) {
                log.warn("WS CONNECT rejected — invalid token: {}", e.getMessage());
                throw new org.springframework.security.access.AccessDeniedException(
                    "Invalid authentication token");
            }

            return message;
        }
    }
}
