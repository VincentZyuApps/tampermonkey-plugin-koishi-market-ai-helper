declare const GM_getValue: (<T>(key: string, fallback: T) => T) | undefined;
declare const GM_setValue: ((key: string, value: unknown) => void) | undefined;
declare const GM_deleteValue: ((key: string) => void) | undefined;
declare const GM_setClipboard: ((text: string, type?: string) => void) | undefined;
declare const GM_registerMenuCommand:
  | ((name: string, callback: () => void) => void)
  | undefined;
declare const GM_xmlhttpRequest:
  | ((details: {
      method?: string;
      url: string;
      headers?: Record<string, string>;
      data?: string;
      timeout?: number;
      responseType?: 'text' | 'stream';
      onloadstart?: (response: { status?: number; response?: unknown }) => void;
      onprogress?: (response: { responseText?: string }) => void;
      onload?: (response: { status: number; responseText?: string }) => void;
      onerror?: (error?: unknown) => void;
      ontimeout?: () => void;
    }) => { abort?: () => void } | void)
  | undefined;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  data?: string;
  timeoutMs?: number;
  onProgressText?: (text: string) => void;
  signal?: AbortSignal;
}

export type RequestLogger = (
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace',
  message: string,
  detail?: unknown,
) => void;

export function gmGet<T>(key: string, fallback: T): T {
  try {
    return typeof GM_getValue === 'function' ? GM_getValue(key, fallback) : fallback;
  } catch {
    return fallback;
  }
}

export function gmSet(key: string, value: unknown): void {
  try {
    if (typeof GM_setValue === 'function') GM_setValue(key, value);
  } catch {
    // Ignore storage failures.
  }
}

export function gmDelete(key: string): void {
  try {
    if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
  } catch {
    // Ignore storage failures.
  }
}

export function gmClipboard(text: string): void {
  if (typeof GM_setClipboard === 'function') {
    GM_setClipboard(text, 'text');
  } else {
    void navigator.clipboard?.writeText(text);
  }
}

export function gmRegisterMenu(name: string, callback: () => void): void {
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(name, callback);
  }
}

export function gmJson<T>(url: string, options: RequestOptions = {}, logger?: RequestLogger): Promise<T> {
  return gmText(url, options, logger).then((text) => JSON.parse(text) as T);
}

export function gmTextReadableStream(
  url: string,
  options: RequestOptions = {},
  logger?: RequestLogger,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      reject(new Error('GM_xmlhttpRequest 不可用'));
      return;
    }

    const method = options.method || 'GET';
    let started = false;
    let settled = false;
    let text = '';
    let responseStatus = 0;
    let loadFinished = false;
    let streamFinished = false;
    let streamError: unknown;

    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    logger?.('info', 'GM stream 请求开始', { method, url });
    const settleStream = () => {
      if (settled || !streamFinished || (!loadFinished && responseStatus <= 0)) return;
      settled = true;
      if (responseStatus >= 400) {
        logger?.('error', 'GM stream 请求返回错误状态', {
          method,
          url,
          status: responseStatus,
          body: text.slice(0, 1000),
        });
        reject(new Error(`HTTP ${responseStatus}: ${text.slice(0, 500)}`));
        return;
      }
      if (streamError) {
        logger?.('warn', 'GM stream 读取失败', {
          method,
          url,
          message: streamError instanceof Error ? streamError.message : String(streamError),
        });
        reject(streamError);
        return;
      }
      logger?.('info', 'GM stream 请求完成', { method, url, responseLength: text.length });
      resolve(text);
    };
    const request = GM_xmlhttpRequest({
      method,
      url,
      headers: options.headers || {},
      data: options.data,
      timeout: options.timeoutMs,
      responseType: 'stream',
      onloadstart(response) {
        started = true;
        responseStatus = Number(response.status) || responseStatus;
        void readUnknownStream(response.response, {
          method,
          url,
          signal: options.signal,
          onChunk(chunkText, chunks) {
            if (settled) return;
            text += chunkText;
            logger?.('trace', 'GM stream chunk', {
              method,
              url,
              chunks,
              chunkLength: chunkText.length,
              responseLength: text.length,
            });
            if (responseStatus < 400) options.onProgressText?.(text);
          },
        }).then(() => {
          streamFinished = true;
          settleStream();
        }).catch((error) => {
          streamError = error;
          streamFinished = true;
          settleStream();
        });
      },
      onload(response) {
        if (settled) return;
        responseStatus = Number(response.status) || responseStatus;
        loadFinished = true;
        if (!started) {
          settled = true;
          const status = responseStatus || Number(response.status) || 0;
          if (status >= 400) {
            const body = (response.responseText || '').slice(0, 1000);
            logger?.('error', 'GM stream 请求返回错误状态', {
              method,
              url,
              status,
              body,
            });
            reject(new Error(`HTTP ${status}: ${body.slice(0, 500)}`));
            return;
          }
          reject(new Error(`GM stream 未提供可读取流，HTTP ${status}`));
          return;
        }
        settleStream();
      },
      onerror(error) {
        if (settled) return;
        settled = true;
        logger?.('error', 'GM stream 请求失败', { method, url, error: String(error || '') });
        reject(new Error(`GM stream 请求失败：${url}`));
      },
      ontimeout() {
        if (settled) return;
        settled = true;
        logger?.('error', 'GM stream 请求超时', { method, url });
        reject(new Error(`GM stream 请求超时：${url}`));
      },
    });
    const abort = () => {
      if (settled) return;
      settled = true;
      request?.abort?.();
      logger?.('warn', 'GM stream 请求已取消', { method, url, responseLength: text.length });
      reject(abortError());
    };
    options.signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function fetchTextStream(
  url: string,
  options: RequestOptions = {},
  logger?: RequestLogger,
): Promise<string> {
  const method = options.method || 'GET';
  logger?.('info', 'Fetch 流式请求开始', { method, url });

  const response = await fetch(url, {
    method,
    headers: options.headers || {},
    body: options.data,
    cache: 'no-store',
    signal: options.signal,
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 1000);
    logger?.('error', 'Fetch 流式请求返回错误状态', { method, url, status: response.status, body });
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  if (!response.body) {
    const text = await response.text();
    options.onProgressText?.(text);
    logger?.('info', 'Fetch 响应无 ReadableStream，已读取完整文本', {
      method,
      url,
      responseLength: text.length,
    });
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let chunks = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (options.signal?.aborted) throw abortError();
    chunks += 1;
    text += decoder.decode(value, { stream: true });
    logger?.('trace', 'Fetch 流式 chunk', {
      method,
      url,
      chunks,
      chunkBytes: value.byteLength,
      responseLength: text.length,
    });
    options.onProgressText?.(text);
  }

  const tail = decoder.decode();
  if (tail) {
    text += tail;
    options.onProgressText?.(text);
  }

  logger?.('info', 'Fetch 流式请求完成', {
    method,
    url,
    chunks,
    responseLength: text.length,
  });
  return text;
}

async function readUnknownStream(
  stream: unknown,
  context: {
    method: string;
    url: string;
    signal?: AbortSignal;
    onChunk: (text: string, chunks: number) => void;
  },
): Promise<void> {
  if (!stream || typeof (stream as ReadableStream<Uint8Array>).getReader !== 'function') {
    throw new Error('GM response.response 不是 ReadableStream');
  }

  const reader = (stream as ReadableStream<unknown>).getReader();
  const decoder = new TextDecoder();
  let chunks = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (context.signal?.aborted) throw abortError();
    chunks += 1;
    context.onChunk(decodeStreamChunk(value, decoder), chunks);
  }

  const tail = decoder.decode();
  if (tail) context.onChunk(tail, chunks + 1);
}

