import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { titleMenu } from '../src/ui/titleMenu.ts';
import { gameLogo } from '../src/ui/logo.ts';
import type { CareerSummary } from '../src/ui/screens/HomeScreen.ts';

const career = (overrides: Partial<CareerSummary> = {}): CareerSummary => ({
  name: 'Ray Bellingham',
  detail: 'Striker · age 29 · Northport City · ENG · season 3',
  ability: 71,
  played: 14,
  total: 30,
  goals: 9,
  assists: 4,
  ...overrides,
});

describe('what is on the front door', () => {
  it('leads with the thing he came here to do, once there is one', () => {
    // Not the order this was asked for, and the reason is the save: continue is
    // the action taken every session, the manual is a document read once.
    const menu = titleMenu({ current: career(), careerCount: 1 });
    expect(menu[0]!.id).toBe('continue');
    expect(menu[0]!.primary).toBe(true);
    expect(menu.map((entry) => entry.id)).toEqual(['continue', 'careers', 'quick', 'how']);
  });

  it('offers nothing to continue when there is nothing to continue', () => {
    const menu = titleMenu({ current: null, careerCount: 0 });
    expect(menu.map((entry) => entry.id)).toEqual(['careers', 'quick', 'how']);
    // Starting one takes the top spot instead — the first entry is always the
    // likeliest thing, whatever the save happens to hold.
    expect(menu[0]!.primary).toBe(true);
  });

  it('marks exactly one entry as the one to press', () => {
    for (const input of [
      { current: career(), careerCount: 3 },
      { current: null, careerCount: 0 },
    ]) {
      expect(titleMenu(input).filter((entry) => entry.primary)).toHaveLength(1);
    }
  });

  it('names the footballer, because a verb with no object is a question', () => {
    const menu = titleMenu({ current: career(), careerCount: 3 });
    expect(menu[0]!.detail).toContain('Ray Bellingham');
    expect(menu[0]!.detail).toContain('Northport City');
  });

  it('tells the truth about what the careers page is for', () => {
    // With careers on the save it is where you switch or end one; with none it
    // is where you make your first, and calling it "Careers" there would be a
    // heading over an empty rack.
    expect(titleMenu({ current: career(), careerCount: 2 })[1]!.label).toBe('Careers');
    expect(titleMenu({ current: null, careerCount: 0 })[0]!.label).toBe('New career');
  });

  it('keeps the manual one press away and never in the way', () => {
    for (const input of [
      { current: career(), careerCount: 1 },
      { current: null, careerCount: 0 },
    ]) {
      const how = titleMenu(input).find((entry) => entry.id === 'how')!;
      expect(how).toBeDefined();
      expect(how.primary).toBe(false);
    }
  });
});

describe('the mark', () => {
  it('draws the six options a situation offers', () => {
    const svg = gameLogo();
    expect(svg.match(/class="logo-tick/g)).toHaveLength(6);
  });

  it('lights exactly one of them — the one you took', () => {
    expect(gameLogo().match(/logo-tick-lit/g)).toHaveLength(1);
  });

  it('is drawn at the size it is asked for and scales from one viewBox', () => {
    expect(gameLogo(112)).toContain('width="112"');
    expect(gameLogo(48)).toContain('width="48"');
    expect(gameLogo(48)).toContain('viewBox="0 0 100 100"');
  });

  it('says nothing to a screen reader, because the wordmark is beside it', () => {
    expect(gameLogo()).toContain('aria-hidden="true"');
  });
});

describe('the door the game opens on', () => {
  const app = readFileSync(new URL('../src/ui/App.ts', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/ui/screens/HomeScreen.ts', import.meta.url), 'utf8');

  it('starts on the menu once the introduction has been seen', () => {
    expect(app).toContain('if (this.save.settings.seenIntro) this.showTitle();');
  });

  it('gives the careers page a way back, now that it is not the front door', () => {
    expect(home).toContain('home-back');
    expect(app).toContain('onBack: () => this.showTitle()');
  });

  it('skips the empty rack when there is no career to show on it', () => {
    // Three blank slots under a heading is not a page worth a press.
    expect(app).toContain("careerCount > 0\n            ? this.showHome()");
  });

  it('opens a settings screen rather than scrolling another page to it', () => {
    // A menu entry that opens something else and scrolls is a link that lands
    // somewhere and hopes.
    expect(app).toContain('onSettings: () => this.showSettings()');
    expect(app).toContain('private showSettings(status?: string)');
  });

  it('keeps each page to one question', () => {
    const home = readFileSync(new URL('../src/ui/screens/HomeScreen.ts', import.meta.url), 'utf8');
    const settings = readFileSync(
      new URL('../src/ui/screens/SettingsScreen.ts', import.meta.url),
      'utf8',
    );
    // The careers page carries no quick match, no settings and no save panel;
    // the settings screen carries no careers. Each of those was on screen twice
    // the moment the menu started offering them.
    expect(home).not.toContain('quick-match');
    expect(home).not.toContain('home-pace');
    expect(home).not.toContain('export-save');
    expect(home).not.toContain('hall-mini');
    expect(settings).not.toContain('slot-rack');
    expect(settings).not.toContain('data-continue');
  });
});
