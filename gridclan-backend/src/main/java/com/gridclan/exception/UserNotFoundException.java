package com.gridclan.exception;
public class UserNotFoundException extends RuntimeException {
    public UserNotFoundException() { super("UserNotFoundException"); }
    public UserNotFoundException(String msg) { super(msg); }
    public UserNotFoundException(String msg, Throwable cause) { super(msg, cause); }
}
