import { fetchTextStream, gmJson, gmText, gmTextReadableStream, isAbortError } from '../platform/gmBridge';
import { getApiKey } from '../app/appConfig';
import type { AppState, Config, LlmJsonResult, LlmStreamSnapshot, PluginSummary, ThinkingMode } from '../types/appTypes';
import type { Logger } from '../log/appLogger';
import type { RequestOptions } from '../platform/gmBridge';

export async function callLlm(
  state: AppState,
  logger: Logger,
  query: string,
  candidates: PluginSummary[],
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
): Promise<string> {
  const prompt = buildPrompt(query, candidates, state.config.thinkingMode);
  if (state.config.provider === 'anthropic') {
    return callAnthropic(state, logger, prompt, onStreamText, signal);
  }
  return callOpenAiCompatible(state, logger, prompt, onStreamText, signal);
}

export function parseLlmJson(raw: string): LlmJsonResult | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as LlmJsonResult;
  } catch {
    for (const candidate of findJsonObjects(cleaned)) {
      try {
        const parsed = JSON.parse(candidate) as LlmJsonResult;
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        // Keep scanning for the next balanced JSON object.
      }
    }
    return null;
  }
}

function findJsonObjects(text: string): string[] {
  const results: string[] = [];
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = inString;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) {
        results.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return results;
}

