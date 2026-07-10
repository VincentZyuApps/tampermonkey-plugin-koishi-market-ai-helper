import { APP_ID, APP_SHORT_NAME } from './appMeta';
import { updateAboutPanel, updateBackPanel } from '../ui/backPanel';
import { clearAllHistory, clearCurrentChat, handleSearchError, logSearchStart, searchAndRespond } from './chatFlow';
import { STORAGE_KEYS } from './appConstants';
import { clearStoredHistory, getApiKey, saveConfig, saveHistoryIfNeeded } from './appConfig';
import { gmDelete, gmGet, gmRegisterMenu, gmSet } from '../platform/gmBridge';
import { readCssVar } from '../shared/htmlUtils';
import { Logger } from '../log/appLogger';
import { bindLogPanel } from '../log/logPanel';
import { applySearchToCurrentPage, copyText, isMarketPath, openMarketSearch } from '../market/pageActions';
import { renderBubble, renderPanel } from '../ui/panelRender';
import { getInputValue, readSettingsFromForm } from '../ui/settingsForm';
import { createInitialState } from './appState';
import { styles } from '../style/styleSheet';
import type { AppState, SendMode } from '../types/appTypes';

export class KoishiMarketAiHelper {
  private readonly root: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly state: AppState;
  private readonly logger: Logger;

  constructor() {
    this.state = this.createState();
    this.root = document.createElement('div');
    this.root.id = APP_ID;
    document.documentElement.appendChild(this.root);
    this.shadow = this.root.attachShadow({ mode: 'open' });
    this.applyThemeVars();
    this.logger = new Logger(() => this.state, () => this.render());
  }

  start(): void {
    const disabledHosts = gmGet<Record<string, boolean>>(STORAGE_KEYS.disabledHosts, {});
    this.registerMenus(disabledHosts);
    if (disabledHosts[location.host]) return;

    this.render();
    this.logger.write('info', '脚本已启动', {
      host: location.host,
      path: location.pathname,
      provider: this.state.config.provider,
      model: this.state.config.model,
    });
  }

  private createState(): AppState {
    return createInitialState();
  }

  private registerMenus(disabled: Record<string, boolean>): void {
    if (disabled[location.host]) {
      gmRegisterMenu(`${APP_SHORT_NAME}: 启用当前站点`, () => {
        const next = gmGet<Record<string, boolean>>(STORAGE_KEYS.disabledHosts, {});
        delete next[location.host];
        gmSet(STORAGE_KEYS.disabledHosts, next);
        location.reload();
      });
    } else {
      gmRegisterMenu(`${APP_SHORT_NAME}: 禁用当前站点`, () => this.disableCurrentHost());
    }
    gmRegisterMenu(`${APP_SHORT_NAME}: 清除配置`, () => {
      gmDelete(STORAGE_KEYS.config);
      gmDelete(STORAGE_KEYS.history);
      location.reload();
    });
  }

  private applyThemeVars(): void {
    this.root.style.setProperty('--kmh-brand', readCssVar('--vp-c-brand-2', '#6c57d9'));
    this.root.style.setProperty('--kmh-brand-strong', readCssVar('--vp-c-brand-1', '#4a36b3'));
    this.root.style.setProperty('--kmh-brand-soft', readCssVar('--vp-c-brand-soft', 'rgba(138, 115, 255, .14)'));
  }

  private render(): void {
    if (this.state.closedForPage) {
      this.shadow.innerHTML = '';
      return;
    }
    const apiKey = getApiKey(this.state.config, this.state.sessionApiKey);
    const html = this.state.collapsed ? renderBubble() : renderPanel(this.state, apiKey);
    this.shadow.innerHTML = `<style>${styles()}</style>${html}`;
    this.bindEvents();
    this.scrollMessagesToBottom();
  }

  private bindEvents(): void {
    this.on('[data-action="expand"]', () => {
      this.state.collapsed = false;
      gmSet(STORAGE_KEYS.collapsed, false);
      this.render();
    });
    this.on('[data-action="collapse"]', () => {
      this.state.collapsed = true;
      gmSet(STORAGE_KEYS.collapsed, true);
      this.render();
    });
    this.on('[data-action="close-page"]', () => {
      this.state.closedForPage = true;
      this.render();
    });
    this.on('[data-action="toggle-settings"]', () => {
      this.state.settingsOpen = !this.state.settingsOpen;
      updateBackPanel(this.shadow, 'settings', this.state.settingsOpen);
    });
    this.on('[data-action="toggle-log"]', () => {
      this.state.logOpen = !this.state.logOpen;
      updateBackPanel(this.shadow, 'log', this.state.logOpen);
    });
    this.on('[data-action="toggle-about"]', () => {
      this.state.aboutOpen = !this.state.aboutOpen;
      updateAboutPanel(this.shadow, this.state.aboutOpen);
    });
    bindLogPanel(this.shadow, this.state, this.logger, () => this.render());
    this.on('[data-action="clear-current-chat"]', () => this.clearCurrentChat());
    this.on('[data-action="clear-all-history"]', () => this.clearAllHistory());
    this.on('[data-action="send"]', () => void this.handleSubmit(false));
    this.on('[data-action="local-search"]', () => void this.handleSubmit(true));
    this.on('[data-action="save-settings"]', () => this.saveSettingsFromForm());
    this.on('[data-action="disable-host"]', () => this.disableCurrentHost());
    this.on('[data-action="clear-history"]', () => this.clearAllHistory());
    this.bindInputHotkey();
    this.bindSendMode();
    this.bindCardActions();
  }

