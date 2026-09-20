export class AuthRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Authentication request timed out after ${timeoutMs}ms.`);
    this.name = "AuthRequestTimeoutError";
  }
}

/**
 * Bounds a backend authentication request and aborts the underlying fetch when
 * the deadline passes. An outage must surface as a recoverable service error,
 * never as an indefinite pending login.
 */
export async function withAuthRequestTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const timeoutController = new AbortController();
  const signals = options.signal
    ? [options.signal, timeoutController.signal]
    : [timeoutController.signal];
  const combined =
    signals.length === 1 ? signals[0]! : AbortSignal.any(signals);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener = () => {};
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new AuthRequestTimeoutError(options.timeoutMs);
      timeoutController.abort(error);
      reject(error);
    }, options.timeoutMs);
  });
  const externallyAborted = new Promise<never>((_resolve, reject) => {
    if (!options.signal) return;
    const fail = () =>
      reject(
        options.signal?.reason ??
          new DOMException("The request was aborted.", "AbortError"),
      );
    if (options.signal.aborted) {
      fail();
      return;
    }
    options.signal.addEventListener("abort", fail, { once: true });
    removeAbortListener = () =>
      options.signal?.removeEventListener("abort", fail);
  });
  try {
    return await Promise.race([work(combined), timeout, externallyAborted]);
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener();
  }
}
