package com.gridclan.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Value("${gridclan.mail.from}")
    private String fromAddress;
    @Value("${gridclan.mail.from-name}")
    private String fromName;
    @Value("${gridclan.mail.base-url}")
    private String baseUrl;

    // DateTimeFormatter removed: previously unused field caused a warning

    private void send(String to, String subject, String template, Context ctx) throws MessagingException {
        String html = templateEngine.process(template, ctx);
        MimeMessage msg = mailSender.createMimeMessage();
        
        // Clean approach: StandardCharsets avoids checked exceptions
        MimeMessageHelper helper = new MimeMessageHelper(msg, true, StandardCharsets.UTF_8.name());
        try {
            helper.setFrom(fromAddress, fromName);
        } catch (java.io.UnsupportedEncodingException e) {
            throw new MessagingException("Failed to set sender address", e);
        }
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(html, true);
        mailSender.send(msg);
    }

    @Async
    public void sendDeletionConfirmation(String email, UUID tombstoneId) {
        if (email == null) return;
        try {
            String cancelUrl = baseUrl + "/account/cancel-deletion?tombstoneId=" + tombstoneId;
            Context ctx = new Context();
            ctx.setVariable("tombstoneId", tombstoneId.toString());
            ctx.setVariable("cancelUrl", cancelUrl);
            send(email, "GridClan: Your account deletion request", "email/deletion-confirmation", ctx);
            log.info("Deletion confirmation sent to {}", mask(email));
        } catch (Exception e) {
            log.warn("Deletion confirmation email failed for {}: {}", mask(email), e.getMessage());
        }
    }

    private String mask(String email) {
        if (email == null || !email.contains("@")) return "****";
        String[] parts = email.split("@");
        return parts[0].charAt(0) + "***@" + parts[1].charAt(0) + "***";
    }
}