export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function formatContent(content: string): string {
  return escapeHtml(content).replace(/\n/g, '<br>');
}

export function readCssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
