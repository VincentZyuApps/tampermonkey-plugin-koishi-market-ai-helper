export type IconName = 'info' | 'log' | 'refresh' | 'chevron-down';

export function renderIcon(name: IconName): string {
  if (name === 'info') return infoIcon();
  if (name === 'log') return logIcon();
  if (name === 'refresh') return refreshIcon();
  if (name === 'chevron-down') return chevronDownIcon();
  return '';
}

function infoIcon(): string {
  return `
    <svg class="kmh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 10v7"></path>
      <path d="M12 7h.01"></path>
    </svg>
  `;
}

function logIcon(): string {
  return `
    <svg class="kmh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3h7l4 4v14H7z"></path>
      <path d="M14 3v5h4"></path>
      <path d="M10 12h6"></path>
      <path d="M10 16h6"></path>
      <path d="M5 7v14"></path>
    </svg>
  `;
}

function refreshIcon(): string {
  return `
    <svg class="kmh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 11a8 8 0 1 0-2.3 5.7"></path>
      <path d="M20 4v7h-7"></path>
    </svg>
  `;
}

function chevronDownIcon(): string {
  return `
    <svg class="kmh-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  `;
}
