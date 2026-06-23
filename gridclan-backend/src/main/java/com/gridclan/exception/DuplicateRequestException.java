package com.gridclan.exception;
public class DuplicateRequestException extends RuntimeException {
    public DuplicateRequestException() { super("DuplicateRequestException"); }
    public DuplicateRequestException(String msg) { super(msg); }
    public DuplicateRequestException(String msg, Throwable cause) { super(msg, cause); }
}
