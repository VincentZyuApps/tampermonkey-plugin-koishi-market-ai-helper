import { APP_ID, APP_SHORT_NAME } from './appMeta';
import { updateAboutPanel, updateBackPanel } from '../ui/backPanel';
import { clearAllHistory, clearCurrentChat, handleSearchError, handleSearchStopped, logSearchStart, searchAndRespond } from './chatFlow';
import { STORAGE_KEYS } from './appConstants';
import { clearStoredHistory, getApiKey, saveConfig, saveHistoryIfNeeded } from './appConfig';
import { gmDelete, gmGet, gmRegisterMenu, gmSet, isAbortError } from '../platform/gmBridge';
import { readCssVar } from '../shared/htmlUtils';
import { Logger } from '../log/appLogger';
import { bindLogPanel } from '../log/logPanel';
import { applySearchToCurrentPage, copyText, isMarketPath, openMarketSearch } from '../market/pageActions';
import { renderBubble, renderMessages, renderPanel } from '../ui/panelRender';
import { getInputValue, readSettingsFromForm } from '../ui/settingsForm';
import { createInitialState } from './appState';
import { styles } from '../style/styleSheet';
import type { AppState, SendMode } from '../types/appTypes';

interface ScrollState {
  top: number;
  nearBottom: boolean;
}

export class KoishiMarketAiHelper {
  private readonly root: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly state: AppState;
  private readonly logger: Logger;
  private panelEnterNext = false;
  private streamingRenderTimer = 0;
  private activeAbortController: AbortController | null = null;

  constructor() {
    this.state = this.createState();
    this.root = document.createElement('div');
    this.root.id = APP_ID;
    document.documentElement.appendChild(this.root);
    this.shadow = this.root.attachShadow({ mode: 'open' });
    this.applyThemeVars();
    this.logger = new Logger(() => this.state, () => this.render());
    document.addEventListener('keydown', (event) => this.handleGlobalKeydown(event), true);
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
    const scrollState = this.readMessagesScrollState();
    const apiKey = getApiKey(this.state.config, this.state.sessionApiKey);
    const shouldAnimatePanelEnter = this.panelEnterNext && !this.state.collapsed;
    this.panelEnterNext = false;
    const html = this.state.collapsed ? renderBubble() : renderPanel(this.state, apiKey, shouldAnimatePanelEnter);
    this.shadow.innerHTML = `<style>${styles()}</style>${html}`;
    this.bindEvents();
    this.restoreMessagesScroll(scrollState);
  }

  private renderStreaming(): void {
    if (this.streamingRenderTimer) return;
    this.streamingRenderTimer = window.setTimeout(() => {
      this.streamingRenderTimer = 0;
      this.renderMessagesOnly();
    }, 100);
  }

  private renderMessagesOnly(): void {
    const box = this.shadow.querySelector<HTMLElement>('[data-role="messages"]');
    if (!box || this.state.collapsed || this.state.closedForPage) {
      this.render();
      return;
    }

    const scrollState = this.readMessagesScrollState();
    const reasoningScrollState = this.readReasoningScrollStates();
    box.innerHTML = renderMessages(this.state.messages);
    this.bindReasoningActions();
    this.restoreReasoningScrollStates(reasoningScrollState);
    this.restoreMessagesScroll(scrollState);
  }

