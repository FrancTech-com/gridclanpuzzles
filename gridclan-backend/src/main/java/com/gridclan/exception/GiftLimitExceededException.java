package com.gridclan.exception;

/** Thrown when a gem gift would exceed the per-user daily gift cap. */
public class GiftLimitExceededException extends RuntimeException {
    public GiftLimitExceededException(String msg) { super(msg); }
}
