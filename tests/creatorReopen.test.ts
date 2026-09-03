import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchStyle, stylesForPosition } from '../src/core/player/playerBuilder.ts';
import type { CustomPlayerSpec } from '../src/core/player/playerBuilder.ts';
import { suggestedAttributes } from '../src/core/player/playerBuilder.ts';

/**
 * EDITING A CUSTOM PLAYER MUST EDIT THE ONE YOU BUILT.
 *
 * The setup screen relabels its creator button to "Edit your custom player" as
 * soon as a creation exists, and for the whole life of that label it opened a
 * blank striker: building a footballer, playing a match with him and then going
 * back to adjust him meant typing everything again. The bug was invisible from
 * either file alone — the screen said "edit", the creator was simply never told
 * what to edit.
 *
 * So two things are pinned here: the style lookup that reopening depends on,
 * and the wiring that carries a build back to the creator at all.
 */

const spec = (position: 'CM' | 'ST', styleIndex: number): CustomPlayerSpec => {
  const styles = stylesForPosition(position);
  return {
    name: 'Marco Verratti',
    age: 21,
    position,
    attributes: suggestedAttributes(position),
    tendencies: styles[styleIndex]!.tendencies,
    nationality: 'italy',
  };
};

describe('recognising the style a build was made with', () => {
  it('finds the style that set these tendencies', () => {
    const styles = stylesForPosition('CM');
    for (const [index, style] of styles.entries()) {
      expect(matchStyle(styles, spec('CM', index).tendencies).id).toBe(style.id);
    }
  });

  it('survives a round trip through JSON, because a save is text', () => {
    const styles = stylesForPosition('ST');
    const restored = JSON.parse(JSON.stringify(spec('ST', styles.length - 1))) as CustomPlayerSpec;
    expect(matchStyle(styles, restored.tendencies).id).toBe(styles[styles.length - 1]!.id);
  });

  it('falls back to the first style rather than failing on tendencies no style set', () => {
    const styles = stylesForPosition('ST');
    expect(matchStyle(styles, { runsBehind: 0.123 }).id).toBe(styles[0]!.id);
  });

  it('does not confuse two different styles for the same position', () => {
    const styles = stylesForPosition('ST');
    expect(styles.length).toBeGreaterThan(1);
    const ids = new Set(styles.map((style) => matchStyle(styles, style.tendencies).id));
    expect(ids.size).toBe(styles.length);
  });
});

describe('the wiring that reopens a build', () => {
  const app = readFileSync(new URL('../src/ui/App.ts', import.meta.url), 'utf8');
  const creator = readFileSync(
    new URL('../src/ui/screens/PlayerCreatorScreen.ts', import.meta.url),
    'utf8',
  );
  const setup = readFileSync(new URL('../src/ui/screens/SetupScreen.ts', import.meta.url), 'utf8');

  it('keeps the spec that built the custom player, not only the player', () => {
    // The player carries a rolled potential and career-moved attributes; the
    // spec is what somebody typed, which is the only thing worth reopening.
    expect(app).toMatch(/customSpec/);
    expect(app).toMatch(/this\.customSpec = spec;/);
  });

  it('hands that spec to the creator when it opens one', () => {
    expect(app).toMatch(/this\.customSpec \?\? undefined/);
    expect(creator).toMatch(/initial\?: CustomPlayerSpec/);
  });

  it('opens on the build rather than on a default striker', () => {
    expect(creator).toMatch(/initial\?\.position/);
    expect(creator).toMatch(/initial \? \{ \.\.\.initial\.attributes \}/);
    expect(creator).toMatch(/initial\?\.name/);
    expect(creator).toMatch(/initial\?\.age/);
    expect(creator).toMatch(/initial\?\.nationality/);
    expect(creator).toMatch(/matchStyle\(this\.styles, initial\.tendencies\)/);
  });

  it('still offers the edit the button promises', () => {
    // If this label ever goes back to always saying "create", the seeding above
    // is dead code rather than a fix.
    expect(setup).toMatch(/Edit your custom player/);
  });
});
