import { DEFAULT_CONFIG } from '../app/appConstants';
import { defaultModelFor } from '../app/appConfig';
import type { Config } from '../types/appTypes';

export function readSettingsFromForm(shadow: ShadowRoot, config: Config): Config {
  const provider = getInputValue(shadow, 'provider') as Config['provider'];
  const next: Config = {
    ...config,
    provider: provider || DEFAULT_CONFIG.provider,
    baseUrl: normalizeBaseUrl(getInputValue(shadow, 'baseUrl') || DEFAULT_CONFIG.baseUrl),
    model: getInputValue(shadow, 'model').trim() || defaultModelFor(provider || DEFAULT_CONFIG.provider),
    persistApiKey: getChecked(shadow, 'persistApiKey'),
    saveHistory: getChecked(shadow, 'saveHistory'),
    stream: getChecked(shadow, 'stream'),
    chatDetail: readChatDetail(getInputValue(shadow, 'chatDetail')),
    logLevel: readLogLevel(getInputValue(shadow, 'logLevel')),
    recallLimit: clampRecallLimit(
      Number.parseInt(getInputValue(shadow, 'recallLimit') || String(DEFAULT_CONFIG.recallLimit), 10),
    ),
    maxTokens: clampNumber(
      Number.parseInt(getInputValue(shadow, 'maxTokens') || String(DEFAULT_CONFIG.maxTokens), 10),
      300,
      8000,
      DEFAULT_CONFIG.maxTokens,
    ),
  };

  if (next.provider === 'anthropic' && (!next.baseUrl || next.baseUrl === DEFAULT_CONFIG.baseUrl)) {
    next.baseUrl = 'https://api.anthropic.com';
    if (!next.model || next.model === DEFAULT_CONFIG.model) next.model = 'claude-sonnet-4-20250514';
  }
  return next;
}

export function getInputValue(shadow: ShadowRoot, name: string): string {
  return shadow.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting="${name}"]`)?.value || '';
}

export function clampRecallLimit(value: number): number {
  return clampNumber(value, 5, 80, DEFAULT_CONFIG.recallLimit);
}

function getChecked(shadow: ShadowRoot, name: string): boolean {
  return Boolean(shadow.querySelector<HTMLInputElement>(`[data-setting="${name}"]`)?.checked);
}

function normalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function readChatDetail(value: string): Config['chatDetail'] {
  if (value === 'normal' || value === 'quiet') return value;
  return 'chatty';
}

function readLogLevel(value: string): Config['logLevel'] {
  if (value === 'error' || value === 'warn' || value === 'debug' || value === 'trace') return value;
  return 'info';
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
