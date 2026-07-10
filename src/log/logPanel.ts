import { STORAGE_KEYS } from '../app/appConstants';
import { gmSet } from '../platform/gmBridge';
import { buildLogExportText, normalizeLogLimit } from './logExport';
import { copyText } from '../market/pageActions';
import type { Logger } from './appLogger';
import type { AppState } from '../types/appTypes';

export function bindLogPanel(shadow: ShadowRoot, state: AppState, logger: Logger, render: () => void): void {
  shadow.querySelector('[data-action="clear-log"]')?.addEventListener('click', () => {
    state.logs = [];
    logger.write('info', '日志已清空');
  });

  shadow.querySelector('[data-action="copy-log"]')?.addEventListener('click', () => {
    syncLogCopyLimit(shadow, state);
    const text = buildLogExportText(state.logs, state.logCopyLimit);
    copyText(text);
    state.notice = `📋 已复制最近 ${text.length} 个字符的日志。`;
    logger.write('info', '日志已复制到剪贴板', {
      copiedCharacters: text.length,
      limitCharacters: state.logCopyLimit,
      logEntries: state.logs.length,
    });
    render();
  });

  shadow.querySelector<HTMLInputElement>('[data-role="log-copy-limit"]')?.addEventListener('input', () => {
    syncLogCopyLimit(shadow, state);
  });
}

function syncLogCopyLimit(shadow: ShadowRoot, state: AppState): void {
  const input = shadow.querySelector<HTMLInputElement>('[data-role="log-copy-limit"]');
  const next = normalizeLogLimit(Number.parseInt(input?.value || '', 10));
  state.logCopyLimit = next;
  gmSet(STORAGE_KEYS.logCopyLimit, next);
}
