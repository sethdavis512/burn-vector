import { audio } from '../core/audio';
import type { PlanetDef } from '../data/types';
import type { Completion } from '../game/economy';
import type { Ship } from '../game/entities';
import type { Game } from '../game/game';
import type { StartOption } from '../game/player';
import { showBoarding, showHail, showInfo, showPause, showPlanetHail, showWelcome } from './dialogs';
import { ICONS, button, h } from './dom';
import { openHelp, type HelpTab } from './help';
import { openMap } from './map';
import { renderSpaceport } from './spaceport';
import { renderTitle } from './title';

interface ModalEntry {
  el: HTMLElement;
  onEsc: (() => void) | null;
  keys?: (e: KeyboardEvent) => boolean;
  /** Custom teardown (native dialogs close instead of just being removed). */
  dispose?: () => void;
}

export interface DialogButton {
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Keep the dialog open after clicking. */
  keep?: boolean;
  onClick: () => void;
}

export interface DialogOpts {
  title: string;
  body: string | Node;
  buttons: DialogButton[];
  /** Escape closes the dialog without choosing. */
  cancelable?: boolean;
  wide?: boolean;
  portrait?: Node;
}

export class UI {
  game: Game;
  root: HTMLElement;
  private screen: HTMLElement | null = null;
  private screenKeys: ((e: KeyboardEvent) => boolean) | null = null;
  private stack: ModalEntry[] = [];
  /** Rebuilds dynamic bits of the current screen (e.g. the spaceport footer). */
  refreshScreen: (() => void) | null = null;
  private soundBtn: HTMLButtonElement;
  private closeHelp: (() => void) | null = null;

  constructor(game: Game, root: HTMLElement) {
    this.game = game;
    this.root = root;
    // These live outside #ui so screen changes never remove them, and sit above every panel.
    // They never take focus, so Space in flight can't press them.
    const noFocus = (e: Event) => e.preventDefault();
    this.soundBtn = h('button', { class: 'hud-btn sound-toggle', tabindex: '-1', onmousedown: noFocus, onclick: () => this.toggleSound() });
    const helpBtn = h('button', {
      class: 'hud-btn help-btn',
      tabindex: '-1',
      title: "Pilot's handbook (?)",
      'aria-label': "Open the pilot's handbook",
      html: ICONS.help,
      onmousedown: noFocus,
      onclick: () => this.showHelp(),
    });
    document.body.append(h('div', { class: 'hud-btns' }, this.soundBtn, helpBtn));
    this.syncSoundButton(audio.muted);
    audio.onMuteChange((m) => this.syncSoundButton(m));
  }

  showHelp(tab?: HelpTab) {
    if (this.closeHelp) return;
    const close = openHelp(this, tab);
    this.closeHelp = () => {
      this.closeHelp = null;
      close();
    };
  }

  toggleHelp() {
    if (this.closeHelp) this.closeHelp();
    else this.showHelp();
  }

  toggleSound() {
    const muted = audio.toggleMuted();
    this.toast(muted ? 'Sound off · press V to turn it back on' : 'Sound on');
  }

  private syncSoundButton(muted: boolean) {
    this.soundBtn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.soundBtn.classList.toggle('off', muted);
    const label = muted ? 'Sound is off (V to turn on)' : 'Sound is on (V to mute)';
    this.soundBtn.title = label;
    this.soundBtn.setAttribute('aria-label', label);
    for (const el of document.querySelectorAll('.title-sound')) el.toggleAttribute('hidden', !muted);
  }

  setScreen(el: HTMLElement, keys?: (e: KeyboardEvent) => boolean) {
    this.clearScreen();
    this.screen = el;
    this.screenKeys = keys ?? null;
    this.root.prepend(el);
  }

  clearScreen() {
    this.screen?.remove();
    this.screen = null;
    this.screenKeys = null;
    this.refreshScreen = null;
  }

