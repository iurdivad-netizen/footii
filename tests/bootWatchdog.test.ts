import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The boot watchdog is the last line of defence: it reports the failures that
 * happen BEFORE any of our TypeScript runs, which no error boundary can catch.
 * It lives in index.html as a plain script, so these are the only tests that
 * can guard it — mostly against a well-meaning future tidy-up deleting it.
 */
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const main = readFileSync(fileURLToPath(new URL('../src/main.ts', import.meta.url)), 'utf8');

describe('boot watchdog', () => {
  it('runs as a classic script, not a module', () => {
    // A module would be blocked by exactly the failures it exists to report.
    const watchdog = html.slice(html.indexOf('BOOT WATCHDOG'), html.indexOf('src="/src/main.ts"'));
    expect(watchdog).toContain('<script>');
    expect(watchdog).not.toContain('<script type="module">');
  });

  it('listens for resource load errors in the capture phase', () => {
    // Resource errors do not bubble, so a listener without `true` sees nothing.
    expect(html).toMatch(/addEventListener\(\s*'error',[\s\S]*?true,/);
  });

  it('sits before the module script, so it is registered when the module fails', () => {
    expect(html.indexOf('BOOT WATCHDOG')).toBeLessThan(html.indexOf('src="/src/main.ts"'));
  });

  it('offers a reload that defeats a cached document', () => {
    // A plain reload can serve the same stale index.html straight back; the
    // changed query string forces a fresh request.
    expect(html).toContain("location.replace(location.pathname + '?reload=' + Date.now())");
  });

  it('is switched off by main.ts once the app code has run', () => {
    expect(main).toContain('window.__footiiStarted = true');
    // After the try/catch: reaching the error boundary still means the code
    // loaded, and that screen is more useful than the watchdog's.
    expect(main.indexOf('renderFatalError(root, error, STORAGE_KEY)')).toBeLessThan(
      main.indexOf('window.__footiiStarted = true'),
    );
  });
});
