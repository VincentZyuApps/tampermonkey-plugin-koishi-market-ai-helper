import type { AboutTab } from '../types/appTypes';

export function updateBackPanel(shadow: ShadowRoot, type: 'settings' | 'log', open: boolean): void {
  const selector = type === 'settings' ? '.kmh-settings' : '.kmh-log';
  const panel = shadow.querySelector<HTMLElement>(selector);
  panel?.classList.toggle('kmh-back-open', open);
  panel?.classList.toggle('kmh-back-closed', !open);
  if (panel) {
    panel.toggleAttribute('inert', !open);
    (panel as HTMLElement & { inert?: boolean }).inert = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  const action = type === 'settings' ? 'toggle-settings' : 'toggle-log';
  const text = type === 'settings'
    ? open ? '向左下收起设置' : '向右上展开设置'
    : open ? '向右收起日志' : '向左展开日志';
  const button = shadow.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  button?.setAttribute('title', text);
  button?.setAttribute('aria-label', text);
  button?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function updateAboutPanel(shadow: ShadowRoot, open: boolean): void {
  const panel = shadow.querySelector<HTMLElement>('.kmh-about');
  panel?.classList.toggle('kmh-about-open', open);
  panel?.classList.toggle('kmh-about-closed', !open);
  if (panel) {
    panel.toggleAttribute('inert', !open);
    (panel as HTMLElement & { inert?: boolean }).inert = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  const text = open ? '关闭关于' : '打开关于、使用指南和隐私说明';
  const button = shadow.querySelector<HTMLButtonElement>('[data-role="about-trigger"]');
  button?.setAttribute('title', text);
  button?.setAttribute('aria-label', text);
  button?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

export function updateAboutTab(shadow: ShadowRoot, activeTab: AboutTab): void {
  shadow.querySelectorAll<HTMLButtonElement>('[data-about-tab]').forEach((button) => {
    const active = button.dataset.aboutTab === activeTab;
    button.classList.toggle('kmh-about-tab-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  });

  shadow.querySelectorAll<HTMLElement>('.kmh-about-pane').forEach((pane) => {
    const active = pane.id === `kmh-about-pane-${activeTab}`;
    pane.hidden = !active;
    pane.toggleAttribute('inert', !active);
    (pane as HTMLElement & { inert?: boolean }).inert = !active;
  });
}
