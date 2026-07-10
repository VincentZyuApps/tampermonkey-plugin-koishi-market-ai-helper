import { APP_LOG_PREFIX } from '../app/appMeta';
import type { AppState, LogLevel } from '../types/appTypes';

export class Logger {
  constructor(private readonly getState: () => AppState, private readonly render: () => void) {}

  write(level: LogLevel, message: string, detail?: unknown): void {
    const state = this.getState();
    const entry = {
      level,
      message,
      time: new Date().toLocaleTimeString(),
      detail: detail === undefined ? '' : stringifyLogDetail(sanitizeLogValue(detail)),
    };
    state.logs.push(entry);
    if (state.logs.length > 120) state.logs.splice(0, state.logs.length - 120);

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](APP_LOG_PREFIX, message, detail === undefined ? '' : sanitizeLogValue(detail));

    if (!state.collapsed && !state.busy) this.render();
  }
}

function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return redactSecret(value);
  if (typeof value !== 'object') return value;
  if (depth > 4) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/api.?key|authorization|x-api-key|token|secret|password/i.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeLogValue(child, depth + 1);
    }
  }
  return result;
}

function redactSecret(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[REDACTED]');
}

function stringifyLogDetail(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