function decodeStreamChunk(value: unknown, decoder: TextDecoder): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return decoder.decode(value, { stream: true });
  if (value instanceof ArrayBuffer) return decoder.decode(value, { stream: true });
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return decoder.decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), { stream: true });
  }
  return String(value ?? '');
}

export function gmText(
  url: string,
  options: RequestOptions = {},
  logger?: RequestLogger,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      reject(new Error('GM_xmlhttpRequest 不可用'));
      return;
    }

    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    logger?.('info', 'HTTP 请求开始', { method: options.method || 'GET', url });
    let settled = false;
    const request = GM_xmlhttpRequest({
      method: options.method || 'GET',
      url,
      headers: options.headers || {},
      data: options.data,
      timeout: options.timeoutMs,
      responseType: 'text',
      onprogress(response) {
        if (settled) return;
        logger?.('trace', 'GM 请求进度事件', {
          method: options.method || 'GET',
          url,
          responseLength: (response.responseText || '').length,
        });
        options.onProgressText?.(response.responseText || '');
      },
      onload(response) {
        if (settled) return;
        settled = true;
        if (response.status >= 200 && response.status < 300) {
          logger?.('info', 'HTTP 请求成功', {
            method: options.method || 'GET',
            url,
            status: response.status,
            responseLength: (response.responseText || '').length,
          });
          resolve(response.responseText || '');
          return;
        }

        const body = (response.responseText || '').slice(0, 1000);
        logger?.('error', 'HTTP 请求返回错误状态', {
          method: options.method || 'GET',
          url,
          status: response.status,
          body,
        });
        reject(new Error(`HTTP ${response.status}: ${(response.responseText || '').slice(0, 500)}`));
      },
      onerror() {
        if (settled) return;
        settled = true;
        logger?.('error', 'HTTP 请求失败', { method: options.method || 'GET', url });
        reject(new Error(`请求失败：${url}`));
      },
      ontimeout() {
        if (settled) return;
        settled = true;
        logger?.('error', 'HTTP 请求超时', { method: options.method || 'GET', url });
        reject(new Error(`请求超时：${url}`));
      },
    });
    const abort = () => {
      if (settled) return;
      settled = true;
      request?.abort?.();
      logger?.('warn', 'HTTP 请求已取消', { method: options.method || 'GET', url });
      reject(abortError());
    };
    options.signal?.addEventListener('abort', abort, { once: true });
  });
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function abortError(): DOMException {
  return new DOMException('请求已取消', 'AbortError');
}
