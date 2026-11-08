/** Redact common credential formats before display, context, or persistence. */
const known = new Set<string>();
export function rememberSecret(value: string) {
  if (value) known.add(value);
}
export function redact(text: string): string {
  for (const secret of known) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/\b(?:sk|rk|pk)-(?:[A-Za-z0-9_-]{8,})/g, "[REDACTED]")
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|access[_-]?token|password|secret)\s*["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
      "$1[REDACTED]",
    );
}

/** Cancel local IPC waits as well as network generation; discard late results. */
export async function withAbort<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let stop: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    stop = () => reject(new DOMException("Stopped", "AbortError"));
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}
