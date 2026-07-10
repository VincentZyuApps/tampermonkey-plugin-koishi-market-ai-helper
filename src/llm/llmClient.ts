import { gmJson, gmText } from '../platform/gmBridge';
import { getApiKey } from '../app/appConfig';
import type { AppState, LlmJsonResult, PluginSummary } from '../types/appTypes';
import type { Logger } from '../log/appLogger';

export async function callLlm(
  state: AppState,
  logger: Logger,
  query: string,
  candidates: PluginSummary[],
  onStreamText?: (text: string) => void,
): Promise<string> {
  const prompt = buildPrompt(query, candidates);
  if (state.config.provider === 'anthropic') {
    return callAnthropic(state, logger, prompt);
  }
  return callOpenAiCompatible(state, logger, prompt, onStreamText);
}

export function parseLlmJson(raw: string): LlmJsonResult | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as LlmJsonResult;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as LlmJsonResult;
    } catch {
      return null;
    }
  }
}

function buildPrompt(query: string, candidates: PluginSummary[]): string {
  const slimCandidates = candidates.map((item) => ({
    name: item.name,
    shortname: item.shortname,
    version: item.version,
    category: item.category,
    verified: item.verified,
    downloadsLastMonth: item.downloadsLastMonth,
    rating: item.rating,
    updatedAt: item.updatedAt,
    description: item.description,
    keywords: item.keywords,
    npm: item.npm,
    homepage: item.homepage,
    repository: item.repository,
  }));

  return [
    '你是 Koishi 插件市场搜索助手。',
    '请根据用户需求，从候选插件中推荐最合适的插件。',
    '只允许推荐候选列表中存在的 package name，不要编造插件。',
    '请优先返回严格 JSON，不要使用 Markdown 代码块。',
    'JSON 结构如下：',
    '{"answer":"简短中文总结","primary":[{"name":"package name","reason":"推荐理由","warning":"注意事项，可为空","query":"建议市场查询词"}],"alternatives":[{"name":"package name","reason":"备选理由","warning":"注意事项，可为空","query":"建议市场查询词"}],"notRecommended":[{"name":"package name","reason":"不优先推荐原因"}],"notes":["安装或选择注意事项"],"searchSyntax":"推荐的 Koishi 市场查询语法"}',
    '',
    `用户需求：${query}`,
    '',
    '候选插件 JSON：',
    JSON.stringify(slimCandidates, null, 2),
  ].join('\n');
}

async function callOpenAiCompatible(
  state: AppState,
  logger: Logger,
  prompt: string,
  onStreamText?: (text: string) => void,
): Promise<string> {
  const endpoint = appendEndpoint(state.config.baseUrl, '/chat/completions');
  const payloadBase = {
    model: state.config.model,
    temperature: state.config.temperature,
    max_tokens: state.config.maxTokens,
    messages: [
      { role: 'system', content: '你是严谨的 Koishi 插件搜索助手，必须优先输出可解析 JSON。' },
      { role: 'user', content: prompt },
    ],
  };

  logger.write('info', 'OpenAI-compatible 请求已准备', {
    endpoint,
    model: payloadBase.model,
    preferStream: Boolean(state.config.stream),
    promptLength: prompt.length,
  });

  const headers = {
    Authorization: `Bearer ${getApiKey(state.config, state.sessionApiKey)}`,
    'Content-Type': 'application/json',
  };

  if (state.config.stream) {
    try {
      const streamed = await requestOpenAiStream(endpoint, headers, payloadBase, logger, onStreamText);
      if (streamed) return streamed;
      logger.write('warn', 'OpenAI-compatible 流式响应为空，改用非流式重试');
      onStreamText?.('流式响应为空，正在改用非流式请求……');
    } catch (error) {
      logger.write('warn', 'OpenAI-compatible 流式请求失败，改用非流式重试', {
        message: error instanceof Error ? error.message : String(error),
      });
      onStreamText?.('流式请求失败，正在改用非流式请求……');
    }
  }

  return requestOpenAiNonStream(endpoint, headers, payloadBase, logger);
}