  pushModal(el: HTMLElement, onEsc: (() => void) | null, keys?: (e: KeyboardEvent) => boolean): () => void {
    const wrap = h('div', { class: 'modal-wrap' }, el);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap && onEsc) onEsc();
    });
    const entry: ModalEntry = { el: wrap, onEsc, keys };
    this.register(entry);
    this.root.append(wrap);
    const first = el.querySelector<HTMLElement>('input, .btn.primary');
    if (first instanceof HTMLInputElement) setTimeout(() => first.focus(), 30);
    return () => this.removeModal(entry);
  }

  private register(entry: ModalEntry) {
    this.stack.push(entry);
    if (this.game.mode === 'space' || this.game.mode === 'dead') this.game.setPaused(true);
  }

  /** Show a native <dialog> modally, wired into the same pause/keyboard stack as other panels. */
  openNativeDialog(dlg: HTMLDialogElement, keys?: (e: KeyboardEvent) => boolean): () => void {
    const entry: ModalEntry = {
      el: dlg,
      onEsc: () => close(),
      keys,
      dispose: () => {
        if (dlg.open) dlg.close();
        dlg.remove();
      },
    };
    const close = () => {
      if (this.stack.includes(entry)) this.removeModal(entry);
      if (this.closeHelp && entry.el.classList.contains('help-dialog')) this.closeHelp = null;
    };
    this.register(entry);
    document.body.append(dlg);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dlg.addEventListener('close', () => close());
    // Clicks on the backdrop land on the <dialog> itself; content clicks land on its children.
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close();
    });
    dlg.showModal();
    return close;
  }

  private removeModal(entry: ModalEntry) {
    const i = this.stack.indexOf(entry);
    if (i < 0) return;
    this.stack.splice(i, 1);
    if (entry.dispose) entry.dispose();
    else entry.el.remove();
    if (!this.stack.length && this.game.mode === 'space') this.game.setPaused(false);
    this.refreshScreen?.();
  }

  closeTop() {
    const top = this.stack[this.stack.length - 1];
    if (top) this.removeModal(top);
  }

  closeAll() {
    const entries = [...this.stack];
    this.stack = [];
    for (const m of entries) {
      if (m.dispose) m.dispose();
      else m.el.remove();
    }
    this.closeHelp = null;
    this.clearScreen();
    this.game.setPaused(false);
  }

  hasModal() {
    return this.stack.length > 0;
  }

  handleKey(e: KeyboardEvent): boolean {
    const top = this.stack[this.stack.length - 1];
    if (top) {
      if (top.keys?.(e)) return true;
      if (e.code === 'Escape' && top.onEsc) {
        top.onEsc();
        return true;
      }
      return !['ShiftLeft', 'ShiftRight'].includes(e.code);
    }
    if (this.screenKeys?.(e)) return true;
    return this.game.mode === 'title' || this.game.mode === 'landed';
  }

  dialog(o: DialogOpts): () => void {
    let close = () => {};
    const btns = o.buttons.map((b) =>
      button(
        b.label,
        () => {
          if (!b.keep) close();
          b.onClick();
        },
        { primary: b.primary, danger: b.danger, disabled: b.disabled },
      ),
    );
    const body = typeof o.body === 'string' ? h('p', {}, o.body) : o.body;
    const el = h(
      'div',
      { class: `dialog${o.wide ? ' wide' : ''}` },
      h('h2', {}, o.title),
      h('div', { class: 'dialog-main' }, o.portrait ? h('div', { class: 'dialog-portrait' }, o.portrait) : null, h('div', { class: 'dialog-body' }, body)),
      h('div', { class: 'dialog-buttons' }, ...btns),
    );
    close = this.pushModal(el, o.cancelable ? () => close() : null, (e) => {
      if (e.code === 'Enter') {
        const primary = o.buttons.find((b) => b.primary && !b.disabled);
        if (primary) {
          audio.play('click');
          if (!primary.keep) close();
          primary.onClick();
          return true;
        }
      }
      return false;
    });
    return close;
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info') {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.root.append(el);
    setTimeout(() => el.classList.add('out'), 1800);
    setTimeout(() => el.remove(), 2300);
  }

  showTitle() {
    audio.setMusic('title');
    renderTitle(this);
  }

  showSpaceport(p: PlanetDef, done: Completion[]) {
    renderSpaceport(this, p, done);
  }

  showWelcome(start: StartOption) {
    showWelcome(this, start);
  }

  showMap() {
    openMap(this);
  }

  showInfo() {
    showInfo(this);
  }

  showPause() {
    showPause(this);
  }

  showHail(t: Ship) {
    showHail(this, t);
  }

  showPlanetHail(p: PlanetDef) {
    showPlanetHail(this, p);
  }

  showBoarding(t: Ship) {
    showBoarding(this, t);
  }
}
