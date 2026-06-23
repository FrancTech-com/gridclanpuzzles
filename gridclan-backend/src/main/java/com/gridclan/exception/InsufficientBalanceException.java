package com.gridclan.exception;
public class InsufficientBalanceException extends RuntimeException {
    public InsufficientBalanceException() { super("InsufficientBalanceException"); }
    public InsufficientBalanceException(String msg) { super(msg); }
    public InsufficientBalanceException(String msg, Throwable cause) { super(msg, cause); }
}
