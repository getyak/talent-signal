/** Central request/content redaction policy, including ephemeral conversations. */
export function requestLoggerOptions(level = process.env.LOG_LEVEL ?? "info") {
  return {
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.body.payload",
        "body.payload",
        "req.body.messages",
        "body.messages",
        "req.body.messages[*].content",
        "body.messages[*].content",
        "req.body.password",
        "req.body.access_token",
        "req.body.audio_base64",
        "req.body.content_parts[*].content_text",
        "req.body.content_parts[*].content_base64",
        "req.body.image.data_base64",
        "req.body.expected_behavior",
        "req.body.review_note",
        "headers.authorization",
        "body.password",
        "body.access_token",
        "body.audio_base64",
        "body.content_parts[*].content_text",
        "body.content_parts[*].content_base64",
        "body.image.data_base64",
        "body.expected_behavior",
        "body.review_note",
        "access_token",
        "password_scrypt",
      ],
      censor: "[redacted]",
    },
  };
}
