import { CATEGORY_LABELS } from '../app/appConstants';
import { providerLabel } from '../app/appConfig';
import { escapeAttr, escapeHtml, formatContent } from '../shared/htmlUtils';
import { renderIcon } from './iconRender';
import type { AppState, LogEntry, Message, PluginSummary } from '../types/appTypes';

export function renderBubble(): string {
  return `
    <button class="kmh-bubble" type="button" data-action="expand" title="Koishi AI 插件搜索助手">
      <span class="kmh-bubble-mark">AI✨</span>
    </button>
  `;
}

export function renderPanel(state: AppState, apiKey: string): string {
  return `
    ${renderAbout(state)}
    ${renderSettings(state, apiKey)}
    ${renderLogs(state)}
    <div class="kmh-stack">
      <section class="kmh-panel" aria-label="Koishi AI 插件搜索助手">
        <header class="kmh-header">
          <div class="kmh-title-wrap">
            <button class="kmh-icon-btn kmh-about-btn" type="button" data-action="toggle-about" title="${state.aboutOpen ? '关闭关于' : '打开关于和快捷键说明'}" aria-label="${state.aboutOpen ? '关闭关于' : '打开关于和快捷键说明'}">${renderIcon('info')}</button>
            <div>
              <div class="kmh-title">🔍 Koishi 插件 AI 搜索</div>
              <div class="kmh-subtitle">🤖 ${escapeHtml(providerLabel(state.config.provider))} · 🧭 召回 ${escapeHtml(String(state.config.recallLimit))}</div>
            </div>
          </div>
          <div class="kmh-header-actions">
            <button class="kmh-icon-btn" type="button" data-action="toggle-log" title="${state.logOpen ? '向右收起日志' : '向左展开日志'}" aria-label="${state.logOpen ? '向右收起日志' : '向左展开日志'}">${renderIcon('log')}</button>
            <button class="kmh-icon-btn" type="button" data-action="toggle-settings" title="${state.settingsOpen ? '向下收起设置' : '向上展开设置'}">⚙</button>
            <button class="kmh-icon-btn" type="button" data-action="collapse" title="收回">−</button>
            <button class="kmh-icon-btn" type="button" data-action="close-page" title="本页关闭">×</button>
          </div>
        </header>
        <main class="kmh-messages" data-role="messages">
          ${state.messages.map(renderMessage).join('')}
        </main>
        ${state.notice ? `<div class="kmh-notice">${escapeHtml(state.notice)}</div>` : ''}
        <footer class="kmh-compose">
          <textarea class="kmh-input" data-role="input" rows="2" placeholder="例如：🎨 找一个 AI 绘图插件，最好支持文生图和图生图"></textarea>
          <div class="kmh-dialog-actions">
            <button class="kmh-secondary" type="button" data-action="clear-current-chat">🧹 清空当前对话</button>
            <button class="kmh-secondary" type="button" data-action="clear-all-history">🗑️ 清空所有历史</button>
          </div>
          <div class="kmh-compose-actions">
            <select class="kmh-send-mode" data-role="send-mode" title="选择回车发送方式">
              <option value="enter" ${state.sendMode === 'enter' ? 'selected' : ''}>↵ Enter发送 / Ctrl+Enter换行</option>
              <option value="ctrlEnter" ${state.sendMode === 'ctrlEnter' ? 'selected' : ''}>⌘ Ctrl+Enter发送 / Enter换行</option>
            </select>
            <button class="kmh-secondary" type="button" data-action="local-search" ${state.busy ? 'disabled' : ''}>🧭 本地搜索</button>
            <button class="kmh-primary" type="button" data-action="send" ${state.busy ? 'disabled' : ''}>${state.busy ? '🔍 搜索中…' : '🚀 发送'}</button>
          </div>
        </footer>
      </section>
    </div>
  `;
}

