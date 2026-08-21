import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * THE STORAGE WARNING'S ONE CSS TRAP
 *
 * The bar is hidden with the `hidden` property, which browsers implement as a
 * UA rule of `[hidden] { display: none }`. Any class selector in our own
 * stylesheet outranks that — so the moment `.storage-warning` was given
 * `display: flex`, setting `hidden` stopped hiding anything, and an empty
 * amber bar sat above every screen in the game for every player whose browser
 * was saving perfectly well.
 *
 * Tested as source text for the same reason the boot watchdog is: the suite
 * runs in node with no layout engine, so this is the only place the rule can be
 * guarded against a future tidy-up removing it as redundant. It is not
 * redundant.
 */
const css = readFileSync(fileURLToPath(new URL('../src/style.css', import.meta.url)), 'utf8');
const app = readFileSync(fileURLToPath(new URL('../src/ui/App.ts', import.meta.url)), 'utf8');

describe('the storage warning', () => {
  it('re-states hidden, because its own display rule outranks the UA one', () => {
    expect(css).toMatch(/\.storage-warning\[hidden\]\s*\{[^}]*display:\s*none/);
  });

  it('declares the display rule that makes the override necessary', () => {
    // If this ever stops being true the rule above can go — but only then.
    expect(css).toMatch(/\.storage-warning\s*\{[^}]*display:\s*flex/);
  });

  it('asks whether storage works at boot rather than at the first write', () => {
    // Without the probe, a private-window player is told nothing until they
    // have already played something worth keeping.
    expect(app).toContain('probeStorage()');
  });

  it('survives navigation, so a warning cannot be cleared by changing screen', () => {
    expect(app).toMatch(/child !== this\.debug\.element && child !== this\.storageWarning/);
  });
});
