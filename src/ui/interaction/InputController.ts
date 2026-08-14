/**
 * Keyboard input for the interactive event.
 *
 * Responsiveness is a design requirement, so this listens on `keydown` with no
 * debouncing or animation gating: the moment the key is pressed the decision is
 * timestamped. Keys 1-6 map directly to the six slots; `D` toggles debug mode.
 */

export type SlotHandler = (slot: number) => void;

export class InputController {
  private slotHandler: SlotHandler | null = null;
  private readonly extraHandlers = new Map<string, () => void>();
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  constructor(private readonly target: Window | HTMLElement = window) {
    this.onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const targetElement = event.target as HTMLElement | null;
      // Never steal keys from a text field.
      if (targetElement && /^(INPUT|TEXTAREA|SELECT)$/.test(targetElement.tagName)) return;

      const slot = Number.parseInt(event.key, 10);
      if (this.slotHandler && slot >= 1 && slot <= 6) {
        event.preventDefault();
        this.slotHandler(slot);
        return;
      }

      const handler = this.extraHandlers.get(event.key.toLowerCase());
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    (this.target as Window).addEventListener('keydown', this.onKeyDown as EventListener);
  }

  /** Set (or clear, with null) the handler for keys 1-6. */
  setSlotHandler(handler: SlotHandler | null): void {
    this.slotHandler = handler;
  }

  bindKey(key: string, handler: () => void): void {
    this.extraHandlers.set(key.toLowerCase(), handler);
  }

  destroy(): void {
    (this.target as Window).removeEventListener('keydown', this.onKeyDown as EventListener);
    this.extraHandlers.clear();
    this.slotHandler = null;
  }
}
