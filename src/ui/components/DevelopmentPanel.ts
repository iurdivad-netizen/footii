import { attributeTimeline } from '../../core/career/attributeTimeline.ts';
import type { CareerState } from '../../core/career/career.ts';
import { POSITION_PROFILES, keyAttributesFor } from '../../core/player/positions.ts';
import { windowAcross } from '../../simulation/DecisionBenchmark.ts';
import { escapeHtml, renderDevelopment } from '../developmentView.ts';
import type { RenderedDevelopment, Tip } from '../developmentView.ts';

/**
 * THE DEVELOPMENT PANEL — the "Key attributes" card, opened.
 *
 * A dialog rather than a screen: it is a look at the same career, not a place to
 * go, and a screen would mean the hub tearing itself down to show one card and
 * rebuilding, scrolled to the top, on the way back.
 *
 * ALL OF THE DRAWING IS IN developmentView.ts. This file is only what needs a
 * DOM: focus, the keyboard, the tooltip, and the two switches.
 *
 * THE DIALOG CONTRACT, which is easy to get half of: focus moves in when it
 * opens and back to the card that opened it when it closes; Tab cannot leave it;
 * Escape and the backdrop close it; the page behind stops scrolling. A modal that
 * only LOOKS modal leaves a keyboard user tabbing through a hub they cannot see.
 *
 * THE TOOLTIP ENHANCES AND NEVER GATES. Every value it shows is also in the row's
 * spoken label or the table view, and it appears on keyboard focus exactly as on
 * hover. Its text is written with `textContent`, because a club or a player's
 * name is data and data does not get to be markup.
 */

export interface DevelopmentPanelOptions {
  state: CareerState;
  clubName: (id: string) => string;
  onClose: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class DevelopmentPanel {
  readonly element: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly opener: HTMLElement | null;
  private filter: 'all' | 'key' = 'all';
  private view: 'chart' | 'table' = 'chart';
  private rendered: RenderedDevelopment | null = null;
  /** The season the arrow keys are on, for the line chart. */
  private chartIndex = 0;
  private closed = false;
  /**
   * Whether the screen is narrow enough for the compact chart. Asked of the
   * browser rather than measured, and listened to, so turning a phone sideways
   * redraws the chart at the size it is now going to be shown.
   */
  private readonly narrow: MediaQueryList | null =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null;
  private readonly onNarrow = (): void => this.render();
  private readonly onKey = (event: KeyboardEvent): void => this.handleKey(event);

  constructor(private readonly options: DevelopmentPanelOptions) {
    const { player } = options.state;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const positionLabel = POSITION_PROFILES[player.position].label;

    this.element = document.createElement('div');
    this.element.className = 'dev-overlay';
    this.element.innerHTML = `
      <div class="dev-panel" role="dialog" aria-modal="true" aria-labelledby="dev-title">
        <header class="dev-head">
          <div>
            <h2 id="dev-title">${escapeHtml(player.name)}</h2>
            <p class="dev-sub">${escapeHtml(positionLabel)} · age ${player.age} · development across the career</p>
          </div>
          <button type="button" class="ghost dev-close">Close</button>
        </header>
        <div class="dev-filters">
          <div class="dev-seg" role="group" aria-label="Attributes shown">
            <button type="button" data-filter="all" aria-pressed="true">All attributes</button>
            <button type="button" data-filter="key" aria-pressed="false">Key for a ${escapeHtml(positionLabel.toLowerCase())}</button>
          </div>
          <div class="dev-seg" role="group" aria-label="How to show it">
            <button type="button" data-view="chart" aria-pressed="true">Chart</button>
            <button type="button" data-view="table" aria-pressed="false">Table</button>
          </div>
        </div>
        <div class="dev-body"></div>
        <div class="dev-tooltip" role="tooltip" hidden></div>
      </div>`;

    this.panel = this.element.querySelector<HTMLElement>('.dev-panel')!;
    this.body = this.element.querySelector<HTMLElement>('.dev-body')!;
    this.tooltip = this.element.querySelector<HTMLElement>('.dev-tooltip')!;

    this.element
      .querySelector<HTMLButtonElement>('.dev-close')!
      .addEventListener('click', () => this.close());
    // The backdrop, and only the backdrop: a click that lands on the panel and
    // ends on the backdrop after a drag is not a request to close.
    this.element.addEventListener('pointerdown', (event) => {
      if (event.target === this.element) this.close();
    });
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
      button.addEventListener('click', () => {
        this.filter = button.dataset.filter as 'all' | 'key';
        this.syncSwitches();
        this.render();
      });
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.addEventListener('click', () => {
        this.view = button.dataset.view as 'chart' | 'table';
        this.syncSwitches();
        this.render();
      });
    }

    this.render();
  }

