import { gmClipboard } from '../platform/gmBridge';

export function isMarketPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized.endsWith('/market');
}

export function applySearchToCurrentPage(query: string): boolean {
  const value = query.trim();
  if (!value) return false;

  const input = document.querySelector<HTMLInputElement>('.search-box input');
  const clearButton = document.querySelector<HTMLElement>('.search-box .search-action');
  if (!input) return false;

  clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  input.focus();
  setNativeInputValue(input, value.toLowerCase());
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keypress', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  return true;
}

export function openMarketSearch(query: string): void {
  const keyword = query.trim();
  if (!keyword) return;
  if (location.hostname === 'koishi.chat') {
    if (isMarketPath(location.pathname)) {
      applySearchToCurrentPage(keyword);
    } else {
      window.open('https://koishi.chat/zh-CN/market/', '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const url = new URL(location.href);
  url.pathname = '/market';
  url.searchParams.set('keyword', keyword);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

export function copyText(text: string): void {
  if (text) gmClipboard(text);
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
}