function renderAbout(state: AppState): string {
  return `
    <section class="kmh-about ${state.aboutOpen ? 'kmh-about-open' : 'kmh-about-closed'}" aria-hidden="${state.aboutOpen ? 'false' : 'true'}" ${state.aboutOpen ? '' : 'inert'}>
      <div class="kmh-about-head">
        <div>
          <div class="kmh-about-title">ℹ️ 关于</div>
          <div class="kmh-about-subtitle">⌨️ 快捷键与 🔐 隐私提示</div>
        </div>
        <button class="kmh-secondary" type="button" data-action="toggle-about">✕ 关闭</button>
      </div>
      <ul class="kmh-about-list">
        <li>⌨️ 发送方式可在输入框下方切换。</li>
        <li>↩️ Shift + Enter 始终换行。</li>
        <li>↵ 选择 Enter 发送时，Ctrl + Enter 用于换行。</li>
        <li>⌘ 选择 Ctrl + Enter 发送时，Enter 用于换行。</li>
        <li>🧭 本地搜索不会请求 LLM，只使用插件 registry 元数据。</li>
        <li>🤖 启用 LLM 时，搜索需求会发送到你配置的 API。</li>
      </ul>
    </section>
  `;
}

function renderSettings(state: AppState, apiKey: string): string {
  return `
    <section class="kmh-settings ${state.settingsOpen ? 'kmh-back-open' : 'kmh-back-closed'}" aria-hidden="${state.settingsOpen ? 'false' : 'true'}" ${state.settingsOpen ? '' : 'inert'}>
      <div class="kmh-settings-actions">
        <button class="kmh-primary" type="button" data-action="save-settings">💾 保存设置</button>
        <button class="kmh-secondary" type="button" data-action="disable-host">🚫 在此站点禁用</button>
        <button class="kmh-secondary" type="button" data-action="clear-history">🗑️ 清空历史</button>
      </div>
      <div class="kmh-settings-grid">
        <label>
          <span>🤖 提供商</span>
          <select data-setting="provider">
            <option value="openai" ${state.config.provider === 'openai' ? 'selected' : ''}>OpenAI-compatible</option>
            <option value="anthropic" ${state.config.provider === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          </select>
        </label>
        <label>
          <span>🌐 Base URL</span>
          <input data-setting="baseUrl" value="${escapeAttr(state.config.baseUrl)}" placeholder="https://api.deepseek.com">
        </label>
        <label>
          <span>🧠 模型</span>
          <input data-setting="model" value="${escapeAttr(state.config.model)}" placeholder="deepseek-v4-flash">
        </label>
        <label>
          <span>🔑 API key</span>
          <input data-setting="apiKey" type="password" value="${escapeAttr(apiKey)}" placeholder="sk-...">
        </label>
        <label>
          <span>🧭 本地召回数量</span>
          <input data-setting="recallLimit" type="number" min="5" max="80" value="${escapeAttr(String(state.config.recallLimit))}">
        </label>
        <label>
          <span>📏 最大输出 token</span>
          <input data-setting="maxTokens" type="number" min="300" max="8000" value="${escapeAttr(String(state.config.maxTokens))}">
        </label>
      </div>
      <label class="kmh-check">
        <input data-setting="persistApiKey" type="checkbox" ${state.config.persistApiKey ? 'checked' : ''}>
        <span>🔐 保存 API key 到 Tampermonkey 存储</span>
      </label>
      <label class="kmh-check">
        <input data-setting="saveHistory" type="checkbox" ${state.config.saveHistory ? 'checked' : ''}>
        <span>💬 保存聊天历史</span>
      </label>
      <label class="kmh-check">
        <input data-setting="stream" type="checkbox" ${state.config.stream ? 'checked' : ''}>
        <span>🌊 优先尝试流式输出，失败时自动非流式重试</span>
      </label>
    </section>
  `;
}

