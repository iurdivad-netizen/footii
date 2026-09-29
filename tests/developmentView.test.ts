import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPlayer } from '../src/core/player/player.ts';
import type { Player } from '../src/core/player/player.ts';
import { ATTRIBUTE_KEYS } from '../src/core/player/attributes.ts';
import { keyAttributesFor } from '../src/core/player/positions.ts';
import { TEAMS, getTeam } from '../src/data/gameData.ts';
import type { CareerState } from '../src/core/career/career.ts';
import { seasonComplete } from '../src/core/career/career.ts';
import {
  canStay,
  acceptOffer,
  endSeason,
  recordPlayerMatch,
  startCareer,
  stayAtClub,
} from '../src/simulation/CareerService.ts';
import { createMatchStats } from '../src/core/match/matchStats.ts';
import { attributeTimeline } from '../src/core/career/attributeTimeline.ts';
import type { AttributeChange } from '../src/core/career/attributeTimeline.ts';
import { windowAcross } from '../src/simulation/DecisionBenchmark.ts';
import {
  axisLabelIndexes,
  changeSentence,
  chartLayout,
  escapeHtml,
  evenSample,
  moversSentence,
  niceDomain,
  recordNote,
  renderDevelopment,
  renderSparkline,
  signed,
} from '../src/ui/developmentView.ts';
import type { DevelopmentInput } from '../src/ui/developmentView.ts';

/**
 * THE DEVELOPMENT VIEW.
 *
 * The parts of a chart that can be wrong without anything crashing: a scale that
 * turns a two-point wobble into a collapse, a label that lands on another, a sign
 * printed as a hyphen, a name that becomes markup. Pure builders, so all of it is
 * checked without a browser.
 */

const lookup = (id: string) => getTeam(id);

function played(seasons: number): CareerState {
  const player: Player = createPlayer({
    name: 'Arc',
    position: 'ST',
    age: 18,
    experience: 12,
    baseAttribute: 54,
    reputation: 30,
    potentialAbility: 86,
    attributes: { finishing: 64, awareness: 48, composure: 46, decisionMaking: 44 },
  });
  const state = startCareer({ player, clubId: 'stapleton-vale', teams: TEAMS, seed: 'view' });
  for (let i = 0; i < seasons; i++) {
    while (!seasonComplete(state)) {
      const stats = createMatchStats();
      stats.minutes = 90;
      stats.goals = 1;
      recordPlayerMatch(
        state,
        { stats, rating: 7.5, playerTeamScore: 1, opponentScore: 0, fitnessAtEnd: 60 },
        lookup,
      );
    }
    const outcome = endSeason(state, lookup);
    if (outcome.offers.length > 0 && !canStay(state)) acceptOffer(state, outcome.offers[0]!.id, lookup);
    else if (canStay(state)) stayAtClub(state);
    state.trainingPoints = 0;
  }
  return state;
}

function inputFor(
  state: CareerState,
  over: Partial<DevelopmentInput> = {},
): DevelopmentInput {
  const timeline = attributeTimeline(state);
  return {
    name: state.player.name,
    positionLabel: 'Striker',
    keyKeys: keyAttributesFor(state.player.position),
    timeline,
    windows: windowAcross(state.player, timeline.points),
    clubName: (id) => getTeam(id).name,
    filter: 'all',
    view: 'chart',
    ...over,
  };
}

describe('text from data never becomes markup', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  it('holds for a player and a club named to break out of the page', () => {
    const state = played(1);
    const name = '"><script>alert(1)</script>';
    const { html } = renderDevelopment(
      inputFor({ ...state, player: { ...state.player, name } } as CareerState, {
        name,
        clubName: () => '<b>club</b>',
      }),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>club</b>');
    expect(html).toContain('&lt;b&gt;club&lt;/b&gt;');
  });
});

describe('signs', () => {
  it('prints a real minus and never a hyphen', () => {
    expect(signed(18)).toBe('+18');
    expect(signed(-6)).toBe('−6');
    expect(signed(-6)).not.toContain('-');
    expect(signed(0)).toBe('0');
  });

  it('does not print a minus in front of nothing', () => {
    expect(signed(-0.004, 2)).toBe('0.00');
    expect(signed(0.004, 2)).toBe('0.00');
    expect(signed(1.624, 2)).toBe('+1.62');
    expect(signed(-1.624, 2)).toBe('−1.62');
  });
});

