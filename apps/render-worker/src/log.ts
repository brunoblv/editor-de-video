/** Logs estruturados (JSON por linha) com projectId/jobId e sem segredos (§19). */
type Level = 'info' | 'warn' | 'error';

const REDACT = /(token|secret|password|authorization|credential|api[_-]?key)/i;

function sanitize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : sanitize(v)]));
}

export function log(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, service: 'render-worker', message, ...(sanitize(context) as object) });
  if (level === 'error') console.error(line);
  else console.log(line);
}
