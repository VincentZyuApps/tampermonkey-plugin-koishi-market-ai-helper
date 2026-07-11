import { gmJson, isAbortError } from '../platform/gmBridge';
import type { Provider } from '../types/appTypes';

export interface ModelCatalogRequest {
  provider: Provider;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface ModelCatalogItem {
  id: string;
  ownedBy?: string;
}

export interface ModelCatalogResult {
  models: ModelCatalogItem[];
  endpoint: string;
  attemptedUrls: string[];
}

export type ModelCatalogErrorCode =
  | 'missing_base_url'
  | 'missing_api_key'
  | 'invalid_base_url'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'invalid_response'
  | 'empty_catalog'
  | 'timeout'
  | 'network'
  | 'http_error';

interface ModelCatalogErrorDetails {
  status?: number;
  endpoint?: string;
  attemptedUrls?: string[];
  originalError?: unknown;
}

export class ModelCatalogError extends Error {
  readonly code: ModelCatalogErrorCode;
  readonly status?: number;
  readonly endpoint?: string;
  readonly attemptedUrls: string[];
  readonly originalError?: unknown;

  constructor(code: ModelCatalogErrorCode, message: string, details: ModelCatalogErrorDetails = {}) {
    super(message);
    this.name = 'ModelCatalogError';
    this.code = code;
    this.status = details.status;
    this.endpoint = details.endpoint;
    this.attemptedUrls = details.attemptedUrls || [];
    this.originalError = details.originalError;
  }
}

interface ModelCatalogPayload {
  data?: unknown;
  has_more?: unknown;
  last_id?: unknown;
}

interface RawModelCatalogItem {
  id?: unknown;
  owned_by?: unknown;
}

const MAX_ANTHROPIC_MODEL_PAGES = 20;
const ANTHROPIC_MODEL_PAGE_LIMIT = 1000;

export async function fetchModelCatalog(request: ModelCatalogRequest): Promise<ModelCatalogResult> {
  const baseUrl = request.baseUrl.trim();
  const apiKey = request.apiKey.trim();
  if (!baseUrl) {
    throw new ModelCatalogError('missing_base_url', '请先填写 Base URL');
  }
  if (!apiKey) {
    throw new ModelCatalogError('missing_api_key', '请先填写 API Key');
  }

  const candidates = buildModelCatalogUrls(request.provider, baseUrl);
  const attemptedUrls: string[] = [];
  let lastFallbackStatus: number | undefined;
  let lastFallbackError: ModelCatalogError | undefined;

  for (const endpoint of candidates) {
    const rawModels: unknown[] = [];
    const seenCursors = new Set<string>();
    const maxPages = request.provider === 'anthropic' ? MAX_ANTHROPIC_MODEL_PAGES : 1;
    let afterId = '';
    let shouldTryNextCandidate = false;

    for (let page = 0; page < maxPages; page += 1) {
      throwIfAborted(request.signal);
      const pageUrl = request.provider === 'anthropic'
        ? buildAnthropicModelPageUrl(endpoint, afterId)
        : endpoint;
      attemptedUrls.push(pageUrl);

      let payload: ModelCatalogPayload;
      try {
        payload = await gmJson<ModelCatalogPayload>(pageUrl, {
          method: 'GET',
          headers: buildHeaders(request.provider, apiKey, baseUrl),
          timeoutMs: 15_000,
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal?.aborted || isAbortError(error)) throw error;
        const status = extractHttpStatus(error);
        if (status === 404 || status === 405) {
          lastFallbackStatus = status;
          shouldTryNextCandidate = true;
          break;
        }
        const classified = classifyRequestError(error, pageUrl, attemptedUrls, status);
        if (classified.code === 'invalid_response') {
          lastFallbackError = classified;
          shouldTryNextCandidate = true;
          break;
        }
        throw classified;
      }

      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
        lastFallbackError = new ModelCatalogError('invalid_response', '模型列表响应缺少 data 数组', {
          endpoint: pageUrl,
          attemptedUrls: [...attemptedUrls],
        });
        shouldTryNextCandidate = true;
        break;
      }

      const pageModels = normalizeModels(payload.data);
      if (!pageModels.length) {
        lastFallbackError = new ModelCatalogError('empty_catalog', '服务返回了空模型列表', {
          endpoint: pageUrl,
          attemptedUrls: [...attemptedUrls],
        });
        shouldTryNextCandidate = true;
        break;
      }
      rawModels.push(...payload.data);

      if (request.provider !== 'anthropic' || payload.has_more !== true) {
        return {
          models: normalizeModels(rawModels),
          endpoint,
          attemptedUrls: [...attemptedUrls],
        };
      }

      if (page === maxPages - 1) {
        return {
          models: normalizeModels(rawModels),
          endpoint,
          attemptedUrls: [...attemptedUrls],
        };
      }

      const lastId = typeof payload.last_id === 'string' ? payload.last_id.trim() : '';
      if (!lastId || seenCursors.has(lastId)) {
        lastFallbackError = new ModelCatalogError('invalid_response', 'Anthropic 模型列表分页缺少有效的 last_id', {
          endpoint: pageUrl,
          attemptedUrls: [...attemptedUrls],
        });
        shouldTryNextCandidate = true;
        break;
      }
      seenCursors.add(lastId);
      afterId = lastId;
    }

    if (shouldTryNextCandidate) continue;
  }

  if (lastFallbackError) {
    throw new ModelCatalogError(lastFallbackError.code, lastFallbackError.message, {
      status: lastFallbackError.status,
      endpoint: lastFallbackError.endpoint,
      attemptedUrls,
      originalError: lastFallbackError.originalError,
    });
  }

  throw new ModelCatalogError('not_found', '未找到可用的模型列表接口', {
    status: lastFallbackStatus,
    endpoint: attemptedUrls.at(-1),
    attemptedUrls,
  });
}

export function buildModelCatalogUrls(provider: Provider, baseUrl: string): string[] {
  const base = parseBaseUrl(baseUrl);
  const path = base.pathname.replace(/\/+$/, '');
  const withoutOperation = path.replace(/\/(?:chat\/completions|completions|messages)$/i, '');
  const withoutModels = withoutOperation.replace(/\/models$/i, '');
  const rootPath = withoutModels.replace(/\/+$/, '');
  const hasV1Suffix = /\/v1$/i.test(rootPath);
  const unversionedPath = hasV1Suffix ? rootPath.slice(0, -3) : rootPath;

  const paths = hasV1Suffix
    ? [`${rootPath}/models`, `${unversionedPath}/models`]
    : provider === 'anthropic'
      ? [`${rootPath}/v1/models`, `${rootPath}/models`]
      : [`${rootPath}/models`, `${rootPath}/v1/models`];

  if (/\/models$/i.test(withoutOperation)) {
    paths.unshift(withoutOperation);
  }

  return unique(paths.map((candidatePath) => {
    const url = new URL(base.href);
    url.pathname = normalizePath(candidatePath);
    url.search = '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  }));
}

export function isModelCatalogError(error: unknown): error is ModelCatalogError {
  return error instanceof ModelCatalogError;
}

function parseBaseUrl(baseUrl: string): URL {
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return url;
  } catch (error) {
    throw new ModelCatalogError('invalid_base_url', 'Base URL 必须是有效的 HTTP(S) 地址', {
      originalError: error,
    });
  }
}

function buildHeaders(provider: Provider, apiKey: string, baseUrl: string): Record<string, string> {
  if (provider === 'anthropic') {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    if (!isOfficialAnthropicUrl(baseUrl)) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }

  return {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function isOfficialAnthropicUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.anthropic.com';
  } catch {
    return false;
  }
}

function buildAnthropicModelPageUrl(endpoint: string, afterId: string): string {
  const url = new URL(endpoint);
  url.searchParams.set('limit', String(ANTHROPIC_MODEL_PAGE_LIMIT));
  if (afterId) url.searchParams.set('after_id', afterId);
  else url.searchParams.delete('after_id');
  return url.href;
}

function normalizeModels(data: unknown[]): ModelCatalogItem[] {
  const byId = new Map<string, ModelCatalogItem>();
  for (const value of data) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as RawModelCatalogItem;
    if (typeof raw.id !== 'string') continue;
    const id = raw.id.trim();
    if (!id) continue;
    const ownedBy = typeof raw.owned_by === 'string' ? raw.owned_by.trim() : '';
    const existing = byId.get(id);
    if (!existing || (!existing.ownedBy && ownedBy)) {
      byId.set(id, { id, ...(ownedBy ? { ownedBy } : {}) });
    }
  }

  return [...byId.values()].sort((left, right) => (
    left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: 'base' })
    || left.id.localeCompare(right.id)
  ));
}

