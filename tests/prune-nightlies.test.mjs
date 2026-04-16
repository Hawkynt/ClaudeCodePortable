import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNightlies, planRetention, isoWeekKey } from '../scripts/prune-nightlies.mjs';

function make(iso) { return { tagName: `nightly-${iso}` }; }
function parse(isos) { return parseNightlies(isos.map(make)); }
function keptIsos(plan) { return plan.keep.map(r => r.iso); }

test('parseNightlies sorts newest first and ignores non-nightly tags', () => {
    const raw = [
        make('2026-04-10'),
        { tagName: 'v1.0.0' },                              // ignored
        make('2026-04-12'),
        make('2026-04-11'),
        { tagName: 'rc-2026-04-15' },                       // ignored
    ];
    const n = parseNightlies(raw);
    assert.deepEqual(n.map(r => r.iso), ['2026-04-12','2026-04-11','2026-04-10']);
});

test('son tier always keeps the N newest, regardless of date gaps', () => {
    // 7 releases spread across many months -- still all kept as daily.
    const sparse = parse([
        '2026-04-20', '2026-04-10', '2026-03-15', '2026-03-01',
        '2026-02-20', '2026-01-10', '2025-12-05',
    ]);
    const { keep, drop } = planRetention(sparse, { daily: 7, weekly: 0, monthly: 0 });
    assert.equal(keep.length, 7);
    assert.equal(drop.length, 0);
});

test('father tier picks from releases OLDER than the son tier', () => {
    // 10 consecutive days. Son takes top 7; weekly should pick the OLDEST
    // release in the bucket not covered by son (i.e. from days 8-10).
    const isos = [];
    for (let i = 0; i < 10; i++) {
        const d = new Date(Date.UTC(2026, 3, 20 - i));
        isos.push(d.toISOString().slice(0, 10));
    }
    const n = parse(isos);
    const { keep } = planRetention(n, { daily: 7, weekly: 4, monthly: 0 });
    const iso = keptIsos({ keep });
    // Son kept the top 7
    for (const s of isos.slice(0, 7)) assert.ok(iso.includes(s));
    // Father should have picked one release per week from days 8-10 (may
    // only span 1-2 ISO weeks, so 1-2 weekly picks)
    const weeklyOnly = iso.filter(i => !isos.slice(0, 7).includes(i));
    assert.ok(weeklyOnly.length >= 1);
});

test('father tier keeps up to 4 distinct ISO-weeks when activity spans that many', () => {
    // 20 consecutive daily releases. Son takes 7, father should pick from
    // remaining 13 spread over ~3 ISO-weeks.
    const isos = [];
    for (let i = 0; i < 20; i++) {
        const d = new Date(Date.UTC(2026, 3, 20 - i));
        isos.push(d.toISOString().slice(0, 10));
    }
    const n = parse(isos);
    const { keep } = planRetention(n, { daily: 7, weekly: 4, monthly: 0 });
    const weeklyPicks = keep.filter(r => !isos.slice(0, 7).includes(r.iso));
    const weekKeys = new Set(weeklyPicks.map(r => isoWeekKey(r.date)));
    assert.ok(weeklyPicks.length <= 4);
    assert.equal(weekKeys.size, weeklyPicks.length, 'one pick per week');
});

test('father tier traverses gaps: empty weeks are skipped, not counted', () => {
    // Son: one very recent release. Then a huge gap, then 4 monthly-ish
    // releases. The father tier should still find 4 weekly picks because
    // it traverses the available data, not the calendar.
    const n = parse([
        '2026-04-20',
        '2026-01-15', '2025-11-03', '2025-09-20', '2025-06-10',
    ]);
    const { keep } = planRetention(n, { daily: 1, weekly: 4, monthly: 0 });
    // 1 (son) + 4 (father from older pool) = 5
    assert.equal(keep.length, 5);
    assert.deepEqual(keptIsos({ keep }).sort(), [
        '2025-06-10', '2025-09-20', '2025-11-03', '2026-01-15', '2026-04-20',
    ]);
});

test('grandfather tier keeps up to 3 distinct calendar months from leftovers', () => {
    // Releases across 6 months. Son=1 top, father=4 recent weeks,
    // grandfather picks from what neither kept.
    const n = parse([
        '2026-04-20', '2026-04-05',                         // April
        '2026-03-20', '2026-03-01',                         // March
        '2026-02-15', '2026-02-01',                         // February
        '2026-01-20', '2026-01-05',                         // January
        '2025-12-10',                                       // December
        '2025-11-15',                                       // November
    ]);
    const { keep } = planRetention(n, { daily: 1, weekly: 0, monthly: 3 });
    const months = new Set(keptIsos({ keep }).map(i => i.slice(0, 7)));
    assert.equal(keep.length, 4);                           // 1 son + 3 grandfather
    // Son is 2026-04-20 (April). Grandfather picks 3 distinct months OLDER
    // than April: March, February, January.
    assert.ok(months.has('2026-04'));
    assert.ok(months.has('2026-03'));
    assert.ok(months.has('2026-02'));
    assert.ok(months.has('2026-01'));
});

test('grandfather tier traverses month gaps: quiet months do not waste slots', () => {
    // Son: 0. Father: 0. Grandfather: 3 months, but there are gaps.
    const n = parse([
        '2026-04-10',
        // March skipped
        '2026-02-15',
        // Jan/Dec/Nov skipped
        '2025-10-05',
        // more gaps...
        '2025-06-20',
    ]);
    const { keep } = planRetention(n, { daily: 0, weekly: 0, monthly: 3 });
    assert.equal(keep.length, 3);
    assert.deepEqual(keptIsos({ keep }), ['2026-04-10', '2026-02-15', '2025-10-05']);
});

test('full GFS: disjoint tiers, no double-counting, exact upper bound', () => {
    // 90 consecutive days. Expected kept:
    //   son = 7
    //   father = 4 (from 4 weeks immediately after son window)
    //   grandfather = up to 3 months from what's left
    const isos = [];
    for (let i = 0; i < 90; i++) {
        const d = new Date(Date.UTC(2026, 3, 20));
        d.setUTCDate(d.getUTCDate() - i);
        isos.push(d.toISOString().slice(0, 10));
    }
    const n = parse(isos);
    const { keep, drop } = planRetention(n);
    assert.equal(keep.length + drop.length, 90);
    assert.ok(keep.length <= 7 + 4 + 3);
    assert.ok(keep.length >= 7);                            // son is always full here

    const keptSet = new Set(keep.map(r => r.tag));
    for (const r of drop) assert.ok(!keptSet.has(r.tag));
});

test('isoWeekKey yields stable ordering', () => {
    const a = isoWeekKey(new Date('2026-01-05T00:00:00Z')); // Mon of W02
    const b = isoWeekKey(new Date('2026-01-11T00:00:00Z')); // Sun of W02
    const c = isoWeekKey(new Date('2026-01-12T00:00:00Z')); // Mon of W03
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.ok(a < c);
});

test('tiny input: fewer releases than N, everything is kept', () => {
    const n = parse(['2026-04-20', '2026-04-05']);
    const { keep, drop } = planRetention(n);
    assert.equal(keep.length, 2);
    assert.equal(drop.length, 0);
});
