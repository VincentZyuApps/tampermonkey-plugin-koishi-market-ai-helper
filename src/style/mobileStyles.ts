export const mobileStyles = `
  @media (max-width: 520px) {
    .kmh-stack {
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
      height: min(680px, calc(100vh - 16px));
    }
    .kmh-panel { border-radius: 8px; }
    .kmh-settings, .kmh-log {
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      border: 1px solid var(--kmh-border);
      border-radius: 8px;
    }
    .kmh-settings { bottom: min(624px, calc(100vh - 72px)); }
    .kmh-log { bottom: 8px; transform: translateY(calc(-100% - 8px)) translateX(24px) scale(.985); }
    .kmh-log.kmh-back-open { transform: translateY(calc(-100% - 8px)) translateX(0) scale(1); }
    .kmh-bubble { right: 14px; bottom: 14px; }
    .kmh-settings-grid { grid-template-columns: 1fr; }
    .kmh-about { left: 8px; top: 8px; width: calc(100vw - 16px); max-width: calc(100vw - 16px); }
    .kmh-send-mode { max-width: 100%; flex: 1 1 150px; }
  }
`;