function classifyRequestError(
  error: unknown,
  endpoint: string,
  attemptedUrls: string[],
  status?: number,
): ModelCatalogError {
  const details: ModelCatalogErrorDetails = {
    status,
    endpoint,
    attemptedUrls: [...attemptedUrls],
    originalError: error,
  };
  if (status === 401) return new ModelCatalogError('unauthorized', 'API Key 无效或未获授权', details);
  if (status === 403) return new ModelCatalogError('forbidden', '当前 API Key 无权读取模型列表', details);
  if (status === 429) return new ModelCatalogError('rate_limited', '模型列表请求过于频繁，请稍后重试', details);
  if (status !== undefined) {
    return new ModelCatalogError('http_error', `模型列表接口返回 HTTP ${status}`, details);
  }

  if (error instanceof SyntaxError) {
    return new ModelCatalogError('invalid_response', '模型列表接口返回的内容不是有效 JSON', details);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/超时|timeout/i.test(message)) {
    return new ModelCatalogError('timeout', '获取模型列表超时', details);
  }
  return new ModelCatalogError('network', '无法连接模型列表接口', details);
}

function extractHttpStatus(error: unknown): number | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const match = /\bHTTP\s+(\d{3})\b/i.exec(message);
  return match ? Number(match[1]) : undefined;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\/{2,}/g, '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
