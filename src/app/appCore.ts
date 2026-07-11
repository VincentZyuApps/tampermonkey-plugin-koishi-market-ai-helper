import { APP_ID, APP_SHORT_NAME } from './appMeta';
import { updateAboutPanel, updateAboutTab, updateBackPanel } from '../ui/backPanel';
import { clearAllHistory, clearCurrentChat, handleSearchError, handleSearchStopped, logSearchStart, searchAndRespond } from './chatFlow';
import { STORAGE_KEYS } from './appConstants';
import { clearStoredHistory, getApiKey, saveConfig, saveHistoryIfNeeded } from './appConfig';
import { gmDelete, gmGet, gmRegisterMenu, gmSet, isAbortError } from '../platform/gmBridge';
import { readCssVar } from '../shared/htmlUtils';
import { Logger } from '../log/appLogger';
import { bindLogPanel } from '../log/logPanel';
import { fetchModelCatalog, isModelCatalogError } from '../llm/modelCatalog';
import { applySearchToCurrentPage, copyText, isMarketPath, openMarketSearch } from '../market/pageActions';
import { renderBubble, renderMessages, renderPanel } from '../ui/panelRender';
import { renderIcon } from '../ui/iconRender';
import { getInputValue, readSettingsFromForm } from '../ui/settingsForm';
import { createInitialState } from './appState';
import { styles } from '../style/styleSheet';
import type { AboutTab, AppState, Provider, SendMode } from '../types/appTypes';

interface ScrollState {
  top: number;
  nearBottom: boolean;
}

type AuxiliaryPanel = 'about' | 'settings' | 'log';

export class KoishiMarketAiHelper {
  private readonly root: HTMLDivElement;
  private readonly shadow: ShadowRoot;
  private readonly state: AppState;
  private readonly logger: Logger;
  private panelEnterNext = false;
  private streamingRenderTimer = 0;
  private activeAbortController: AbortController | null = null;
  private modelCatalogAbortController: AbortController | null = null;
  private modelCatalogRequestId = 0;
  private modelCatalogSource = '';
  private modelMenuOpen = false;
  private modelFetchLoading = false;
  private modelFetchMessage = '';
  private modelFetchTone: 'muted' | 'success' | 'error' = 'muted';
  private auxiliaryPanelOrder: AuxiliaryPanel[] = [];

