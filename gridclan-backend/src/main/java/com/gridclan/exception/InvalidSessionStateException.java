package com.gridclan.exception;
public class InvalidSessionStateException extends RuntimeException {
    public InvalidSessionStateException() { super("InvalidSessionStateException"); }
    public InvalidSessionStateException(String msg) { super(msg); }
    public InvalidSessionStateException(String msg, Throwable cause) { super(msg, cause); }
}
