package com.gridclan.exception;
public class HintsBlockedException extends RuntimeException {
    public HintsBlockedException() { super("HintsBlockedException"); }
    public HintsBlockedException(String msg) { super(msg); }
    public HintsBlockedException(String msg, Throwable cause) { super(msg, cause); }
}