function buildPrompt(query: string, candidates: PluginSummary[], thinkingMode: ThinkingMode): string {
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
    thinkingPromptInstruction(thinkingMode),
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

function thinkingPromptInstruction(mode: ThinkingMode): string {
  if (mode === 'enabled') {
    return '正式回答只输出 JSON；如果模型支持独立 reasoning/thinking 通道，请优先启用，但不要把推理写进 JSON 正文。';
  }
  if (mode === 'disabled') {
    return '正式回答只输出 JSON；请直接生成正式答案，不要在 JSON 正文中输出推理或思考过程。';
  }
  return '正式回答只输出 JSON；如果模型有独立 reasoning/thinking 通道，可以正常使用，但不要把推理写进 JSON 正文。';
}

function systemInstruction(mode: ThinkingMode): string {
  if (mode === 'enabled') {
    return '你是严谨的 Koishi 插件搜索助手，请在接口支持时使用独立思考通道，正式回答只输出可解析 JSON。';
  }
  if (mode === 'disabled') {
    return '你是严谨的 Koishi 插件搜索助手，请直接回答，不输出可见思考过程，正式回答只输出可解析 JSON。';
  }
  return '你是严谨的 Koishi 插件搜索助手，正式回答只输出可解析 JSON；独立 reasoning/thinking 通道可以保留。';
}

async function callOpenAiCompatible(
  state: AppState,
  logger: Logger,
  prompt: string,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = appendEndpoint(state.config.baseUrl, '/chat/completions');
  const payloadBase: Record<string, unknown> = {
    model: state.config.model,
    temperature: state.config.temperature,
    max_tokens: state.config.maxTokens,
    messages: [
      { role: 'system', content: systemInstruction(state.config.thinkingMode) },
      { role: 'user', content: prompt },
    ],
  };
  const thinkingFields = openAiThinkingFields(state.config);
  const payloadWithThinking = { ...payloadBase, ...thinkingFields };
  const thinkingApplied = Object.keys(thinkingFields).length > 0;

  logger.write('info', 'OpenAI-compatible 请求已准备', {
    endpoint,
    model: state.config.model,
    preferStream: Boolean(state.config.stream),
    thinkingMode: state.config.thinkingMode,
    thinkingParameterApplied: thinkingApplied,
    promptLength: prompt.length,
  });
  if (state.config.thinkingMode !== 'auto' && !thinkingApplied) {
    logger.write('warn', '当前 OpenAI-compatible 地址没有可安全识别的思考参数，仅应用提示偏好', {
      baseUrl: state.config.baseUrl,
      model: state.config.model,
      thinkingMode: state.config.thinkingMode,
    });
  }

  const headers = {
    Authorization: `Bearer ${getApiKey(state.config, state.sessionApiKey)}`,
    'Content-Type': 'application/json',
  };

  try {
    return await requestOpenAiByTransport(
      state,
      endpoint,
      headers,
      payloadWithThinking,
      logger,
      onStreamText,
      signal,
      thinkingApplied,
    );
  } catch (error) {
    if (!thinkingApplied || !isThinkingParameterCompatibilityError(error)) throw error;
    logger.write('warn', '思考参数不受当前 OpenAI-compatible 接口支持，本次移除显式参数并保留提示偏好重试', {
      endpoint,
      message: error instanceof Error ? error.message : String(error),
    });
    return requestOpenAiByTransport(state, endpoint, headers, payloadBase, logger, onStreamText, signal, false);
  }
}

async function requestOpenAiByTransport(
  state: AppState,
  endpoint: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  logger: Logger,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
  thinkingApplied = false,
): Promise<string> {
  if (state.config.stream) {
    try {
      const streamed = await requestOpenAiStream(endpoint, headers, payload, logger, onStreamText, signal);
      if (streamed) return streamed;
      logger.write('warn', 'OpenAI-compatible 流式响应为空，改用非流式重试');
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      if (thinkingApplied && isThinkingParameterCompatibilityError(error)) throw error;
      if (isHttpResponseError(error) && !isStreamingCompatibilityError(error)) throw error;
      logger.write('warn', 'OpenAI-compatible 流式请求失败，改用非流式重试', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return requestOpenAiNonStream(endpoint, headers, payload, logger, signal);
}

async function requestOpenAiStream(
  endpoint: string,
  headers: Record<string, string>,
  payloadBase: Record<string, unknown>,
  logger: Logger,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
): Promise<string> {
  let acc = '';
  let reasoning = '';
  let events = 0;
  let sawFirstChunk = false;
  logger.write('info', 'OpenAI-compatible 流式请求已发送，等待模型首段输出', {
    endpoint,
  });
  const rawText = await requestTextStream(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify({ ...payloadBase, stream: true }),
    signal,
    onProgressText(text) {
      const snapshot = parseOpenAiStreamSnapshot(text);
      acc = snapshot.content;
      reasoning = snapshot.reasoning;
      events = snapshot.events;
      if (acc && !sawFirstChunk) {
        sawFirstChunk = true;
        logger.write('info', 'OpenAI-compatible 收到流式首段', {
          contentLength: acc.length,
          reasoningLength: reasoning.length,
          preview: acc.slice(0, 200),
        });
      }
      onStreamText?.({ content: acc, reasoning, events });
    },
  }, logger, 'OpenAI-compatible');
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
  signal?: AbortSignal,
): Promise<string> {
  logger.write('info', 'OpenAI-compatible 非流式请求已发送，等待完整响应', {
    endpoint,
  });
  const data = await gmJson<unknown>(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify({ ...payloadBase, stream: false }),
    signal,
  }, (level, message, detail) => logger.write(level, message, detail));
  const content = extractResponseText(data);
  logger.write(content ? 'info' : 'warn', 'OpenAI-compatible 响应已解析', responseDebug(data, content));
  return content;
}

async function callAnthropic(
  state: AppState,
  logger: Logger,
  prompt: string,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (state.config.thinkingMode === 'enabled' && state.config.maxTokens < 2048) {
    throw new Error('Anthropic 开启思考时，最大输出 token 至少需要 2048，建议使用 2400 或更高。');
  }
  const endpoint = appendEndpoint(state.config.baseUrl || 'https://api.anthropic.com', '/v1/messages');
  const headers: Record<string, string> = {
    'x-api-key': getApiKey(state.config, state.sessionApiKey),
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  if (!/^https:\/\/api\.anthropic\.com\/?/.test(state.config.baseUrl || '')) {
    headers.Authorization = `Bearer ${getApiKey(state.config, state.sessionApiKey)}`;
  }

  const payloadBase: Record<string, unknown> = {
    model: state.config.model,
    max_tokens: state.config.maxTokens,
    temperature: state.config.temperature,
    system: systemInstruction(state.config.thinkingMode),
    messages: [{ role: 'user', content: prompt }],
  };
  const thinkingFields = anthropicThinkingFields(state.config.thinkingMode);
  const payloadWithThinking = { ...payloadBase, ...thinkingFields };
  const thinkingApplied = Object.keys(thinkingFields).length > 0;
  if (state.config.thinkingMode === 'enabled') delete payloadWithThinking.temperature;
  logger.write('info', 'Anthropic 请求已准备', {
    endpoint,
    model: state.config.model,
    preferStream: Boolean(state.config.stream),
    thinkingMode: state.config.thinkingMode,
    thinkingParameterApplied: thinkingApplied,
    promptLength: prompt.length,
    maxTokens: state.config.maxTokens,
  });

  try {
    return await requestAnthropicByTransport(
      state,
      endpoint,
      headers,
      payloadWithThinking,
      logger,
      onStreamText,
      signal,
      thinkingApplied,
    );
  } catch (error) {
    if (!thinkingApplied || !isThinkingParameterCompatibilityError(error)) throw error;
    logger.write('warn', '思考参数不受当前 Anthropic 接口支持，本次移除显式参数并保留提示偏好重试', {
      endpoint,
      message: error instanceof Error ? error.message : String(error),
    });
    return requestAnthropicByTransport(state, endpoint, headers, payloadBase, logger, onStreamText, signal, false);
  }
}

async function requestAnthropicByTransport(
  state: AppState,
  endpoint: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  logger: Logger,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
  thinkingApplied = false,
): Promise<string> {
  if (state.config.stream) {
    try {
      const streamed = await requestAnthropicStream(endpoint, headers, payload, logger, onStreamText, signal);
      if (streamed) return streamed;
      logger.write('warn', 'Anthropic 流式响应为空，改用非流式重试');
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw error;
      if (thinkingApplied && isThinkingParameterCompatibilityError(error)) throw error;
      if (isHttpResponseError(error) && !isStreamingCompatibilityError(error)) throw error;
      logger.write('warn', 'Anthropic 流式请求失败，改用非流式重试', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return requestAnthropicNonStream(endpoint, headers, payload, logger, signal);
}

async function requestAnthropicStream(
  endpoint: string,
  headers: Record<string, string>,
  payloadBase: Record<string, unknown>,
  logger: Logger,
  onStreamText?: (snapshot: LlmStreamSnapshot) => void,
  signal?: AbortSignal,
): Promise<string> {
  let acc = '';
  let reasoning = '';
  let events = 0;
  let sawFirstChunk = false;
  logger.write('info', 'Anthropic 流式请求已发送，等待模型首段输出', {
    endpoint,
  });
  const rawText = await requestTextStream(endpoint, {
    method: 'POST',
    headers: { ...headers, Accept: 'text/event-stream' },
    data: JSON.stringify({ ...payloadBase, stream: true }),
    signal,
    onProgressText(text) {
      const snapshot = parseAnthropicStreamSnapshot(text);
      acc = snapshot.content;
      reasoning = snapshot.reasoning;
      events = snapshot.events;
      if (acc && !sawFirstChunk) {
        sawFirstChunk = true;
        logger.write('info', 'Anthropic 收到流式首段', {
          contentLength: acc.length,
          reasoningLength: reasoning.length,
          preview: acc.slice(0, 200),
        });
      }
      onStreamText?.({ content: acc, reasoning, events });
    },
  }, logger, 'Anthropic');
  if (!acc) acc = parseAnthropicResponseText(rawText);
  logger.write(acc ? 'info' : 'warn', 'Anthropic 流式响应结束', {
    contentLength: acc.length,
    preview: acc.slice(0, 500),
    rawLength: rawText.length,
    rawPreview: rawText.slice(0, 1000),
  });
  return acc;
}

async function requestAnthropicNonStream(
  endpoint: string,
  headers: Record<string, string>,
  payloadBase: Record<string, unknown>,
  logger: Logger,
  signal?: AbortSignal,
): Promise<string> {
  logger.write('info', 'Anthropic 非流式请求已发送，等待完整响应', {
    endpoint,
  });
  const data = await gmJson<unknown>(endpoint, {
    method: 'POST',
    headers,
    data: JSON.stringify({ ...payloadBase, stream: false }),
    signal,
  }, (level, message, detail) => logger.write(level, message, detail));
  const content = extractResponseText(data);
  logger.write(content ? 'info' : 'warn', 'Anthropic 响应已解析', responseDebug(data, content));
  return content;
}

function parseOpenAiStreamText(text: string): string {
  return parseOpenAiStreamSnapshot(text).content;
}

function parseOpenAiStreamSnapshot(text: string): LlmStreamSnapshot {
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];
  let events = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const raw = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!raw || raw === '[DONE]') continue;
    try {
      const event = JSON.parse(raw);
      events += 1;
      pushText(contentParts, extractResponseText(event));
      pushText(reasoningParts, extractReasoningText(event));
    } catch {
      // Ignore partial SSE frames while the request is still streaming.
    }
  }
  return { content: contentParts.join(''), reasoning: reasoningParts.join(''), events };
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

function parseAnthropicStreamText(text: string): string {
  return parseAnthropicStreamSnapshot(text).content;
}

function parseAnthropicStreamSnapshot(text: string): LlmStreamSnapshot {
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];
  let events = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const event = JSON.parse(raw);
      events += 1;
      pushText(contentParts, extractResponseText(event));
      pushText(reasoningParts, extractReasoningText(event));
    } catch {
      // Ignore partial SSE frames while the request is still streaming.
    }
  }
  return { content: contentParts.join(''), reasoning: reasoningParts.join(''), events };
}

function parseAnthropicResponseText(text: string): string {
  const value = String(text || '').trim();
  if (!value) return '';
  try {
    return extractResponseText(JSON.parse(value));
  } catch {
    return parseAnthropicStreamText(value);
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
    pushText(parts, choice.message?.content);
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

function extractReasoningText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, any>;
  const parts: string[] = [];

  for (const choice of record.choices || []) {
    pushText(parts, choice.delta?.reasoning_content);
    pushText(parts, choice.delta?.reasoning);
    pushText(parts, choice.message?.reasoning_content);
    pushText(parts, choice.message?.reasoning);
  }
  pushText(parts, record.delta?.thinking);
  pushText(parts, record.delta?.reasoning_content);
  pushText(parts, record.content_block?.thinking);
  for (const block of record.content || []) {
    pushText(parts, block.thinking);
    pushText(parts, block.delta?.thinking);
    pushText(parts, block.delta?.reasoning_content);
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

function openAiThinkingFields(config: Config): Record<string, unknown> {
  if (config.thinkingMode === 'auto' || !isOfficialDeepSeekUrl(config.baseUrl)) return {};
  return {
    thinking: {
      type: config.thinkingMode,
    },
  };
}

function anthropicThinkingFields(mode: ThinkingMode): Record<string, unknown> {
  if (mode === 'auto') return {};
  if (mode === 'disabled') return { thinking: { type: 'disabled' } };
  return { thinking: { type: 'enabled', budget_tokens: 1024 } };
}

function isOfficialDeepSeekUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com';
  } catch {
    return false;
  }
}

function isThinkingParameterCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\bHTTP\s+(?:400|422)\b/i.test(message)) return false;
  const field = '(?:thinking|enable_thinking|reasoning_effort)';
  const incompatibility = '(?:unknown|unsupported|unrecognized|not\\s+supported|not\\s+allowed|not\\s+permitted|extra\\s+(?:field|input)|input\\s+should\\s+be|invalid\\s+(?:field|parameter))';
  return new RegExp(
    `(?:${field}[\\s\\S]{0,160}${incompatibility}|${incompatibility}[\\s\\S]{0,160}${field})`,
    'i',
  ).test(message);
}

function isStreamingCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!/\bHTTP\s+(?:400|404|405|415|422)\b/i.test(message)) return false;
  const mentionsStream = /\bstream(?:ing)?\b/i.test(message);
  const mentionsCompatibility = /unknown|unsupported|unrecognized|not\s+supported|not\s+allowed|not\s+permitted|invalid\s+(?:field|parameter|value)|extra\s+(?:field|input)/i.test(message);
  return mentionsStream && mentionsCompatibility;
}

function isHttpResponseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const match = /\bHTTP\s+(\d{3})\b/i.exec(message);
  return Boolean(match && Number(match[1]) >= 400);
}

async function requestTextStream(
  endpoint: string,
  options: RequestOptions,
  logger: Logger,
  label: string,
): Promise<string> {
  try {
    return await gmTextReadableStream(endpoint, options, (level, message, detail) => logger.write(level, message, detail));
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    if (isHttpResponseError(error)) throw error;
    logger.write('warn', `${label} GM stream 不可用，改用 Fetch stream`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return await fetchTextStream(endpoint, options, (level, message, detail) => logger.write(level, message, detail));
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) throw error;
    if (isHttpResponseError(error)) throw error;
    logger.write('warn', `${label} Fetch stream 不可用，改用 GM 文本进度请求`, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return gmText(endpoint, options, (level, message, detail) => logger.write(level, message, detail));
}

function appendEndpoint(baseUrl: string, endpoint: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (base.endsWith('/v1') && endpoint.startsWith('/v1/')) return base + endpoint.slice(3);
  return base.endsWith(endpoint) ? base : base + endpoint;
}
