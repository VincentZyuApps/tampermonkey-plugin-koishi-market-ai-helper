import baseStyles from './baseStyles.css?raw';
import composeStyles from './composeStyles.css?raw';
import logStyles from './logStyles.css?raw';
import messageStyles from './messageStyles.css?raw';
import mobileStyles from './mobileStyles.css?raw';
import panelStyles from './panelStyles.css?raw';
import settingsStyles from './settingsStyles.css?raw';

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
