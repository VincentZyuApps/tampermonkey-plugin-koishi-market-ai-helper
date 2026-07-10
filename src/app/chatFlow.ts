import { buildAssistantMessage } from '../ui/assistantMessage';
import { STORAGE_KEYS } from './appConstants';
import { clearStoredHistory, getApiKey } from './appConfig';
import { callLlm, parseLlmJson } from '../llm/llmClient';
import { loadRegistry } from '../market/registryClient';
import { searchPlugins } from '../market/searchEngine';
import { clampRecallLimit } from '../ui/settingsForm';
import type { Logger } from '../log/appLogger';
import type { AppState, PluginSummary } from '../types/appTypes';

export async function searchAndRespond(
  state: AppState,
  logger: Logger,
  query: string,
  forceLocal: boolean,
  render: () => void,
): Promise<void> {
  const registry = await loadRegistry(state, logger);
  const localResults = searchPlugins(registry.objects, query, clampRecallLimit(state.config.recallLimit));
  state.lastLocalResults = localResults;
  logger.write('info', '本地召回完成', {
    total: registry.objects.length,
    returned: localResults.length,
    top: localResults.slice(0, 5).map((result) => ({
      score: Number(result.score.toFixed(3)),
      name: result.item.name,
    })),
  });

  if (forceLocal || !getApiKey(state.config, state.sessionApiKey)) {
    pushLocalResults(state, logger, forceLocal, localResults.map((result) => result.item));
    return;
  }

  const placeholder = { role: 'assistant' as const, content: '🔍 正在召回插件并请求 LLM 重排……', cards: [] };
  state.messages.push(placeholder);
  render();
  logger.write('info', '开始请求 LLM', {
    provider: state.config.provider,
    baseUrl: state.config.baseUrl,
    model: state.config.model,
    candidates: localResults.length,
  });

  const candidates = localResults.map((result) => result.item);
  const raw = await callLlm(state, logger, query, candidates, (deltaText) => {
    placeholder.content = deltaText || '🌊 正在接收流式响应……';
    render();
  });
  const parsed = parseLlmJson(raw);
  logger.write(raw ? 'info' : 'warn', 'LLM 原始响应已返回', {
    length: raw.length,
    preview: raw.slice(0, 500),
  });
  logger.write(parsed ? 'info' : 'warn', parsed ? 'LLM JSON 解析成功' : 'LLM JSON 解析失败，将降级显示原文', {
    hasParsed: Boolean(parsed),
  });
  state.messages[state.messages.length - 1] = buildAssistantMessage(raw, parsed, candidates);
}

export function clearCurrentChat(state: AppState, logger: Logger): void {
  state.messages = [{
    role: 'assistant',
    content: '🧹 当前界面对话已清空，已保存的历史没有被删除。刷新页面后，如果开启了保存历史，旧历史仍可能恢复。',
    cards: [],
  }];
  state.lastLocalResults = [];
  state.notice = '🧹 已清空当前界面对话。';
  logger.write('info', '清空当前界面对话', {
    persistentHistoryUntouched: true,
    saveHistory: state.config.saveHistory,
  });
}

export function clearAllHistory(state: AppState, logger: Logger): void {
  state.messages = [{
    role: 'assistant',
    content: '🗑️ 当前对话和 Tampermonkey 中保存的聊天历史都已清空。你可以继续输入插件需求。',
    cards: [],
  }];
  state.lastLocalResults = [];
  clearStoredHistory();
  state.notice = '🗑️ 已清空所有聊天历史。';
  logger.write('info', '清空所有聊天历史', { storageKey: STORAGE_KEYS.history });
}

export function handleSearchError(state: AppState, logger: Logger, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  logger.write('error', '搜索处理失败', {
    message,
    stack: error instanceof Error ? error.stack || '' : '',
  });
  state.messages.push({
    role: 'assistant',
    content: `⚠️ 处理失败：${message}\n如果是 API 或网络问题，可以先使用本地增强搜索结果。`,
    cards: state.lastLocalResults.map((result) => result.item),
  });
}

export function logSearchStart(state: AppState, logger: Logger, forceLocal: boolean, query: string): void {
  logger.write('info', forceLocal ? '开始本地增强搜索' : '开始对话搜索', {
    query,
    provider: state.config.provider,
    model: state.config.model,
    hasApiKey: Boolean(getApiKey(state.config, state.sessionApiKey)),
    recallLimit: state.config.recallLimit,
    stream: state.config.stream,
  });
}

function pushLocalResults(
  state: AppState,
  logger: Logger,
  forceLocal: boolean,
  cards: PluginSummary[],
): void {
  const reason = forceLocal ? '🧭 已按你的要求只使用本地增强搜索。' : '🔑 未配置 API key，先显示本地增强搜索结果。';
  logger.write('info', forceLocal ? '跳过 LLM：用户选择本地搜索' : '跳过 LLM：未配置 API key');
  state.messages.push({
    role: 'assistant',
    content: `${reason}\n这些结果来自 registry 元数据、关键词、分类、下载量、评分和认证状态的综合排序。`,
    cards,
  });
}
