package com.gridclan.exception;

/** Thrown when a gem spend/gift exceeds the player's current gem balance. */
public class InsufficientGemsException extends RuntimeException {
    public InsufficientGemsException() { super("Insufficient gems"); }
    public InsufficientGemsException(String msg) { super(msg); }
}
