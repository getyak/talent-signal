/** Stop waiting for non-cancelable DNS/native promises without allowing their
 * eventual resolution to continue the caller's canceled operation. */
export function withAbort<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); }).then(
      value => { signal.removeEventListener("abort", abort); if (signal.aborted) reject(signal.reason); else resolve(value); },
      error => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}
