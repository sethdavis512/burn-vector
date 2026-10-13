const CAPTURED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'Backquote',
]);

type KeyListener = (e: KeyboardEvent) => void;

/** Keyboard state for the flight loop plus a listener hook for UI shortcuts. */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private listeners: KeyListener[] = [];
  shift = false;
  /** Whether flight keys (arrows, Space, Tab) should be kept from the page. */
  capture: () => boolean = () => true;

  constructor() {
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (CAPTURED.has(e.code) && this.capture()) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.shift = e.shiftKey;
      for (const l of this.listeners) l(e);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.shift = e.shiftKey;
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.shift = false;
    });
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  anyDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  onKey(fn: KeyListener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  endFrame() {
    this.pressed.clear();
  }

  clear() {
    this.down.clear();
    this.pressed.clear();
  }
}