  /** Put it on the page, move focus in, and stop the page behind scrolling. */
  open(): void {
    document.body.appendChild(this.element);
    document.body.classList.add('dev-open');
    document.addEventListener('keydown', this.onKey);
    this.narrow?.addEventListener('change', this.onNarrow);
    this.element.querySelector<HTMLButtonElement>('.dev-close')!.focus();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener('keydown', this.onKey);
    this.narrow?.removeEventListener('change', this.onNarrow);
    document.body.classList.remove('dev-open');
    this.element.remove();
    // Back to the card that opened it, so the keyboard picks up where it left off.
    this.opener?.focus();
    this.options.onClose();
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    // A trap: Tab and Shift+Tab wrap inside the panel instead of leaving it.
    const stops = [...this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.hidden && node.getClientRects().length > 0,
    );
    if (stops.length === 0) return;
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !this.panel.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !this.panel.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  private syncSwitches(): void {
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === this.filter));
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === this.view));
    }
  }

  private render(): void {
    const { state, clubName } = this.options;
    const timeline = attributeTimeline(state);
    const scroll = this.panel.scrollTop;
    this.hideTip();

    this.rendered = renderDevelopment({
      name: state.player.name,
      positionLabel: POSITION_PROFILES[state.player.position].label,
      keyKeys: keyAttributesFor(state.player.position),
      timeline,
      windows: windowAcross(state.player, timeline.points),
      clubName,
      filter: this.filter,
      view: this.view,
      compact: this.narrow?.matches ?? false,
    });
    this.body.innerHTML = this.rendered.html;
    this.chartIndex = this.rendered.chartPoints - 1;
    this.bindHover();
    this.panel.scrollTop = scroll;
  }

  private bindHover(): void {
    for (const node of this.body.querySelectorAll<HTMLElement | SVGElement>('[data-tip]')) {
      node.addEventListener('pointerenter', (event) => this.showTip(node, event as PointerEvent));
      node.addEventListener('pointermove', (event) => this.moveTip(event as PointerEvent));
      node.addEventListener('pointerleave', () => this.hideTip());
      node.addEventListener('focus', () => this.showTip(node));
      node.addEventListener('blur', () => this.hideTip());
    }

    // The line chart is one tab stop with the arrow keys walking its seasons —
    // seventeen tab stops for one picture would be a chore, and the keyboard
    // must see what the hover sees.
    const wrap = this.body.querySelector<HTMLElement>('.dev-chart-wrap');
    if (!wrap) return;
    wrap.addEventListener('focus', () => this.showChartPoint(this.chartIndex));
    wrap.addEventListener('blur', () => this.hideTip());
    wrap.addEventListener('keydown', (event) => {
      const last = (this.rendered?.chartPoints ?? 1) - 1;
      const next =
        event.key === 'ArrowLeft'
          ? Math.max(0, this.chartIndex - 1)
          : event.key === 'ArrowRight'
            ? Math.min(last, this.chartIndex + 1)
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? last
                : null;
      if (next === null) return;
      event.preventDefault();
      this.chartIndex = next;
      this.showChartPoint(next);
    });
  }

  /** The line chart's readout for one season, from the keyboard. */
  private showChartPoint(index: number): void {
    const hit = this.body.querySelector<SVGElement>(`.dev-hit[data-index="${index}"]`);
    if (hit) this.showTip(hit);
  }

  private showTip(node: Element, event?: PointerEvent): void {
    const tip: Tip | undefined = this.rendered?.tips[node.getAttribute('data-tip') ?? ''];
    if (!tip) return;

    // Built with textContent throughout: see the note at the top.
    this.tooltip.replaceChildren();
    const title = document.createElement('div');
    title.className = 'dev-tip-title';
    title.textContent = tip.title;
    this.tooltip.append(title);
    for (const row of tip.rows) {
      const line = document.createElement('div');
      line.className = `dev-tip-row${row.strong ? ' strong' : ''}`;
      // Values lead: the reader already has the row and wants the number.
      const value = document.createElement('b');
      value.textContent = row.value;
      const label = document.createElement('span');
      label.textContent = row.label;
      line.append(value, label);
      this.tooltip.append(line);
    }
    this.tooltip.hidden = false;

    this.markChart(node);
    const box = node.getBoundingClientRect();
    this.placeTip(event?.clientX ?? box.left + box.width / 2, event?.clientY ?? box.top);
  }

  private moveTip(event: PointerEvent): void {
    if (!this.tooltip.hidden) this.placeTip(event.clientX, event.clientY);
  }

  /** Beside the pointer, and kept on the screen. */
  private placeTip(x: number, y: number): void {
    const width = this.tooltip.offsetWidth;
    const height = this.tooltip.offsetHeight;
    const margin = 12;
    const left = Math.min(Math.max(margin, x + 14), window.innerWidth - width - margin);
    const flipUp = y + 18 + height > window.innerHeight - margin;
    const top = flipUp ? Math.max(margin, y - height - 14) : y + 18;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  private hideTip(): void {
    this.tooltip.hidden = true;
    const cross = this.body.querySelector<SVGLineElement>('.dev-cross');
    if (cross) cross.setAttribute('hidden', '');
    for (const marker of this.body.querySelectorAll('.dev-marker.active')) {
      marker.classList.remove('active');
    }
  }

  /** The crosshair snaps to the season, and its marker lifts. */
  private markChart(node: Element): void {
    const index = node.getAttribute('data-index');
    if (index === null) return;
    const marker = this.body.querySelector<SVGCircleElement>(`.dev-marker[data-marker="${index}"]`);
    const cross = this.body.querySelector<SVGLineElement>('.dev-cross');
    for (const other of this.body.querySelectorAll('.dev-marker.active')) {
      other.classList.remove('active');
    }
    if (marker && cross) {
      const x = marker.getAttribute('cx')!;
      cross.setAttribute('x1', x);
      cross.setAttribute('x2', x);
      cross.removeAttribute('hidden');
      marker.classList.add('active');
    }
  }
}
