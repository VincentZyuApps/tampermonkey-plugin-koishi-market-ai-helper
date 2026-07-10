export type IconName = 'info' | 'log';

export function renderIcon(name: IconName): string {
  if (name === 'info') return infoIcon();
  if (name === 'log') return logIcon();
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