  constructor() {
    this.state = this.createState();
    this.root = document.createElement('div');
    this.root.id = APP_ID;
    document.documentElement.appendChild(this.root);
    this.shadow = this.root.attachShadow({ mode: 'open' });
    this.applyThemeVars();
    this.logger = new Logger(() => this.state, () => this.render());
    document.addEventListener('keydown', (event) => this.handleGlobalKeydown(event), true);
    document.addEventListener('pointerdown', (event) => this.handleGlobalPointerdown(event), true);
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
    this.reconcileModelCatalogWithConfig();
    const apiKey = getApiKey(this.state.config, this.state.sessionApiKey);
    const shouldAnimatePanelEnter = this.panelEnterNext && !this.state.collapsed;
    this.panelEnterNext = false;
    const html = this.state.collapsed ? renderBubble() : renderPanel(this.state, apiKey, shouldAnimatePanelEnter);
    this.shadow.innerHTML = `<style>${styles()}</style>${html}`;
    this.bindEvents();
    this.applyModelFetchUi();
    this.applyModelMenuUi();
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
      this.abortModelCatalogFetch();
      this.state.closedForPage = true;
      this.render();
    });
    this.on('[data-action="toggle-settings"]', () => {
      this.setSettingsOpen(!this.state.settingsOpen);
    });
    this.on('[data-action="toggle-log"]', () => {
      this.setLogOpen(!this.state.logOpen);
    });
    this.on('[data-action="toggle-about"]', () => {
      this.setAboutOpen(!this.state.aboutOpen);
    });
    this.on('[data-action="close-about"]', () => this.setAboutOpen(false, true));
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
    this.on('[data-action="model-primary"]', () => this.handleModelPrimaryAction());
    this.on('[data-action="fetch-models"]', () => void this.fetchModelsFromForm());
    this.on('[data-action="disable-host"]', () => this.disableCurrentHost());
    this.on('[data-action="clear-history"]', () => this.clearAllHistory());
    this.bindInputHotkey();
    this.bindSendMode();
    this.bindAboutTabs();
    this.bindModelSourceChanges();
    this.bindModelOptionActions();
    this.bindCardActions();
    this.bindReasoningActions();
  }

  private on(selector: string, handler: () => void): void {
    this.shadow.querySelectorAll(selector).forEach((element) => element.addEventListener('click', handler));
  }

  private setAboutOpen(open: boolean, restoreFocus = false): void {
    if (!open) {
      this.focusOutsidePanelBeforeClose('#kmh-about-panel', '[data-role="about-trigger"]', restoreFocus);
    }
    this.state.aboutOpen = open;
    this.updateAuxiliaryPanelOrder('about', open);
    updateAboutPanel(this.shadow, open);
    if (open) {
      window.requestAnimationFrame(() => {
        if (!this.state.aboutOpen) return;
        this.shadow.querySelector<HTMLButtonElement>(`[data-about-tab="${this.state.aboutTab}"]`)?.focus();
      });
    }
  }

  private setSettingsOpen(open: boolean, restoreFocus = false): void {
    if (!open) {
      this.focusOutsidePanelBeforeClose('#kmh-settings-panel', '[data-role="settings-trigger"]', restoreFocus);
      this.modelMenuOpen = false;
      this.abortModelCatalogFetch('获取已取消，可重新获取模型列表。');
    }
    this.state.settingsOpen = open;
    this.updateAuxiliaryPanelOrder('settings', open);
    updateBackPanel(this.shadow, 'settings', open);
    this.applyModelMenuUi();
    if (open) {
      window.requestAnimationFrame(() => {
        if (!this.state.settingsOpen) return;
        this.shadow.querySelector<HTMLButtonElement>('[data-action="save-settings"]')?.focus();
      });
    }
  }

  private setLogOpen(open: boolean, restoreFocus = false): void {
    if (!open) {
      this.focusOutsidePanelBeforeClose('#kmh-log-panel', '[data-role="log-trigger"]', restoreFocus);
    }
    this.state.logOpen = open;
    this.updateAuxiliaryPanelOrder('log', open);
    updateBackPanel(this.shadow, 'log', open);
    if (open) {
      window.requestAnimationFrame(() => {
        if (!this.state.logOpen) return;
        this.shadow.querySelector<HTMLElement>('#kmh-log-panel button, #kmh-log-panel input')?.focus();
      });
    }
  }

  private focusOutsidePanelBeforeClose(
    panelSelector: string,
    triggerSelector: string,
    restoreFocus: boolean,
  ): void {
    const panel = this.shadow.querySelector<HTMLElement>(panelSelector);
    const active = this.shadow.activeElement;
    if (!restoreFocus && (!active || !panel?.contains(active))) return;
    this.shadow.querySelector<HTMLButtonElement>(triggerSelector)?.focus();
  }

  private updateAuxiliaryPanelOrder(panel: AuxiliaryPanel, open: boolean): void {
    this.auxiliaryPanelOrder = this.auxiliaryPanelOrder.filter((value) => value !== panel);
    if (open) this.auxiliaryPanelOrder.push(panel);
  }

  private focusedAuxiliaryPanel(origin: EventTarget | undefined): AuxiliaryPanel | null {
    if (!(origin instanceof Node)) return null;
    if (this.shadow.querySelector('#kmh-about-panel')?.contains(origin)) return 'about';
    if (this.shadow.querySelector('#kmh-settings-panel')?.contains(origin)) return 'settings';
    if (this.shadow.querySelector('#kmh-log-panel')?.contains(origin)) return 'log';
    return null;
  }

  private latestOpenAuxiliaryPanel(): AuxiliaryPanel | null {
    for (let index = this.auxiliaryPanelOrder.length - 1; index >= 0; index -= 1) {
      const panel = this.auxiliaryPanelOrder[index];
      if (panel && this.isAuxiliaryPanelOpen(panel)) return panel;
    }
    if (this.state.aboutOpen) return 'about';
    if (this.state.settingsOpen) return 'settings';
    if (this.state.logOpen) return 'log';
    return null;
  }

  private isAuxiliaryPanelOpen(panel: AuxiliaryPanel): boolean {
    if (panel === 'about') return this.state.aboutOpen;
    if (panel === 'settings') return this.state.settingsOpen;
    return this.state.logOpen;
  }

  private closeAuxiliaryPanel(panel: AuxiliaryPanel, restoreFocus: boolean): void {
    if (panel === 'about') this.setAboutOpen(false, restoreFocus);
    else if (panel === 'settings') this.setSettingsOpen(false, restoreFocus);
    else this.setLogOpen(false, restoreFocus);
  }

  private bindAboutTabs(): void {
    const tabs = [...this.shadow.querySelectorAll<HTMLButtonElement>('[data-about-tab]')];
    tabs.forEach((button, index) => {
      button.addEventListener('click', () => this.selectAboutTab(readAboutTab(button.dataset.aboutTab)));
      button.addEventListener('keydown', (event) => {
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = tabs.length - 1;
        else return;
        event.preventDefault();
        this.selectAboutTab(readAboutTab(tabs[nextIndex]?.dataset.aboutTab), true);
      });
    });
  }

  private selectAboutTab(tab: AboutTab, focus = false): void {
    this.state.aboutTab = tab;
    updateAboutTab(this.shadow, tab);
    const body = this.shadow.querySelector<HTMLElement>('.kmh-about-body');
    if (body) body.scrollTop = 0;
    if (focus) this.shadow.querySelector<HTMLButtonElement>(`[data-about-tab="${tab}"]`)?.focus();
  }

  private handleModelPrimaryAction(): void {
    if (this.modelFetchLoading) return;
    if (!this.state.modelOptions.length) {
      void this.fetchModelsFromForm();
      return;
    }
    this.setModelMenuOpen(!this.modelMenuOpen, true);
  }

  private setModelMenuOpen(open: boolean, focusOption = false): void {
    this.modelMenuOpen = open && this.state.modelOptions.length > 0;
    const activeOption = this.modelMenuOpen ? this.syncModelOptionSelection() : null;
    this.applyModelMenuUi();
    if (activeOption && focusOption) {
      window.requestAnimationFrame(() => {
        if (!this.modelMenuOpen) return;
        this.shadow.querySelector<HTMLButtonElement>('[data-model-id][tabindex="0"]')?.focus();
      });
    }
  }

  private applyModelMenuUi(): void {
    const menu = this.shadow.querySelector<HTMLElement>('[data-role="model-menu"]');
    if (menu) menu.hidden = !this.modelMenuOpen;
    this.applyModelPrimaryButtonUi();
  }

  private bindModelOptionActions(): void {
    const options = [...this.shadow.querySelectorAll<HTMLButtonElement>('[data-model-id]')];
    options.forEach((button, index) => {
      button.addEventListener('click', () => this.selectModel(button.dataset.modelId || ''));
      button.addEventListener('keydown', (event) => {
        let nextIndex = index;
        if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length;
        else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = options.length - 1;
        else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.setModelMenuOpen(false);
          this.shadow.querySelector<HTMLButtonElement>('[data-action="model-primary"]')?.focus();
          return;
        } else return;
        event.preventDefault();
        options.forEach((option, optionIndex) => {
          option.tabIndex = optionIndex === nextIndex ? 0 : -1;
        });
        options[nextIndex]?.focus();
      });
    });
    this.syncModelOptionSelection();
  }

  private syncModelOptionSelection(): HTMLButtonElement | null {
    const options = [...this.shadow.querySelectorAll<HTMLButtonElement>('[data-model-id]')];
    if (!options.length) return null;
    const currentModel = getInputValue(this.shadow, 'model').trim();
    const selected = options.find((option) => option.dataset.modelId === currentModel) || null;
    const active = selected || options[0] || null;
    options.forEach((option) => {
      option.setAttribute('aria-selected', option === selected ? 'true' : 'false');
      option.tabIndex = option === active ? 0 : -1;
    });
    return active;
  }

  private selectModel(modelId: string): void {
    if (!modelId) return;
    const input = this.shadow.querySelector<HTMLInputElement>('[data-setting="model"]');
    if (input) {
      input.value = modelId;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    this.shadow.querySelectorAll<HTMLButtonElement>('[data-model-id]').forEach((option) => {
      const selected = option.dataset.modelId === modelId;
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
      option.tabIndex = selected ? 0 : -1;
    });
    this.setModelMenuOpen(false);
    this.setModelFetchUi(false, `已选择模型：${modelId}`, 'success');
    input?.focus();
  }

  private bindModelSourceChanges(): void {
    const invalidate = () => {
      const changedSavedSource = Boolean(
        this.modelCatalogSource && this.currentModelCatalogSource() !== this.modelCatalogSource,
      );
      if (!this.modelCatalogAbortController && !changedSavedSource) return;
      this.abortModelCatalogFetch();
      this.modelCatalogSource = '';
      this.state.modelOptions = [];
      this.updateModelOptionsDom();
      this.setModelFetchUi(false, '请求格式或 Base URL 已变化，请重新获取模型列表。', 'muted');
    };
    this.shadow.querySelector<HTMLSelectElement>('[data-setting="provider"]')?.addEventListener('change', invalidate);
    this.shadow.querySelector<HTMLInputElement>('[data-setting="baseUrl"]')?.addEventListener('input', invalidate);
    this.shadow.querySelector<HTMLInputElement>('[data-setting="model"]')?.addEventListener('input', () => {
      this.syncModelOptionSelection();
      if (this.modelMenuOpen) this.setModelMenuOpen(false);
    });
    this.shadow.querySelector<HTMLInputElement>('[data-setting="apiKey"]')?.addEventListener('input', () => {
      if (!this.modelCatalogSource && !this.modelCatalogAbortController) return;
      this.abortModelCatalogFetch();
      this.modelCatalogSource = '';
      this.state.modelOptions = [];
      this.updateModelOptionsDom();
      this.setModelFetchUi(false, 'API Key 已变化，请重新获取模型列表。', 'muted');
    });
  }

  private async fetchModelsFromForm(): Promise<void> {
    const active = this.shadow.activeElement;
    const menu = this.shadow.querySelector<HTMLElement>('[data-role="model-menu"]');
    const primaryButton = this.shadow.querySelector<HTMLButtonElement>('[data-action="model-primary"]');
    const shouldMoveFocus = active === primaryButton || Boolean(active && menu?.contains(active));
    this.modelCatalogAbortController?.abort();
    this.modelMenuOpen = false;
    this.applyModelMenuUi();
    const requestId = ++this.modelCatalogRequestId;
    const controller = new AbortController();
    this.modelCatalogAbortController = controller;
    const draft = readSettingsFromForm(this.shadow, this.state.config);
    const provider = draft.provider;
    const baseUrl = draft.baseUrl;
    const apiKey = getInputValue(this.shadow, 'apiKey').trim();
    const baseUrlInput = this.shadow.querySelector<HTMLInputElement>('[data-setting="baseUrl"]');
    const modelInput = this.shadow.querySelector<HTMLInputElement>('[data-setting="model"]');
    if (shouldMoveFocus) modelInput?.focus();
    if (baseUrlInput) baseUrlInput.value = baseUrl;
    if (modelInput) modelInput.value = draft.model;
    const source = modelCatalogSource(provider, baseUrl);
    this.setModelFetchUi(true, '正在获取模型列表……', 'muted');

    try {
      const result = await fetchModelCatalog({ provider, baseUrl, apiKey, signal: controller.signal });
      if (requestId !== this.modelCatalogRequestId || controller.signal.aborted) return;
      const currentApiKey = getInputValue(this.shadow, 'apiKey').trim();
      if (this.currentModelCatalogSource() !== source || currentApiKey !== apiKey) {
        this.setModelFetchUi(false, '配置已变化，本次结果未应用，请重新获取。', 'muted');
        return;
      }
      this.modelCatalogSource = source;
      this.state.modelOptions = result.models.map((model) => ({ id: model.id, ownedBy: model.ownedBy }));
      this.updateModelOptionsDom();
      this.setModelFetchUi(false, `已加载 ${result.models.length} 个模型，可输入或从候选列表选择。`, 'success');
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error) || requestId !== this.modelCatalogRequestId) return;
      this.setModelFetchUi(false, modelCatalogErrorMessage(error), 'error');
    } finally {
      if (this.modelCatalogAbortController === controller) this.modelCatalogAbortController = null;
    }
  }

  private currentModelCatalogSource(): string {
    const draft = readSettingsFromForm(this.shadow, this.state.config);
    return modelCatalogSource(draft.provider, draft.baseUrl);
  }

  private updateModelOptionsDom(): void {
    const menu = this.shadow.querySelector<HTMLElement>('[data-role="model-menu"]');
    if (!menu) return;
    menu.replaceChildren();
    if (!this.state.modelOptions.length) {
      this.modelMenuOpen = false;
      this.applyModelMenuUi();
      return;
    }

    const header = document.createElement('div');
    header.className = 'kmh-model-menu-head';
    const count = document.createElement('span');
    count.textContent = `${this.state.modelOptions.length} 个模型`;
    const refresh = document.createElement('button');
    refresh.className = 'kmh-secondary kmh-model-refresh';
    refresh.type = 'button';
    refresh.title = '重新获取模型列表';
    refresh.setAttribute('aria-label', '重新获取模型列表');
    refresh.innerHTML = renderIcon('refresh');
    refresh.addEventListener('click', () => void this.fetchModelsFromForm());
    header.append(count, refresh);

    const list = document.createElement('div');
    list.className = 'kmh-model-menu-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '可用模型');
    const currentModel = getInputValue(this.shadow, 'model').trim();
    const activeModel = this.state.modelOptions.some((model) => model.id === currentModel)
      ? currentModel
      : this.state.modelOptions[0]?.id;
    for (const model of this.state.modelOptions) {
      const option = document.createElement('button');
      option.className = 'kmh-model-option';
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', model.id === getInputValue(this.shadow, 'model') ? 'true' : 'false');
      option.tabIndex = model.id === activeModel ? 0 : -1;
      option.dataset.modelId = model.id;
      option.title = model.id;
      const name = document.createElement('span');
      name.textContent = model.id;
      option.append(name);
      if (model.ownedBy) {
        const owner = document.createElement('small');
        owner.textContent = model.ownedBy;
        option.append(owner);
      }
      list.append(option);
    }
    menu.append(header, list);
    this.bindModelOptionActions();
    this.applyModelMenuUi();
  }

  private setModelFetchUi(
    loading: boolean,
    message: string,
    tone: 'muted' | 'success' | 'error',
  ): void {
    this.modelFetchLoading = loading;
    this.modelFetchMessage = message;
    this.modelFetchTone = tone;
    this.applyModelFetchUi();
  }

  private applyModelFetchUi(): void {
    this.applyModelPrimaryButtonUi();
    const status = this.shadow.querySelector<HTMLElement>('[data-role="model-status"]');
    if (status && this.modelFetchMessage) {
      status.textContent = this.modelFetchMessage;
      status.dataset.tone = this.modelFetchTone;
    }
  }

  private applyModelPrimaryButtonUi(): void {
    const button = this.shadow.querySelector<HTMLButtonElement>('[data-action="model-primary"]');
    if (!button) return;
    const hasOptions = this.state.modelOptions.length > 0;
    button.dataset.mode = hasOptions ? 'menu' : 'fetch';
    button.disabled = this.modelFetchLoading;
    button.classList.toggle('kmh-model-fetching', this.modelFetchLoading);
    button.setAttribute('aria-expanded', this.modelMenuOpen ? 'true' : 'false');
    if (hasOptions) button.setAttribute('aria-haspopup', 'listbox');
    else button.removeAttribute('aria-haspopup');
    const text = this.modelFetchLoading
      ? '正在获取模型列表'
      : hasOptions
        ? this.modelMenuOpen ? '关闭模型列表' : '打开模型列表'
        : '获取模型列表';
    button.title = text;
    button.setAttribute('aria-label', text);
  }

  private abortModelCatalogFetch(message = '获取已取消，可重新获取模型列表。'): void {
    const wasLoading = this.modelFetchLoading;
    if (this.modelCatalogAbortController) {
      this.modelCatalogAbortController.abort();
      this.modelCatalogAbortController = null;
      this.modelCatalogRequestId += 1;
    }
    this.modelFetchLoading = false;
    if (wasLoading && message) {
      this.modelFetchMessage = message;
      this.modelFetchTone = 'muted';
    }
    this.applyModelFetchUi();
  }

  private reconcileModelCatalogWithConfig(): void {
    if (!this.modelCatalogSource) return;
    const configSource = modelCatalogSource(this.state.config.provider, this.state.config.baseUrl);
    if (configSource === this.modelCatalogSource) return;
    this.modelCatalogSource = '';
    this.modelMenuOpen = false;
    this.modelFetchMessage = '';
    this.state.modelOptions = [];
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
    this.setAboutOpen(false);
    this.setSettingsOpen(false);
    this.setLogOpen(false);
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
    if (event.key !== 'Escape') return;
    if (this.state.busy) {
      event.preventDefault();
      event.stopPropagation();
      this.stopCurrentSearch();
      return;
    }
    if (this.modelMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.setModelMenuOpen(false);
      this.shadow.querySelector<HTMLButtonElement>('[data-action="model-primary"]')?.focus();
      return;
    }
    const origin = event.composedPath()[0];
    if (origin instanceof HTMLInputElement || origin instanceof HTMLSelectElement || origin instanceof HTMLTextAreaElement) {
      return;
    }
    if (!this.state.aboutOpen && !this.state.settingsOpen && !this.state.logOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = this.focusedAuxiliaryPanel(origin) || this.latestOpenAuxiliaryPanel();
    if (panel) this.closeAuxiliaryPanel(panel, true);
  }

  private handleGlobalPointerdown(event: PointerEvent): void {
    if (!this.modelMenuOpen) return;
    const modelSetting = this.shadow.querySelector<HTMLElement>('.kmh-model-setting');
    if (modelSetting && event.composedPath().includes(modelSetting)) return;
    this.setModelMenuOpen(false);
  }

  private saveSettingsFromForm(): void {
    const next = readSettingsFromForm(this.shadow, this.state.config);
    if (next.provider === 'anthropic' && next.thinkingMode === 'enabled' && next.maxTokens < 2048) {
      this.setSettingsFeedback('Anthropic 开启思考时，最大输出 token 至少需要 2048，建议使用 2400 或更高。', true);
      this.shadow.querySelector<HTMLInputElement>('[data-setting="maxTokens"]')?.focus();
      return;
    }
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
    this.setSettingsOpen(false);
    this.render();
    window.requestAnimationFrame(() => {
      this.shadow.querySelector<HTMLButtonElement>('[data-role="settings-trigger"]')?.focus();
    });
  }

  private setSettingsFeedback(message: string, error = false): void {
    const feedback = this.shadow.querySelector<HTMLElement>('[data-role="settings-feedback"]');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.dataset.tone = error ? 'error' : 'success';
  }

  private disableCurrentHost(): void {
    this.abortModelCatalogFetch();
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

function readAboutTab(value: string | undefined): AboutTab {
  if (value === 'quickstart' || value === 'practices' || value === 'privacy') return value;
  return 'overview';
}

function modelCatalogSource(provider: Provider, baseUrl: string): string {
  return `${provider}|${String(baseUrl || '').trim().replace(/\/+$/, '')}`;
}

function modelCatalogErrorMessage(error: unknown): string {
  if (!isModelCatalogError(error)) {
    return error instanceof Error ? error.message : '获取模型列表失败，请检查接口配置。';
  }
  if (error.code === 'missing_base_url') return '请先填写 Base URL，也可以继续手工输入模型。';
  if (error.code === 'missing_api_key') return '请先填写 API Key，也可以继续手工输入模型。';
  if (error.code === 'invalid_base_url') return 'Base URL 必须是有效的 HTTP(S) 地址。';
  if (error.code === 'unauthorized') return 'API Key 无效或模型列表接口未授权。';
  if (error.code === 'forbidden') return '当前 API Key 无权读取模型列表。';
  if (error.code === 'not_found') return '服务未提供常见模型列表接口，请继续手工输入模型。';
  if (error.code === 'rate_limited') return '模型列表请求过于频繁，请稍后重试。';
  if (error.code === 'invalid_response') return '模型列表响应格式无法识别，请继续手工输入模型。';
  if (error.code === 'empty_catalog') return '服务返回了空模型列表，请继续手工输入模型。';
  if (error.code === 'timeout') return '获取模型列表超时，请稍后重试。';
  if (error.code === 'network') return '无法连接模型列表接口，请检查网络与 Base URL。';
  return error.message || '获取模型列表失败，请继续手工输入模型。';
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
