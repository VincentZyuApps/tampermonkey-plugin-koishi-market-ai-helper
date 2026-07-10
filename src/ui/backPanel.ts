export function updateBackPanel(shadow: ShadowRoot, type: 'settings' | 'log', open: boolean): void {
  const selector = type === 'settings' ? '.kmh-settings' : '.kmh-log';
  const panel = shadow.querySelector<HTMLElement>(selector);
  panel?.classList.toggle('kmh-back-open', open);
  panel?.classList.toggle('kmh-back-closed', !open);
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (panel) {
    panel.toggleAttribute('inert', !open);
    (panel as HTMLElement & { inert?: boolean }).inert = !open;
  }

  const action = type === 'settings' ? 'toggle-settings' : 'toggle-log';
  const text = type === 'settings'
    ? open ? '向左下收起设置' : '向右上展开设置'
    : open ? '向右收起日志' : '向左展开日志';
  const button = shadow.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  button?.setAttribute('title', text);
  button?.setAttribute('aria-label', text);
}

export function updateAboutPanel(shadow: ShadowRoot, open: boolean): void {
  const panel = shadow.querySelector<HTMLElement>('.kmh-about');
  panel?.classList.toggle('kmh-about-open', open);
  panel?.classList.toggle('kmh-about-closed', !open);
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (panel) {
    panel.toggleAttribute('inert', !open);
    (panel as HTMLElement & { inert?: boolean }).inert = !open;
  }

  const text = open ? '关闭关于' : '打开关于和快捷键说明';
  const button = shadow.querySelector<HTMLButtonElement>('[data-action="toggle-about"]');
  button?.setAttribute('title', text);
  button?.setAttribute('aria-label', text);
}
