export const settingsStyles = `
  .kmh-settings {
    position: fixed;
    right: 34px;
    bottom: 540px;
    z-index: 2147483646;
    width: 356px;
    max-width: calc(100vw - 48px);
    max-height: min(360px, calc(100vh - 96px));
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--kmh-border);
    border-bottom: 0;
    border-radius: 9px 9px 0 0;
    background: var(--kmh-accent-soft);
    box-shadow: 0 -10px 28px rgba(0,0,0,.12), inset 0 1px 0 color-mix(in srgb, white 36%, transparent);
    opacity: 0;
    pointer-events: none;
    transform: translateY(26px) scale(.985);
    transform-origin: right bottom;
    transition:
      opacity 180ms ease,
      transform 260ms cubic-bezier(.22, 1, .36, 1);
    will-change: opacity, transform;
  }
  .kmh-settings.kmh-back-open {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0) scale(1);
  }
  .kmh-settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
  .kmh-settings label, .kmh-check {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    font-size: 12px;
    color: var(--kmh-muted);
  }
  .kmh-check { flex-direction: row; align-items: center; margin-top: 8px; }
  .kmh-settings input:not([type="checkbox"]), .kmh-settings select, .kmh-input {
    color: var(--kmh-text);
    background: Canvas;
    border: 1px solid var(--kmh-border);
    outline: none;
    box-shadow: inset 0 1px 2px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.16);
  }
  .kmh-settings input:not([type="checkbox"]), .kmh-settings select {
    width: 100%;
    height: 30px;
    min-width: 0;
    border-radius: 6px;
    padding: 0 8px;
  }
  .kmh-settings input:focus, .kmh-settings select:focus, .kmh-input:focus {
    border-color: var(--kmh-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--kmh-accent) 24%, transparent);
  }
  .kmh-settings-actions {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 8px;
    background: var(--kmh-accent-soft);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--kmh-accent) 18%, transparent);
  }
`;
