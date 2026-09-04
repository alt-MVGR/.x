/**
 * Custom Error classes for structured error handling
 */

class BaseError extends Error {
  constructor(type, message, recoverable = false, retryAfter = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.recoverable = recoverable;
    this.retryAfter = retryAfter;
    this.details = details;
  }
}

export class AuthError extends BaseError {
  constructor(message, details = null) {
    super("AUTH_ERROR", message, false, null, details);
  }
}

export class NetworkError extends BaseError {
  constructor(message, details = null) {
    super("NETWORK_ERROR", message, true, null, details);
  }
}

export class RateLimitError extends BaseError {
  constructor(message, retryAfter = null, details = null) {
    super("RATE_LIMIT", message, true, retryAfter, details);
  }
}

export class InvalidResponseError extends BaseError {
  constructor(message, details = null) {
    super("INVALID_RESPONSE", message, false, null, details);
  }
}

export class ParserError extends BaseError {
  constructor(message, details = null) {
    super("PARSER_ERROR", message, true, null, details);
  }
}

export class ScreenshotError extends BaseError {
  constructor(message, details = null) {
    super("SCREENSHOT_ERROR", message, false, null, details);
  }
}

export class FirestoreError extends BaseError {
  constructor(message, details = null) {
    super("FIRESTORE_ERROR", message, false, null, details);
  }
}

export class VisionError extends BaseError {
  constructor(message, details = null) {
    super("VISION_ERROR", message, false, null, details);
  }
}
