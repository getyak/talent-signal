export class SystemHealthTimeoutError extends Error {
  constructor() {
    super("System health observation timed out.");
    this.name = "SystemHealthTimeoutError";
  }
}

export async function withSystemHealthTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const timeoutController = new AbortController();
  const signals = options.signal
    ? [options.signal, timeoutController.signal]
    : [timeoutController.signal];
  const combined = signals.length === 1
    ? signals[0]!
    : AbortSignal.any(signals);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener = () => {};
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new SystemHealthTimeoutError();
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
    removeAbortListener = () => options.signal?.removeEventListener("abort", fail);
  });
  try {
    return await Promise.race([work(combined), timeout, externallyAborted]);
  } finally {
    if (timer) clearTimeout(timer);
    removeAbortListener();
  }
}
