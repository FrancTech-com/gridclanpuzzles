package com.gridclan.exception;
public class CheatDetectedException extends RuntimeException {
    public CheatDetectedException() { super("CheatDetectedException"); }
    public CheatDetectedException(String msg) { super(msg); }
    public CheatDetectedException(String msg, Throwable cause) { super(msg, cause); }
}