async function requestOpenAiStream(
  endpoint: string,
  headers: Record<string, string>,
  payloadBase: Record<string, unknown>,
  logger: Logger,
  onStreamText?: (text: string) => void,
): Promise<string> {
  let acc = '';
  const rawText = await gmText(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify({ ...payloadBase, stream: true }),
    onProgressText(text) {
      acc = parseOpenAiStreamText(text);
      onStreamText?.(acc);
    },
  }, (level, message, detail) => logger.write(level, message, detail));
  if (!acc) acc = parseOpenAiResponseText(rawText);
  logger.write(acc ? 'info' : 'warn', 'OpenAI-compatible 流式响应结束', {
    contentLength: acc.length,
    preview: acc.slice(0, 500),
    rawLength: rawText.length,
    rawPreview: rawText.slice(0, 1000),
  });
  return acc;
}

async function requestOpenAiNonStream(
  endpoint: string,
  headers: Record<string, string>,
  payloadBase: Record<string, unknown>,
  logger: Logger,
): Promise<string> {
  const data = await gmJson<unknown>(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify({ ...payloadBase, stream: false }),
  }, (level, message, detail) => logger.write(level, message, detail));
  const content = extractResponseText(data);
  logger.write(content ? 'info' : 'warn', 'OpenAI-compatible 响应已解析', responseDebug(data, content));
  return content;
}

async function callAnthropic(state: AppState, logger: Logger, prompt: string): Promise<string> {
  const endpoint = appendEndpoint(state.config.baseUrl || 'https://api.anthropic.com', '/v1/messages');
  const headers: Record<string, string> = {
    'x-api-key': getApiKey(state.config, state.sessionApiKey),
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  if (!/^https:\/\/api\.anthropic\.com\/?/.test(state.config.baseUrl || '')) {
    headers.Authorization = `Bearer ${getApiKey(state.config, state.sessionApiKey)}`;
  }

  const payload = {
    model: state.config.model,
    max_tokens: state.config.maxTokens,
    temperature: state.config.temperature,
    system: '你是严谨的 Koishi 插件搜索助手，必须优先输出可解析 JSON。',
    messages: [{ role: 'user', content: prompt }],
  };
  logger.write('info', 'Anthropic 请求已准备', {
    endpoint,
    model: payload.model,
    promptLength: prompt.length,
    maxTokens: payload.max_tokens,
  });

  const data = await gmJson<unknown>(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify(payload),
  }, (level, message, detail) => logger.write(level, message, detail));
  const content = extractResponseText(data);
  logger.write(content ? 'info' : 'warn', 'Anthropic 响应已解析', responseDebug(data, content));
  return content;
}

function parseOpenAiStreamText(text: string): string {
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    const raw = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!raw || raw === '[DONE]') return '';
    try {
      return extractResponseText(JSON.parse(raw));
    } catch {
      return '';
    }
  }).join('');
}

function parseOpenAiResponseText(text: string): string {
  const value = String(text || '').trim();
  if (!value) return '';
  try {
    return extractResponseText(JSON.parse(value));
  } catch {
    return parseOpenAiStreamText(value);
  }
}

function extractResponseText(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  const record = data as Record<string, any>;
  const parts: string[] = [];

  for (const choice of record.choices || []) {
    pushText(parts, choice.text);
    pushText(parts, choice.delta?.content);
    pushText(parts, choice.delta?.reasoning_content);
    pushText(parts, choice.message?.content);
    pushText(parts, choice.message?.reasoning_content);
  }
  for (const block of record.content || []) {
    pushText(parts, block.text);
    pushText(parts, block.content);
    pushText(parts, block.delta?.text);
    pushText(parts, block.content_block?.text);
  }
  pushText(parts, record.delta?.text);
  pushText(parts, record.content_block?.text);
  for (const item of record.output || []) {
    for (const content of item.content || []) {
      pushText(parts, content.text);
      pushText(parts, content.content);
    }
  }
  return parts.join('');
}

function pushText(parts: string[], value: unknown): void {
  if (!value) return;
  if (typeof value === 'string') {
    parts.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') parts.push(item);
      else pushText(parts, (item as { text?: unknown; content?: unknown })?.text || (item as { content?: unknown })?.content);
    }
  }
}

function responseDebug(data: unknown, content: string): Record<string, unknown> {
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  return {
    responseKeys: Object.keys(record),
    choices: Array.isArray(record.choices) ? record.choices.length : 0,
    contentLength: content.length,
    rawPreview: JSON.stringify(data || {}).slice(0, 1000),
  };
}

function appendEndpoint(baseUrl: string, endpoint: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  return base.endsWith(endpoint) ? base : base + endpoint;
}
