import { baseStyles } from './baseStyles';
import { composeStyles } from './composeStyles';
import { logStyles } from './logStyles';
import { messageStyles } from './messageStyles';
import { mobileStyles } from './mobileStyles';
import { panelStyles } from './panelStyles';
import { settingsStyles } from './settingsStyles';

export function styles(): string {
  return [
    baseStyles,
    panelStyles,
    settingsStyles,
    messageStyles,
    logStyles,
    composeStyles,
    mobileStyles,
  ].join('\n');
}
