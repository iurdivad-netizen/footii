import { describe, expect, it } from 'vitest';
import '../src/data/gameData.ts';
import { teamsInCountry } from '../src/data/gameData.ts';
import { competitionsPeek } from '../src/ui/hubPeek.ts';
import type { CupKind, CupState } from '../src/core/career/cups.ts';
import { createCup } from '../src/core/career/cups.ts';

const COUNTRY = 'england';
const CLUBS = teamsInCountry(COUNTRY).map((team) => team.id);
const CLUB = CLUBS[0]!;

function cups(overrides: Partial<Record<CupKind, CupState>> = {}): Record<CupKind, CupState> {
  return {
    nationalCup: createCup('nationalCup', COUNTRY, CLUBS),
    leagueCup: createCup('leagueCup', COUNTRY, CLUBS),
    ...overrides,
  } as Record<CupKind, CupState>;
}

/** A cup he has played `played` rounds of and is still in. */
function underway(kind: CupKind, played: number): CupState {
  const cup = createCup(kind, COUNTRY, CLUBS);
  for (let round = 1; round <= played; round += 1) {
    cup.rounds.push({ round, ties: [] });
  }
  return cup;
}

describe('the competitions peek', () => {
  it('never says "Round 0"', () => {
    // What it used to say, all August: the round count is rounds BEHIND you,
    // and in August there are none. `roundName(0, …)` has no name for that and
    // falls through to a number.
    const peek = competitionsPeek({ cups: cups(), clubId: CLUB, countryId: COUNTRY, europe: null });
    expect(peek).not.toMatch(/Round 0/);
  });

  it('says a drawn-but-unplayed cup has not started, in the card\'s own words', () => {
    const peek = competitionsPeek({ cups: cups(), clubId: CLUB, countryId: COUNTRY, europe: null });
    expect(peek).toBe('The English Cup · not started');
  });

  it('names the round once there is one', () => {
    const peek = competitionsPeek({
      cups: cups({ nationalCup: underway('nationalCup', 2) }),
      clubId: CLUB,
      countryId: COUNTRY,
      europe: null,
    });
    expect(peek).toContain('The English Cup · ');
    expect(peek).not.toMatch(/not started/);
  });

  it('prefers the cup that is actually underway over one only drawn', () => {
    // Both are alive in August. "In the quarter-final" is the sentence worth
    // spending the line on; "not started" is what you say when there is no
    // better sentence available.
    const peek = competitionsPeek({
      cups: cups({ leagueCup: underway('leagueCup', 3) }),
      clubId: CLUB,
      countryId: COUNTRY,
      europe: null,
    });
    expect(peek).toContain('League Cup');
    expect(peek).not.toMatch(/not started/);
  });

  it('ignores a cup he is out of', () => {
    const out = underway('nationalCup', 2);
    out.survivors = CLUBS.filter((id) => id !== CLUB);
    out.eliminatedInRound = 2;
    const peek = competitionsPeek({
      cups: cups({ nationalCup: out }),
      clubId: CLUB,
      countryId: COUNTRY,
      europe: null,
    });
    expect(peek).not.toContain('The English Cup');
  });

  it('adds Europe when there is Europe', () => {
    const peek = competitionsPeek({
      cups: cups({ nationalCup: underway('nationalCup', 1) }),
      clubId: CLUB,
      countryId: COUNTRY,
      europe: { kind: 'championsLeague' },
    });
    expect(peek).toContain('The English Cup');
    expect(peek).toContain('Champions League');
  });

  it('says so plainly when the league is all there is', () => {
    const gone = cups();
    for (const cup of Object.values(gone)) {
      cup.survivors = CLUBS.filter((id) => id !== CLUB);
      cup.eliminatedInRound = 1;
    }
    const peek = competitionsPeek({ cups: gone, clubId: CLUB, countryId: COUNTRY, europe: null });
    expect(peek).toBe('Nothing left to play for beyond the league');
  });

  it('survives a save that has no cups at all', () => {
    // Careers migrated from before cups existed carry `cups: undefined`, and
    // the peek runs on every hub render.
    expect(competitionsPeek({ clubId: CLUB, countryId: COUNTRY, europe: null })).toBe(
      'Nothing left to play for beyond the league',
    );
  });
});
