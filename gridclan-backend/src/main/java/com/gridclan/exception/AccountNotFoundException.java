package com.gridclan.exception;
public class AccountNotFoundException extends RuntimeException {
    public AccountNotFoundException() { super("AccountNotFoundException"); }
    public AccountNotFoundException(String msg) { super(msg); }
    public AccountNotFoundException(String msg, Throwable cause) { super(msg, cause); }
}