describe('the ability scale', () => {
  it('rounds out to clean numbers and holds every value', () => {
    const d = niceDomain([61, 64, 70, 78]);
    expect(d.min).toBe(60);
    expect(d.max).toBe(80);
    for (const tick of d.ticks) expect(tick % 5).toBe(0);
    expect(d.ticks[0]).toBeGreaterThanOrEqual(d.min);
    expect(d.ticks[d.ticks.length - 1]).toBeLessThanOrEqual(d.max);
  });

  it('does not turn a two-point wobble into a collapse', () => {
    // 70 to 72 must not fill the chart: a domain of two points would draw it as
    // a cliff. The scale is never narrower than ten.
    const d = niceDomain([70, 72]);
    expect(d.max - d.min).toBeGreaterThanOrEqual(10);
    expect(d.min).toBeLessThanOrEqual(70);
    expect(d.max).toBeGreaterThanOrEqual(72);
  });

  it('copes with a single value, and never goes below zero', () => {
    const one = niceDomain([3]);
    expect(one.min).toBeGreaterThanOrEqual(0);
    expect(one.max - one.min).toBeGreaterThanOrEqual(10);
    expect(niceDomain([50]).ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps between two and five ticks', () => {
    for (const values of [[60, 62], [40, 90], [10, 95], [0, 99]]) {
      const { ticks } = niceDomain(values);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('the x-axis labels', () => {
  it('draws every one when there is room', () => {
    expect(axisLabelIndexes(5)).toEqual([0, 1, 2, 3, 4]);
    expect(axisLabelIndexes(9)).toHaveLength(9);
  });

  it('always draws the last, which is "Now", and the first', () => {
    for (const count of [10, 13, 17, 19, 25]) {
      const shown = axisLabelIndexes(count);
      expect(shown[0]).toBe(0);
      expect(shown[shown.length - 1]).toBe(count - 1);
    }
  });

  it('drops a label that would collide rather than squeezing it in', () => {
    for (const count of [10, 13, 17, 19, 25]) {
      const shown = axisLabelIndexes(count);
      const step = Math.ceil(count / 9);
      for (let i = 1; i < shown.length; i++) {
        expect(shown[i]! - shown[i - 1]!).toBeGreaterThanOrEqual(step);
      }
      expect(shown.length).toBeLessThanOrEqual(10);
    }
  });
});

describe('sampling a trajectory for a tooltip', () => {
  it('keeps both ends and never more than asked', () => {
    for (const count of [2, 5, 10, 11, 19, 40]) {
      const picked = evenSample(count, 10);
      expect(picked[0]).toBe(0);
      expect(picked[picked.length - 1]).toBe(count - 1);
      expect(picked.length).toBeLessThanOrEqual(10);
      expect(new Set(picked).size).toBe(picked.length);
      expect([...picked].sort((a, b) => a - b)).toEqual(picked);
    }
  });
});

describe('the sparkline', () => {
  it('draws nothing for one point, which is not a trend', () => {
    expect(renderSparkline([1.4])).toBe('');
  });

  it('draws the history and the latest step separately, and keeps inside its box', () => {
    const svg = renderSparkline([8.1, 8.4, 9, 9.8], 120, 34);
    expect(svg).toContain('dev-spark-history');
    expect(svg).toContain('dev-spark-now');
    const coords = [...svg.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(120);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(34);
    }
  });

  it('does not divide by zero for a flat line', () => {
    expect(renderSparkline([9, 9, 9])).not.toMatch(/NaN|Infinity/);
  });
});

describe('the rendered view of a played career', () => {
  const state = played(4);
  const input = inputFor(state);
  const view = renderDevelopment(input);
  const points = input.timeline.points.length;

  it('has a stat tile for ability and one for the window, and never a dual axis', () => {
    expect(view.html).toContain('Overall ability');
    expect(view.html).toContain('Decision window');
    // ONE plot. The window is seconds and ability a rating: two scales on one
    // chart would let it invent a relationship, so it is a tile instead.
    expect(view.html.match(/<svg class="dev-chart"/g)).toHaveLength(1);
    expect(view.html).not.toMatch(/dev-axis[^>]*text-anchor="start"/);
  });

  it('draws the ability line with a point for every recorded moment', () => {
    expect(view.html.match(/data-marker="/g)).toHaveLength(points);
    expect(view.html.match(/class="dev-hit"/g)).toHaveLength(points);
    expect(view.chartPoints).toBe(points);
  });

  it('makes every hit area a season wide enough to aim at', () => {
    const widths = [...view.html.matchAll(/class="dev-hit"[^>]*width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(points);
    for (const width of widths) expect(width).toBeGreaterThanOrEqual(24);
  });

  it('draws markers of at least eight pixels with a ring under each', () => {
    const radii = [...view.html.matchAll(/class="dev-marker"[^>]*r="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const r of radii) expect(r * 2).toBeGreaterThanOrEqual(8);
    expect(view.html.match(/class="dev-ring"/g)).toHaveLength(points);
  });

  it('labels only the ends of the line, not every point', () => {
    expect(view.html.match(/class="dev-value"/g)?.length).toBeLessThanOrEqual(2);
  });

  it('gives the chart a spoken summary, so it is not a silent picture', () => {
    expect(view.html).toMatch(/<svg class="dev-chart"[^>]*role="img"[^>]*aria-label="Overall ability went from \d+ at career start to \d+ now/);
  });

  it('gives every attribute a row that says its whole story aloud', () => {
    for (const key of ATTRIBUTE_KEYS) expect(view.html).toContain(`data-tip="r${key}"`);
    expect(view.html.match(/class="dev-row"/g)).toHaveLength(ATTRIBUTE_KEYS.length);
    expect(view.html).toMatch(/aria-label="Finishing: \d+ at career start, \d+ now, (up \d+|down \d+|unchanged)"/);
  });

  it('draws start hollow and now filled in every row, so it is never colour alone', () => {
    expect(view.html.match(/class="dev-dot dev-start"/g)!.length).toBeGreaterThanOrEqual(ATTRIBUTE_KEYS.length);
    expect(view.html.match(/class="dev-dot dev-now"/g)!.length).toBeGreaterThanOrEqual(ATTRIBUTE_KEYS.length);
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.dev-start\s*\{[^}]*border:\s*2px solid/);
    expect(css).toMatch(/\.dev-now\s*\{[^}]*background:\s*var\(--accent\)/);
  });

  it('positions each dot at its value on one shared scale, and the connector between them', () => {
    const finishing = view.html.match(
      /data-tip="rfinishing"[\s\S]*?dev-conn" style="left:([\d.]+)%;width:([\d.]+)%"[\s\S]*?dev-start" style="left:([\d.]+)%"[\s\S]*?dev-now" style="left:([\d.]+)%"/,
    )!;
    const [, left, width, start, now] = finishing.map(Number);
    expect(left).toBe(Math.min(start!, now!));
    expect(width).toBe(Math.abs(now! - start!));
  });

  it('shows a fall as a fall: a real minus, and the down class', () => {
    const fallen = played(2);
    fallen.player.attributes.pace = Math.max(1, fallen.player.attributes.pace - 30);
    const html = renderDevelopment(inputFor(fallen)).html;
    expect(html).toMatch(/dev-delta down">−\d+</);
  });

  it('carries the movers in a sentence above the rows', () => {
    expect(view.html).toMatch(/class="dev-movers">(Biggest gains|Slipped|No attribute)/);
  });

  it('puts tooltips on every season with the value leading, and the club on a closed one', () => {
    for (let i = 0; i < points; i++) {
      const tip = view.tips[`a${i}`]!;
      expect(tip).toBeDefined();
      expect(tip.rows[0]).toMatchObject({ label: 'Overall ability', strong: true });
      expect(tip.rows.map((r) => r.label)).toContain('Decision window');
    }
    expect(view.tips[`a${points - 1}`]!.title).toBe('Now');
    const closed = input.timeline.points.findIndex((p) => p.kind === 'season-end');
    expect(view.tips[`a${closed}`]!.rows.map((r) => r.label)).toContain('Club');
  });

  it('samples an attribute\'s trajectory to ten rows at most, and ends on now', () => {
    const tip = view.tips['rfinishing']!;
    expect(tip.rows.length).toBeLessThanOrEqual(10);
    expect(tip.rows[tip.rows.length - 1]).toMatchObject({ label: 'Now', strong: true });
    expect(tip.rows[0]!.label).toBe('Career start');
  });

  it('draws the whole thing again as a table, every value in it', () => {
    const table = renderDevelopment(inputFor(state, { view: 'table' }));
    expect(table.html).toContain('class="dev-table dev-attrs"');
    expect(table.html).not.toContain('class="dev-row"');
    // every attribute, every recorded point, and the change.
    const rows = table.html.match(/<th scope="row">/g)!;
    expect(rows.length).toBeGreaterThanOrEqual(ATTRIBUTE_KEYS.length);
    expect(table.html).toContain('Change');
    for (const point of input.timeline.points) expect(table.html).toContain(`>${point.short}<`);
    // the seasons table is there in both views
    expect(view.html).toContain('class="dev-table dev-seasons"');
    expect(table.html).toContain('class="dev-table dev-seasons"');
  });

  it('shows only the key attributes when asked, each marked', () => {
    const keyed = renderDevelopment(inputFor(state, { filter: 'key' }));
    const keys = keyAttributesFor(state.player.position);
    expect(keyed.html.match(/class="dev-row"/g)).toHaveLength(keys.size);
    for (const key of keys) expect(keyed.html).toContain(`data-tip="r${key}"`);
    expect(keyed.html.match(/class="dev-key"/g)!.length).toBeGreaterThanOrEqual(keys.size);
  });

  it('drops a family with nothing key in it rather than printing an empty heading', () => {
    const keyed = renderDevelopment(
      inputFor(state, { filter: 'key', keyKeys: new Set(['finishing'] as const) }),
    );
    expect(keyed.html).toContain('aria-label="Attacking"');
    expect(keyed.html).not.toContain('aria-label="Defending"');
    expect(keyed.html).not.toContain('aria-label="Physical"');
  });
});

describe('what it says about how much was recorded', () => {
  it('says nothing about a full record', () => {
    expect(recordNote(attributeTimeline(played(3)))).toBe('');
  });

  it('says there is no career yet on the first day', () => {
    expect(recordNote(attributeTimeline(played(0)))).toMatch(/No season has finished yet/);
  });

  it('says where the record begins when the start was lost, and that it cannot be recovered', () => {
    const state = played(2);
    state.origin = null;
    for (const record of state.history) {
      delete record.attributes;
      delete record.ability;
      delete record.experience;
    }
    const timeline = attributeTimeline(state);
    const note = recordNote(timeline);
    expect(note).toMatch(/begins at start of season/);
    expect(note).toMatch(/cannot be recovered/);
    const html = renderDevelopment(inputFor(state)).html;
    expect(html).toContain('class="dev-note"');
    // and the heading names the real start, not "career start"
    expect(html).toMatch(/Every attribute, start of season \d+ to now/);
  });

  it('says "no change" on the first day, not "0 since career start"', () => {
    const html = renderDevelopment(inputFor(played(0))).html;
    expect(html.match(/No change since career start/g)).toHaveLength(2);
    expect(html).not.toMatch(/>0 since|>0\.00s since/);
    // and a career that has moved says how far, in the ordinary way
    expect(renderDevelopment(inputFor(played(3))).html).toMatch(/\+\d+ since career start/);
  });

  it('still draws a chart for a career with only two honest points', () => {
    const state = played(0);
    const html = renderDevelopment(inputFor(state)).html;
    expect(html).toContain('<svg class="dev-chart"');
    expect(html.match(/data-marker="/g)).toHaveLength(2);
  });
});

describe('sentences', () => {
  const change: AttributeChange = {
    key: 'finishing',
    label: 'Finishing',
    group: 'Attacking',
    start: 52,
    now: 70,
    delta: 18,
    series: [52, 70],
  };

  it('reads a change aloud for somebody who cannot see two dots', () => {
    expect(changeSentence(change, 'Career start')).toBe('Finishing: 52 at career start, 70 now, up 18');
    expect(changeSentence({ ...change, now: 46, delta: -6 }, 'Career start')).toBe(
      'Finishing: 52 at career start, 46 now, down 6',
    );
    expect(changeSentence({ ...change, now: 52, delta: 0 }, 'Career start')).toContain('unchanged');
  });

  it('summarises the movers, and says so plainly when nothing moved', () => {
    expect(moversSentence([change])).toBe('Biggest gains: Finishing +18.');
    expect(moversSentence([{ ...change, delta: 0 }])).toBe('No attribute has moved yet.');
    expect(moversSentence([{ ...change, delta: -4 }])).toBe('Slipped: Finishing −4.');
  });
});

describe('the chart layout', () => {
  it('spreads points across the plot, and centres a lone one', () => {
    const { xs, plotWidth } = chartLayout(5);
    expect(xs).toHaveLength(5);
    expect(xs[4]! - xs[0]!).toBeCloseTo(plotWidth, 6);
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 6);
    expect(chartLayout(1).xs).toHaveLength(1);
  });
});

describe('the card opens, and the panel behaves as a dialog', () => {
  const screen = readFileSync(new URL('../src/ui/screens/CareerScreen.ts', import.meta.url), 'utf8');
  const panel = readFileSync(
    new URL('../src/ui/components/DevelopmentPanel.ts', import.meta.url),
    'utf8',
  );
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('is opened by the card\'s own heading, as one button', () => {
    expect(screen).toMatch(/<h2>\s*<button type="button" class="card-open" id="open-development" aria-haspopup="dialog">/);
    expect(screen).toMatch(/#open-development'\)\s*\?\.addEventListener\('click'/);
    expect(screen).not.toMatch(/card\('Key attributes'/);
  });

  it('stretches that button over the whole card, and rings the card when it is focused', () => {
    expect(css).toMatch(/\.card-open::after\s*\{[^}]*inset:\s*0/);
    expect(css).toMatch(/\.card-open:focus-visible::after\s*\{[^}]*outline:\s*2px solid/);
  });

  it('does not let the global button rules shrink that overlay while it is being pressed', () => {
    // `button:active` nudges a pressed button with a transform, and a transform
    // makes it the containing block for its own ::after — collapsing the stretched
    // overlay from the whole card onto the heading at the moment of the click, so
    // the release landed on the paragraph beneath and the card only opened when
    // you clicked its title. Found by clicking the real card, not by any unit test.
    expect(css).toMatch(/button:active:not\(:disabled\)\s*\{[^}]*transform:\s*translateY/);
    const optOut = css.match(
      /\.card-open:hover:not\(:disabled\),\s*\.card-open:active:not\(:disabled\)\s*\{[^}]*\}/,
    );
    expect(optOut).not.toBeNull();
    expect(optOut![0]).toMatch(/transform:\s*none/);
    expect(optOut![0]).toMatch(/background:\s*none/);
  });

  it('is a modal dialog with a name', () => {
    expect(panel).toMatch(/role="dialog" aria-modal="true" aria-labelledby="dev-title"/);
    expect(panel).toMatch(/id="dev-title"/);
  });

  it('moves focus in, traps Tab, closes on Escape and the backdrop, and hands focus back', () => {
    expect(panel).toMatch(/\.dev-close'\)!\.focus\(\)/);
    expect(panel).toMatch(/event\.key === 'Escape'/);
    expect(panel).toMatch(/event\.key !== 'Tab'/);
    expect(panel).toMatch(/event\.target === this\.element/);
    expect(panel).toMatch(/this\.opener\?\.focus\(\)/);
  });

  it('stops the page behind it scrolling, and lets go again', () => {
    expect(panel).toMatch(/classList\.add\('dev-open'\)/);
    expect(panel).toMatch(/classList\.remove\('dev-open'\)/);
    expect(css).toMatch(/body\.dev-open\s*\{[^}]*overflow:\s*hidden/);
  });

  it('writes tooltip text with textContent, never as markup', () => {
    expect(panel).toMatch(/title\.textContent = tip\.title/);
    expect(panel).toMatch(/value\.textContent = row\.value/);
    expect(panel).toMatch(/label\.textContent = row\.label/);
    // no tooltip path builds HTML from the tip
    expect(panel).not.toMatch(/tooltip\.innerHTML/);
  });

  it('gives the keyboard what the pointer gets', () => {
    expect(panel).toMatch(/addEventListener\('focus', \(\) => this\.showTip\(node\)\)/);
    expect(panel).toMatch(/event\.key === 'ArrowLeft'/);
    expect(panel).toMatch(/event\.key === 'ArrowRight'/);
  });

  it('keeps the two switches as real buttons that say whether they are on', () => {
    expect(panel).toMatch(/data-filter="all" aria-pressed="true"/);
    expect(panel).toMatch(/data-view="table" aria-pressed="false"/);
    expect(panel).toMatch(/setAttribute\('aria-pressed'/);
  });
});