  private on(selector: string, handler: () => void): void {
    this.shadow.querySelectorAll(selector).forEach((element) => element.addEventListener('click', handler));
  }

  private bindInputHotkey(): void {
    const input = this.shadow.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    input?.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key !== 'Enter' || event.shiftKey) return;
      const usesCtrl = event.ctrlKey || event.metaKey;
      const shouldSend = this.state.sendMode === 'enter' ? !usesCtrl : usesCtrl;
      if (shouldSend) {
        event.preventDefault();
        void this.handleSubmit(false);
      } else if (usesCtrl) {
        event.preventDefault();
        insertTextAreaNewline(input);
      }
    });
  }

  private bindSendMode(): void {
    this.shadow.querySelector<HTMLSelectElement>('[data-role="send-mode"]')?.addEventListener('change', (event) => {
      const target = event.currentTarget as HTMLSelectElement;
      this.state.sendMode = readSendMode(target.value);
      gmSet(STORAGE_KEYS.sendMode, this.state.sendMode);
      this.logger.write('info', '发送方式已切换', { sendMode: this.state.sendMode });
    });
  }

  private bindCardActions(): void {
    this.shadow.querySelectorAll<HTMLElement>('[data-card-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-card-action');
        if (action === 'apply-search') this.applySearch(button.getAttribute('data-query') || '');
        if (action === 'open-market') openMarketSearch(button.getAttribute('data-query') || '');
        if (action === 'copy') this.copy(button.getAttribute('data-name') || '');
        if (action === 'open-url') window.open(button.getAttribute('data-url') || '', '_blank', 'noopener,noreferrer');
      });
    });
  }

  private clearCurrentChat(): void {
    clearCurrentChat(this.state, this.logger);
    this.render();
  }

  private clearAllHistory(): void {
    clearAllHistory(this.state, this.logger);
    this.render();
  }

  private async handleSubmit(forceLocal: boolean): Promise<void> {
    if (this.state.busy) return;
    const input = this.shadow.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    const query = input?.value.trim();
    if (!query) return;

    if (input) input.value = '';
    this.state.notice = '';
    this.state.busy = true;
    logSearchStart(this.state, this.logger, forceLocal, query);
    this.state.messages.push({ role: 'user', content: query, cards: [] });
    saveHistoryIfNeeded(this.state.config, this.state.messages);
    this.render();

    try {
      await searchAndRespond(this.state, this.logger, query, forceLocal, () => this.render());
    } catch (error) {
      handleSearchError(this.state, this.logger, error);
    } finally {
      this.state.busy = false;
      saveHistoryIfNeeded(this.state.config, this.state.messages);
      this.render();
    }
  }

  private saveSettingsFromForm(): void {
    const next = readSettingsFromForm(this.shadow, this.state.config);
    const apiKey = getInputValue(this.shadow, 'apiKey').trim();
    if (next.persistApiKey) {
      next.apiKey = apiKey;
      this.state.sessionApiKey = '';
    } else {
      next.apiKey = '';
      this.state.sessionApiKey = apiKey;
    }
    this.state.config = next;
    saveConfig(next);
    if (!next.saveHistory) clearStoredHistory();
    this.state.notice = '设置已保存。';
    this.state.settingsOpen = false;
    this.render();
  }

  private disableCurrentHost(): void {
    const disabled = gmGet<Record<string, boolean>>(STORAGE_KEYS.disabledHosts, {});
    disabled[location.host] = true;
    gmSet(STORAGE_KEYS.disabledHosts, disabled);
    this.state.closedForPage = true;
    this.render();
  }

  private applySearch(query: string): void {
    if (applySearchToCurrentPage(query)) {
      this.state.notice = `已尝试填入当前页搜索：${query}`;
    } else {
      copyText(query);
      this.state.notice = '没有找到当前页搜索框，已复制查询词。';
    }
    this.render();
  }

  private copy(text: string): void {
    copyText(text);
    this.state.notice = `已复制：${text}`;
    this.render();
  }

  private scrollMessagesToBottom(): void {
    requestAnimationFrame(() => {
      const box = this.shadow.querySelector<HTMLElement>('[data-role="messages"]');
      if (box) box.scrollTop = box.scrollHeight;
    });
  }
}

export function shouldRun(): boolean {
  return isMarketPath(location.pathname);
}

function readSendMode(value: string): SendMode {
  return value === 'ctrlEnter' ? 'ctrlEnter' : 'enter';
}

function insertTextAreaNewline(input: HTMLTextAreaElement): void {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.setRangeText('\n', start, end, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