function renderLogs(state: AppState): string {
  const last = state.logs[state.logs.length - 1];
  return `
    <section class="kmh-log ${state.logOpen ? 'kmh-back-open' : 'kmh-back-closed'}" aria-hidden="${state.logOpen ? 'false' : 'true'}" ${state.logOpen ? '' : 'inert'}>
      <div class="kmh-back-header">
        <div>
          <div class="kmh-back-title">🧾 调试日志 ${state.logs.length}</div>
          <div class="kmh-back-subtitle">${last ? escapeHtml(last.message) : '📭 暂无日志'}</div>
        </div>
        <div class="kmh-log-tools">
          <label>
            <span>📋 复制上限</span>
            <input data-role="log-copy-limit" type="number" min="1" max="1000000" value="${escapeAttr(String(state.logCopyLimit))}">
          </label>
          <button class="kmh-secondary" type="button" data-action="copy-log" title="复制日志到剪贴板">📋 复制日志</button>
          <button class="kmh-secondary" type="button" data-action="clear-log">🧹 清空</button>
        </div>
      </div>
      <div class="kmh-log-body">
        ${state.logs.length ? state.logs.map(renderLogEntry).join('') : '<div class="kmh-log-empty">📭 暂无日志。</div>'}
      </div>
    </section>
  `;
}

function renderMessage(message: Message): string {
  return `
    <article class="kmh-message kmh-${message.role}">
      <div class="kmh-message-role">${message.role === 'user' ? '🧑 你' : '🤖 助手'}</div>
      <div class="kmh-message-content">${formatContent(message.content)}</div>
      ${message.cards?.length ? renderCards(message.cards) : ''}
      ${message.notes?.length ? renderNotes(message.notes) : ''}
    </article>
  `;
}

function renderNotes(notes: string[]): string {
  return `<ul class="kmh-notes">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
}

function renderCards(cards: PluginSummary[]): string {
  return `<div class="kmh-cards">${cards.map(renderCard).join('')}</div>`;
}

function renderCard(card: PluginSummary): string {
  const badges = [
    card.category ? CATEGORY_LABELS[card.category] || card.category : '',
    card.verified ? '✅ 认证' : '',
    card.downloadsLastMonth ? `📦 30日下载 ${card.downloadsLastMonth}` : '',
  ].filter(Boolean);
  return `
    <section class="kmh-card">
      <div class="kmh-card-title">${escapeHtml(card.name)}${card.version ? `<span>@${escapeHtml(card.version)}</span>` : ''}</div>
      ${badges.length ? `<div class="kmh-card-badges">${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
      ${card.description || card.reason ? `<p>${escapeHtml(card.reason || card.description)}</p>` : ''}
      ${card.warning ? `<p class="kmh-warning">${escapeHtml(card.warning)}</p>` : ''}
      <div class="kmh-card-actions">
        <button type="button" data-card-action="apply-search" data-query="${escapeAttr(card.query || card.shortname || card.name)}">🔎 填入本页</button>
        <button type="button" data-card-action="open-market" data-query="${escapeAttr(card.query || card.shortname || card.name)}">🧩 打开市场搜索</button>
        <button type="button" data-card-action="copy" data-name="${escapeAttr(card.name)}">📋 复制包名</button>
        ${card.npm ? `<button type="button" data-card-action="open-url" data-url="${escapeAttr(card.npm)}">npm</button>` : ''}
        ${card.homepage || card.repository ? `<button type="button" data-card-action="open-url" data-url="${escapeAttr(card.homepage || card.repository)}">🏠 主页/仓库</button>` : ''}
      </div>
    </section>
  `;
}

function renderLogEntry(entry: LogEntry): string {
  return `
    <article class="kmh-log-entry kmh-log-${entry.level}">
      <div class="kmh-log-line">
        <span class="kmh-log-level">${escapeHtml(entry.level.toUpperCase())}</span>
        <span class="kmh-log-time">${escapeHtml(entry.time)}</span>
        <span class="kmh-log-message">${escapeHtml(entry.message)}</span>
      </div>
      ${entry.detail ? `<pre>${escapeHtml(entry.detail)}</pre>` : ''}
    </article>
  `;
}
