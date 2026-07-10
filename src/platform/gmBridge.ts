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
      responseType?: 'text';
      onprogress?: (response: { responseText?: string }) => void;
      onload?: (response: { status: number; responseText?: string }) => void;
      onerror?: () => void;
      ontimeout?: () => void;
    }) => void)
  | undefined;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  data?: string;
  onProgressText?: (text: string) => void;
}

export type RequestLogger = (
  level: 'info' | 'warn' | 'error',
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

    logger?.('info', 'HTTP 请求开始', { method: options.method || 'GET', url });
    GM_xmlhttpRequest({
      method: options.method || 'GET',
      url,
      headers: options.headers || {},
      data: options.data,
      responseType: 'text',
      onprogress(response) {
        options.onProgressText?.(response.responseText || '');
      },
      onload(response) {
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
        logger?.('error', 'HTTP 请求失败', { method: options.method || 'GET', url });
        reject(new Error(`请求失败：${url}`));
      },
      ontimeout() {
        logger?.('error', 'HTTP 请求超时', { method: options.method || 'GET', url });
        reject(new Error(`请求超时：${url}`));
      },
    });
  });
}