  private bindEvents(): void {
    this.on('[data-action="expand"]', () => {
      this.panelEnterNext = true;
      this.state.collapsed = false;
      gmSet(STORAGE_KEYS.collapsed, false);
      this.render();
    });
    this.on('[data-action="collapse"]', () => {
      this.collapseWithAnimation();
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
    this.on('[data-action="send"]', () => {
      if (this.state.busy) {
        this.stopCurrentSearch();
      } else {
        void this.handleSubmit(false);
      }
    });
    this.on('[data-action="local-search"]', () => void this.handleSubmit(true));
    this.on('[data-action="save-settings"]', () => this.saveSettingsFromForm());
    this.on('[data-action="disable-host"]', () => this.disableCurrentHost());
    this.on('[data-action="clear-history"]', () => this.clearAllHistory());
    this.bindInputHotkey();
    this.bindSendMode();
    this.bindCardActions();
    this.bindReasoningActions();
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

  private bindReasoningActions(): void {
    this.shadow.querySelectorAll<HTMLElement>('[data-action="toggle-reasoning"]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number.parseInt(button.getAttribute('data-message-index') || '', 10);
        const message = Number.isFinite(index) ? this.state.messages[index] : null;
        if (!message?.reasoning) return;
        message.reasoningOpen = !message.reasoningOpen;
        this.render();
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

  private collapseWithAnimation(): void {
    const stack = this.shadow.querySelector<HTMLElement>('.kmh-stack');
    if (!stack) {
      this.state.collapsed = true;
      gmSet(STORAGE_KEYS.collapsed, true);
      this.render();
      return;
    }
    stack.classList.add('kmh-stack-leave');
    window.setTimeout(() => {
      this.state.collapsed = true;
      gmSet(STORAGE_KEYS.collapsed, true);
      this.render();
    }, 170);
  }

  private async handleSubmit(forceLocal: boolean): Promise<void> {
    if (this.state.busy) return;
    const input = this.shadow.querySelector<HTMLTextAreaElement>('[data-role="input"]');
    const query = input?.value.trim();
    if (!query) return;

    if (input) input.value = '';
    this.state.notice = '';
    this.state.busy = true;
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    logSearchStart(this.state, this.logger, forceLocal, query);
    this.state.messages.push({ role: 'user', content: query, cards: [] });
    saveHistoryIfNeeded(this.state.config, this.state.messages);
    this.render();

    try {
      await searchAndRespond(this.state, this.logger, query, forceLocal, () => this.renderStreaming(), abortController.signal);
    } catch (error) {
      if (abortController.signal.aborted || isAbortError(error)) {
        handleSearchStopped(this.state, this.logger);
      } else {
        handleSearchError(this.state, this.logger, error);
      }
    } finally {
      if (this.activeAbortController === abortController) this.activeAbortController = null;
      this.state.busy = false;
      saveHistoryIfNeeded(this.state.config, this.state.messages);
      this.render();
    }
  }

  private stopCurrentSearch(): void {
    if (!this.state.busy || !this.activeAbortController || this.activeAbortController.signal.aborted) return;
    this.activeAbortController.abort();
    this.state.notice = '⏹️ 正在停止当前请求……';
    this.logger.write('warn', '用户请求停止当前搜索');
    this.render();
  }

  private handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.state.busy) return;
    event.preventDefault();
    event.stopPropagation();
    this.stopCurrentSearch();
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
    this.state.notice = '✅ 设置已保存。';
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
      this.state.notice = `🔎 已尝试填入当前页搜索：${query}`;
    } else {
      copyText(query);
      this.state.notice = '📋 没有找到当前页搜索框，已复制查询词。';
    }
    this.render();
  }

  private copy(text: string): void {
    copyText(text);
    this.state.notice = `📋 已复制：${text}`;
    this.render();
  }

  private readMessagesScrollState(): ScrollState | null {
    const box = this.shadow.querySelector<HTMLElement>('[data-role="messages"]');
    if (!box) return null;
    return readScrollState(box, 36);
  }

  private restoreMessagesScroll(state: ScrollState | null): void {
    const box = this.shadow.querySelector<HTMLElement>('[data-role="messages"]');
    if (!box) return;
    restoreScrollState(box, state);
  }

  private readReasoningScrollStates(): Map<string, ScrollState> {
    const states = new Map<string, ScrollState>();
    this.shadow.querySelectorAll<HTMLElement>('[data-role="reasoning-body"]').forEach((element) => {
      const index = element.getAttribute('data-message-index');
      if (!index) return;
      states.set(index, readScrollState(element, 24));
    });
    return states;
  }

  private restoreReasoningScrollStates(states: Map<string, ScrollState>): void {
    this.shadow.querySelectorAll<HTMLElement>('[data-role="reasoning-body"]').forEach((element) => {
      const index = element.getAttribute('data-message-index');
      if (!index) return;
      restoreScrollState(element, states.get(index) || null);
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

function readScrollState(element: HTMLElement, threshold: number): ScrollState {
  return {
    top: element.scrollTop,
    nearBottom: element.scrollHeight - element.scrollTop - element.clientHeight < threshold,
  };
}

function restoreScrollState(element: HTMLElement, state: ScrollState | null): void {
  if (!state || state.nearBottom) {
    element.scrollTop = element.scrollHeight;
  } else {
    element.scrollTop = state.top;
  }
}
