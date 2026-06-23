package com.gridclan.exception;
public class SessionNotFoundException extends RuntimeException {
    public SessionNotFoundException() { super("SessionNotFoundException"); }
    public SessionNotFoundException(String msg) { super(msg); }
    public SessionNotFoundException(String msg, Throwable cause) { super(msg, cause); }
}
