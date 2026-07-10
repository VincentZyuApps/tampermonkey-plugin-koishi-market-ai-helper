export const baseStyles = `
  :host {
    all: initial;
    color-scheme: light dark;
    --kmh-bg: Canvas;
    --kmh-panel: Canvas;
    --kmh-text: CanvasText;
    --kmh-muted: color-mix(in srgb, CanvasText 62%, transparent);
    --kmh-border: color-mix(in srgb, CanvasText 16%, transparent);
    --kmh-accent: var(--kmh-brand);
    --kmh-accent-soft: color-mix(in srgb, var(--kmh-brand) 13%, Canvas);
    --kmh-danger: color-mix(in srgb, var(--kmh-brand-strong) 70%, #ffffff);
    --kmh-shadow: 0 18px 48px rgba(0, 0, 0, .22);
    --kmh-inner-highlight: inset 0 1px 0 rgba(255, 255, 255, .32);
    --kmh-inner-press: inset 0 -1px 0 rgba(0, 0, 0, .12);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; }
  .kmh-bubble {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 2147483647;
    width: 56px;
    height: 56px;
    border: 1px solid color-mix(in srgb, white 24%, var(--kmh-brand));
    border-radius: 18px;
    color: white;
    background: var(--kmh-brand);
    box-shadow: var(--kmh-shadow), var(--kmh-inner-highlight), var(--kmh-inner-press);
    cursor: pointer;
  }
  .kmh-bubble-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-weight: 800;
    letter-spacing: 0;
  }
  .kmh-stack {
    position: fixed;
    right: 22px;
    bottom: 22px;
    z-index: 2147483647;
    width: 380px;
    height: 560px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }
`;
