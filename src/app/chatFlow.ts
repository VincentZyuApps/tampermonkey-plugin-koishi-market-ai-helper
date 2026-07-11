import { buildAssistantMessage } from '../ui/assistantMessage';
import { STORAGE_KEYS } from './appConstants';
import { clearStoredHistory, getApiKey } from './appConfig';
import { callLlm, parseLlmJson } from '../llm/llmClient';
import { loadRegistry } from '../market/registryClient';
import { searchPlugins } from '../market/searchEngine';
import { clampRecallLimit } from '../ui/settingsForm';
import type { Logger } from '../log/appLogger';
import type { AppState, LlmStreamSnapshot, Message, PluginSummary } from '../types/appTypes';

export async function searchAndRespond(
  state: AppState,
  logger: Logger,
  query: string,
  forceLocal: boolean,
  render: () => void,
  signal?: AbortSignal,
): Promise<void> {
  const placeholder: Message = { role: 'assistant', content: '📚 正在加载 Koishi 插件索引……', cards: [] };
  state.messages.push(placeholder);
  setAssistantStatus(placeholder, logger, render, '📚 正在加载 Koishi 插件索引……', {
    registryCached: Boolean(state.registry),
  });

  const registry = await loadRegistry(state, logger);
  throwIfAborted(signal);
  setAssistantStatus(placeholder, logger, render, '🧭 正在本地召回候选插件……', {
    total: registry.objects.length,
    recallLimit: clampRecallLimit(state.config.recallLimit),
  });

  const localResults = searchPlugins(registry.objects, query, clampRecallLimit(state.config.recallLimit));
  throwIfAborted(signal);
  state.lastLocalResults = localResults;
  logger.write('info', '本地召回完成', {
    total: registry.objects.length,
    returned: localResults.length,
    top: localResults.slice(0, 5).map((result) => ({
      score: Number(result.score.toFixed(3)),
      name: result.item.name,
    })),
  });
  setAssistantStatus(placeholder, logger, render, `🧩 已召回 ${localResults.length} 个候选插件，正在判断是否需要 LLM 重排……`, {
    top: localResults.slice(0, 3).map((result) => result.item.name),
  });

  if (forceLocal || !getApiKey(state.config, state.sessionApiKey)) {
    fillLocalResults(placeholder, logger, forceLocal, localResults.map((result) => result.item));
    render();
    return;
  }

  const requestProfile = buildLlmRequestProfile(state);
  setAssistantStatus(placeholder, logger, render, '🌐 正在请求 LLM API，等待模型接收任务……', {
    provider: state.config.provider,
    model: state.config.model,
    stream: state.config.stream,
    thinkingMode: state.config.thinkingMode,
  }, requestProfile);
  logger.write('info', '开始请求 LLM', {
    provider: state.config.provider,
    baseUrl: state.config.baseUrl,
    model: state.config.model,
    requestFormat: llmRequestFormat(state),
    candidates: localResults.length,
  });

  const candidates = localResults.map((result) => result.item);
  let sawStreamText = false;
  let streamEvents = 0;
  let latestReasoning = '';
  const raw = await callLlm(state, logger, query, candidates, (snapshot) => {
    const visible = splitVisibleStream(snapshot);
    streamEvents = Math.max(streamEvents + 1, snapshot.events);
    latestReasoning = visible.reasoning || latestReasoning;
    if (visible.content) {
      if (!sawStreamText) {
        logger.write('info', 'LLM 流式首段已进入聊天界面', {
          contentLength: visible.content.length,
          reasoningLength: visible.reasoning.length,
        });
      }
      sawStreamText = true;
      updateStreamMessage(state, placeholder, visible, streamEvents, requestProfile);
    } else {
      if (streamEvents === 1) {
        logger.write('info', 'LLM 流式连接已有进度，正在等待正式回答内容');
      }
      updateStreamMessage(state, placeholder, visible, streamEvents, requestProfile);
    }
    render();
  }, signal);
  throwIfAborted(signal);
  setAssistantStatus(placeholder, logger, render, '🧾 LLM 响应已返回，正在整理推荐结果……', {
    rawLength: raw.length,
    streamed: sawStreamText,
    streamEvents,
  }, requestProfile);

  const parsed = parseLlmJson(raw);
  logger.write(raw ? 'info' : 'warn', 'LLM 原始响应已返回', {
    length: raw.length,
    preview: raw.slice(0, 500),
  });
  logger.write(parsed ? 'info' : 'warn', parsed ? 'LLM JSON 解析成功' : 'LLM JSON 解析失败，将降级显示原文', {
    hasParsed: Boolean(parsed),
  });
  setAssistantStatus(placeholder, logger, render, parsed ? '🧩 JSON 解析成功，正在渲染推荐卡片……' : '📝 JSON 解析失败，正在切换为原文展示……', {
    hasParsed: Boolean(parsed),
  });

  const finalMessage = buildAssistantMessage(raw, parsed, candidates);
  if (state.config.chatDetail === 'chatty' && latestReasoning) {
    finalMessage.reasoning = latestReasoning;
    finalMessage.reasoningOpen = placeholder.reasoningOpen;
  }
  finalMessage.progress = `✅ LLM ${sawStreamText ? '流式' : '非流式'}响应完成 · ${streamEvents} 个片段 · ${requestProfile}`;
  state.messages[state.messages.length - 1] = finalMessage;
  logger.write('info', '推荐结果已渲染到聊天界面', {
    cards: state.messages[state.messages.length - 1]?.cards?.length || 0,
    notes: state.messages[state.messages.length - 1]?.notes?.length || 0,
  });
}

