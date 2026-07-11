import { DEFAULT_LOG_COPY_LIMIT, STORAGE_KEYS } from './appConstants';
import { loadConfig, loadInitialMessages } from './appConfig';
import { gmGet } from '../platform/gmBridge';
import type { AppState } from '../types/appTypes';

export function createInitialState(): AppState {
  const config = loadConfig();
  const sendMode = gmGet<string>(STORAGE_KEYS.sendMode, 'enter');
  return {
    closedForPage: false,
    collapsed: gmGet(STORAGE_KEYS.collapsed, true),
    settingsOpen: false,
    aboutOpen: false,
    aboutTab: 'overview',
    busy: false,
    notice: '',
    logOpen: false,
    logCopyLimit: gmGet(STORAGE_KEYS.logCopyLimit, DEFAULT_LOG_COPY_LIMIT),
    sendMode: sendMode === 'ctrlEnter' ? 'ctrlEnter' : 'enter',
    logs: [],
    registry: null,
    registryPromise: null,
    sessionApiKey: '',
    lastLocalResults: [],
    modelOptions: [],
    config,
    messages: loadInitialMessages(config),
  };
}
