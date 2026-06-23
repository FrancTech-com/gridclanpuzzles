package com.gridclan.exception;
public class DuplicateRewardException extends RuntimeException {
    public DuplicateRewardException() { super("DuplicateRewardException"); }
    public DuplicateRewardException(String msg) { super(msg); }
    public DuplicateRewardException(String msg, Throwable cause) { super(msg, cause); }
}
