/**
 * Incremental first-turn visible-text filter.
 *
 * The first assistant turn may open with a transport-only
 * `<session_title>...</session_title>` envelope. Streaming must never expose
 * that metadata, and it must not stall when a delta splits a marker prefix.
 * A forming response is not evidence; the canonical
 * `splitFirstTurnSessionTitle` remains the authority for the final body.
 */

const OPEN = "<session_title>";
const CLOSE = "</session_title>";
/** The stored title is bounded to 256 characters; this leaves marker slack. */
const MAX_MARKER_BUFFER = 512;

export class VisibleTextFilter {
  private pending = "";
  private tail = "";
  private bodyStarted = false;

  constructor(private readonly titleRequested: boolean) {}

  /** Returns newly safe visible text derived from this delta. */
  push(delta: string): string {
    if (!this.titleRequested) return delta;
    if (this.bodyStarted) {
      this.tail += delta;
      return this.drainTail();
    }
    this.pending += delta;
    return this.consume(false);
  }

  /** Returns any remaining safe visible text once the stream has ended. */
  flush(): string {
    if (!this.titleRequested) return "";
    if (this.bodyStarted) {
      const out = this.tail.replace(/\s+$/u, "");
      this.tail = "";
      return out;
    }
    return this.consume(true);
  }

  /** Emit everything except a possible trailing whitespace tail. */
  private drainTail(): string {
    let lastNonWhitespace = -1;
    for (let index = this.tail.length - 1; index >= 0; index -= 1) {
      if (!/\s/u.test(this.tail[index]!)) {
        lastNonWhitespace = index;
        break;
      }
    }
    if (lastNonWhitespace < 0) return "";
    const out = this.tail.slice(0, lastNonWhitespace + 1);
    this.tail = this.tail.slice(lastNonWhitespace + 1);
    return out;
  }

  private beginBody(text: string): string {
    this.bodyStarted = true;
    this.tail = text;
    return this.drainTail();
  }

  private consume(final: boolean): string {
    for (;;) {
      const trimmed = this.pending.replace(/^\s+/u, "");
      if (!trimmed) {
        this.pending = "";
        return "";
      }
      if (trimmed.startsWith(OPEN)) {
        const rest = trimmed.slice(OPEN.length);
        const closeAt = rest.indexOf(CLOSE);
        if (closeAt < 0) {
          if (!final && trimmed.length <= MAX_MARKER_BUFFER) {
            this.pending = trimmed;
            return "";
          }
          // An unclosed metadata line is unusable. Match the canonical parser:
          // drop the first line and keep whatever follows it.
          const newline = trimmed.indexOf("\n");
          const tail = newline < 0 ? "" : trimmed.slice(newline + 1).replace(/^\s+/u, "");
          this.pending = tail;
          if (!tail) return "";
          continue;
        }
        this.pending = rest.slice(closeAt + CLOSE.length).replace(/^\s+/u, "");
        continue;
      }
      if (!final && trimmed.length < OPEN.length && OPEN.startsWith(trimmed)) {
        // A delta may end mid-marker; wait for more before deciding.
        this.pending = trimmed;
        return "";
      }
      return this.beginBody(trimmed);
    }
  }
}

export function createVisibleTextFilter(titleRequested: boolean): VisibleTextFilter {
  return new VisibleTextFilter(titleRequested);
}
