export const logStyles = `
  .kmh-log {
    position: fixed;
    right: 390px;
    bottom: 36px;
    z-index: 2147483646;
    width: 332px;
    max-width: calc(100vw - 72px);
    max-height: 500px;
    border: 1px solid var(--kmh-border);
    border-right: 0;
    border-radius: 9px 0 0 9px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    color: var(--kmh-text);
    background: var(--kmh-accent-soft);
    box-shadow: -10px 10px 28px rgba(0,0,0,.12), inset 0 1px 0 color-mix(in srgb, white 34%, transparent);
    opacity: 0;
    pointer-events: none;
    transform: translateX(30px) scale(.985);
    transform-origin: right bottom;
    transition:
      opacity 180ms ease,
      transform 260ms cubic-bezier(.22, 1, .36, 1);
    will-change: opacity, transform;
  }
  .kmh-log.kmh-back-open {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0) scale(1);
  }
  .kmh-back-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    padding: 8px 10px;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--kmh-border);
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 32%, transparent);
  }
  .kmh-log-tools {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;
    width: 100%;
  }
  .kmh-log-tools label {
    display: grid;
    grid-template-columns: auto minmax(82px, 1fr);
    align-items: center;
    gap: 4px;
    min-width: 0;
    color: var(--kmh-muted);
    font-size: 11px;
  }
  .kmh-log-tools .kmh-secondary {
    min-height: 28px;
    white-space: nowrap;
  }
  .kmh-log-tools input {
    width: 100%;
    min-width: 0;
    height: 28px;
    padding: 0 6px;
    color: var(--kmh-text);
    background: Canvas;
    border: 1px solid var(--kmh-border);
    border-radius: 6px;
    outline: none;
    box-shadow: inset 0 1px 2px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.16);
  }
  .kmh-log-tools input:focus {
    border-color: var(--kmh-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--kmh-accent) 24%, transparent);
  }
  .kmh-back-title { font-size: 12px; font-weight: 750; }
  .kmh-back-subtitle {
    max-width: 100%;
    margin-top: 2px;
    overflow: hidden;
    color: var(--kmh-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }
  .kmh-log-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; }
  .kmh-log-entry { border-top: 1px solid var(--kmh-border); padding: 6px 0; font-size: 11px; }
  .kmh-log-entry:first-of-type { border-top: 0; }
  .kmh-log-line { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 6px; align-items: baseline; }
  .kmh-log-level {
    color: white;
    background: var(--kmh-brand);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-weight: 700;
  }
  .kmh-log-warn .kmh-log-level, .kmh-log-error .kmh-log-level { background: var(--kmh-brand-strong); }
  .kmh-log-time { color: var(--kmh-muted); }
  .kmh-log-message {
    min-width: 0;
    overflow: hidden;
    color: var(--kmh-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kmh-log-entry pre {
    margin: 5px 0 0;
    max-height: 120px;
    overflow: auto;
    padding: 6px;
    border-radius: 6px;
    color: var(--kmh-muted);
    background: color-mix(in srgb, var(--kmh-brand) 8%, Canvas);
    box-shadow: inset 0 1px 2px rgba(0,0,0,.08);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .kmh-log-empty { color: var(--kmh-muted); font-size: 12px; }
`;
