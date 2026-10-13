import { audio } from '../core/audio';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'disabled') (el as HTMLButtonElement).disabled = Boolean(v);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export interface ButtonOpts {
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  key?: string;
  icon?: string;
  title?: string;
  class?: string;
  sound?: boolean;
}

export function button(label: string, onClick: () => void, o: ButtonOpts = {}) {
  const cls = ['btn', o.primary && 'primary', o.danger && 'danger', o.small && 'small', o.class].filter(Boolean).join(' ');
  return h(
    'button',
    {
      class: cls,
      disabled: o.disabled,
      title: o.title,
      onclick: (e: Event) => {
        e.preventDefault();
        if (o.sound !== false) audio.play('click');
        onClick();
      },
    },
    o.icon ? h('span', { class: 'ico', html: o.icon }) : null,
    h('span', { class: 'lbl' }, label),
    o.key ? h('kbd', {}, o.key) : null,
  );
}

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  trade: svg('<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'),
  outfit: svg('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  ship: svg('<path d="M12 2l4 9-4 11-4-11z"/><path d="M8 11l-5 6h5"/><path d="M16 11l5 6h-5"/>'),
  missions: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6M9 14h6M9 18h3"/>'),
  bar: svg('<path d="M6 3h12l-6 8z"/><path d="M12 11v8"/><path d="M8 21h8"/>'),
  fuel: svg('<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/><path d="M7 7h5v4H7z"/>'),
  map: svg('<path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3z"/><path d="M9 3v15M15 6v15"/>'),
  launch: svg('<path d="M12 3v14"/><path d="M6 9l6-6 6 6"/><path d="M5 21h14"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.3-2.4 3.8"/><path d="M12 17.2v.3"/>'),
  soundOn: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/>'),
};

export function panel(title: string, onClose: (() => void) | null, ...content: (Child | Child[])[]) {
  return h(
    'div',
    { class: 'panel' },
    h(
      'header',
      { class: 'panel-head' },
      h('h2', {}, title),
      onClose ? h('button', { class: 'icon-btn', title: 'Close (Esc)', html: ICONS.close, onclick: () => { audio.play('click'); onClose(); } }) : null,
    ),
    h('div', { class: 'panel-body' }, ...content),
  );
}

export function stat(label: string, value: string | number, cls = '') {
  return h('div', { class: `stat ${cls}` }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, String(value)));
}

/** replaceChildren that skips null/false entries. */
export function setChildren(el: Element, ...children: (Node | string | null | undefined | false)[]) {
  el.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false));
}