export function handleSearchStopped(state: AppState, logger: Logger): void {
  const last = state.messages[state.messages.length - 1];
  if (last?.role === 'assistant') {
    last.progress = '⏹️ 已停止当前请求。';
    last.content = last.content || '已停止，没有更多输出。';
  } else {
    state.messages.push({
      role: 'assistant',
      content: '⏹️ 已停止当前请求。',
      cards: [],
    });
  }
  state.notice = '⏹️ 已停止当前请求。';
  logger.write('warn', '用户停止当前请求');
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
    thinkingMode: state.config.thinkingMode,
  });
}

function setAssistantStatus(
  message: Message,
  logger: Logger,
  render: () => void,
  content: string,
  detail?: unknown,
  progress?: string,
): void {
  message.progress = progress || '';
  message.reasoning = '';
  message.content = content;
  logger.write('info', content, detail);
  render();
}

function updateStreamMessage(
  state: AppState,
  message: Message,
  snapshot: LlmStreamSnapshot,
  streamEvents: number,
  requestProfile: string,
): void {
  const hasContent = Boolean(snapshot.content);
  const hasReasoning = Boolean(snapshot.reasoning);
  const progress = hasContent
    ? `🧠 LLM 正在生成正式回答 · ${streamEvents} 个片段 · ${requestProfile}`
    : `🧠 LLM thinking · ${streamEvents} 个片段 · ${requestProfile}`;

  if (state.config.chatDetail === 'quiet') {
    message.progress = `🧠 正在生成结果，完成后显示推荐卡片 · ${requestProfile}`;
    message.reasoning = '';
    message.content = '正在等待 LLM 完成推荐结果。';
    return;
  }

  message.progress = progress;
  message.reasoning = state.config.chatDetail === 'chatty' && hasReasoning ? snapshot.reasoning : '';
  message.content = hasContent
    ? snapshot.content
    : hasReasoning && state.config.chatDetail === 'normal'
      ? '正在思考，尚未开始输出正式回答。'
    : '正在等待模型首段正式回答。';
}

function splitVisibleStream(snapshot: LlmStreamSnapshot): LlmStreamSnapshot {
  const content = snapshot.content || '';
  const jsonStart = findJsonStart(content);
  if (jsonStart > 0) {
    return {
      ...snapshot,
      content: content.slice(jsonStart),
      reasoning: joinReasoning(snapshot.reasoning, content.slice(0, jsonStart)),
    };
  }
  if (jsonStart < 0 && !snapshot.reasoning && content.trim()) {
    return { ...snapshot, content: '', reasoning: content };
  }
  return snapshot;
}

function findJsonStart(text: string): number {
  const trimmedStart = text.search(/\S/);
  if (trimmedStart < 0) return -1;
  if (text[trimmedStart] === '{') return trimmedStart;
  const fenced = text.indexOf('```json');
  const fromFence = fenced >= 0 ? text.indexOf('{', fenced) : -1;
  const firstBrace = text.indexOf('{');
  if (fromFence >= 0) return fromFence;
  return firstBrace;
}

function joinReasoning(first: string, second: string): string {
  return [first, second].map((item) => item.trim()).filter(Boolean).join('\n\n');
}

function buildLlmRequestProfile(state: AppState): string {
  const transport = state.config.stream ? 'stream preferred' : 'non-stream';
  return `模型 ${state.config.model} · 思考 ${thinkingModeLabel(state.config.thinkingMode)} · 请求 ${llmRequestFormat(state)} · ${transport}`;
}

function thinkingModeLabel(mode: AppState['config']['thinkingMode']): string {
  if (mode === 'enabled') return '开启';
  if (mode === 'disabled') return '关闭';
  return '自动';
}

function llmRequestFormat(state: AppState): string {
  return state.config.provider === 'anthropic'
    ? 'Anthropic Messages /v1/messages'
    : 'OpenAI Chat Completions /chat/completions';
}

function fillLocalResults(
  message: Message,
  logger: Logger,
  forceLocal: boolean,
  cards: PluginSummary[],
): void {
  const reason = forceLocal ? '🧭 已按你的要求只使用本地增强搜索。' : '🔑 未配置 API key，先显示本地增强搜索结果。';
  logger.write('info', forceLocal ? '跳过 LLM：用户选择本地搜索' : '跳过 LLM：未配置 API key');
  message.content = `${reason}\n这些结果来自 registry 元数据、关键词、分类、下载量、评分和认证状态的综合排序。`;
  message.cards = cards;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
}
