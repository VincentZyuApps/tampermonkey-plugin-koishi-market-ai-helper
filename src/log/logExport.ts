import { DEFAULT_LOG_COPY_LIMIT } from '../app/appConstants';
import type { LogEntry } from '../types/appTypes';

export function buildLogExportText(logs: LogEntry[], limit: number): string {
  const maxChars = normalizeLogLimit(limit);
  if (!logs.length) return '暂无日志。'.slice(0, maxChars);

  const chunks: string[] = [];
  let used = 0;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const prefix = chunks.length ? '\n\n' : '';
    const chunk = prefix + formatLogEntry(logs[index]);
    const remaining = maxChars - used;
    if (remaining <= 0) break;

    if (chunk.length <= remaining) {
      chunks.push(chunk);
      used += chunk.length;
    } else {
      chunks.push(chunk.slice(0, remaining));
      break;
    }
  }
  return chunks.join('');
}

export function normalizeLogLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOG_COPY_LIMIT;
  return Math.max(1, Math.min(1000000, Math.floor(value)));
}

function formatLogEntry(entry: LogEntry): string {
  const lines = [`[${entry.time}] ${entry.level.toUpperCase()} ${entry.message}`];
  if (entry.detail) lines.push(entry.detail);
  return lines.join('\n');
}
