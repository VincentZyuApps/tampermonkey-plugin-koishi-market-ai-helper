import { DEFAULT_CONFIG, STORAGE_KEYS } from './appConstants';
import { gmDelete, gmGet, gmSet } from '../platform/gmBridge';
import type { Config, Message } from '../types/appTypes';

export function loadConfig(): Config {
  const saved = gmGet<Partial<Config>>(STORAGE_KEYS.config, {});
  return { ...DEFAULT_CONFIG, ...saved };
}

export function saveConfig(config: Config): void {
  const value = { ...config };
  if (!value.persistApiKey) value.apiKey = '';
  gmSet(STORAGE_KEYS.config, value);
}

export function loadInitialMessages(config: Config): Message[] {
  if (config.saveHistory) {
    const history = gmGet<Message[]>(STORAGE_KEYS.history, []);
    if (Array.isArray(history) && history.length) return history;
  }
  return [welcomeMessage()];
}

export function welcomeMessage(): Message {
  return {
    role: 'assistant',
    content: '你好喵，我可以帮你用自然语言找 Koishi 插件 🔍。配置 API key 后会优先走 LLM 🤖；没有 key 时会自动使用本地增强搜索 🧭。',
    cards: [],
  };
}

export function saveHistoryIfNeeded(config: Config, messages: Message[]): void {
  if (config.saveHistory) {
    gmSet(STORAGE_KEYS.history, messages.slice(-30).map(stripRuntimeMessageState));
  } else {
    gmDelete(STORAGE_KEYS.history);
  }
}

export function clearStoredHistory(): void {
  gmDelete(STORAGE_KEYS.history);
}

export function getApiKey(config: Config, sessionApiKey: string): string {
  return config.persistApiKey ? config.apiKey : sessionApiKey;
}

export function defaultModelFor(provider: Config['provider']): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'deepseek-v4-flash';
}

export function providerLabel(provider: Config['provider']): string {
  return provider === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible';
}

function stripRuntimeMessageState(message: Message): Message {
  const next = { ...message };
  delete next.reasoningOpen;
  return next;
}
