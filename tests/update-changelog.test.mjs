import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketize, renderSection, prependSection, BUCKET_ORDER } from '../scripts/update-changelog.mjs';

test('BUCKET_ORDER is Added, Changed, Fixed, Removed, TODO, Other', () => {
    assert.deepEqual(BUCKET_ORDER, ['Added', 'Changed', 'Fixed', 'Removed', 'TODO', 'Other']);
});

test('bucketize maps +/*/#/-/! prefixes to the right buckets', () => {
    const commits = [
        { hash: 'aaa', subject: '+ add profile picker' },
        { hash: 'bbb', subject: '* renamed --resume-last to --continue alias' },
        { hash: 'ccc', subject: '# crash on empty jsonl' },
        { hash: 'ddd', subject: '- drop legacy data/ support' },
        { hash: 'eee', subject: '! document --doctor in README' },
        { hash: 'fff', subject: 'random commit without a prefix' },
    ];
    const b = bucketize(commits);
    assert.deepEqual(b.Added  .map(x => x.hash), ['aaa']);
    assert.deepEqual(b.Changed.map(x => x.hash), ['bbb']);
    assert.deepEqual(b.Fixed  .map(x => x.hash), ['ccc']);
    assert.deepEqual(b.Removed.map(x => x.hash), ['ddd']);
    assert.deepEqual(b.TODO   .map(x => x.hash), ['eee']);
    assert.deepEqual(b.Other  .map(x => x.hash), ['fff']);
});

test('bucketize accepts prefix without trailing space', () => {
    const b = bucketize([{ hash: 'a', subject: '+added a thing' }]);
    assert.equal(b.Added.length, 1);
    assert.equal(b.Added[0].text, 'added a thing');
});

test('bucketize strips the prefix from the visible text', () => {
    const b = bucketize([{ hash: 'a', subject: '# fix off-by-one in pruner' }]);
    assert.equal(b.Fixed[0].text, 'fix off-by-one in pruner');
});

test('renderSection emits buckets in the fixed order and skips empty ones', () => {
    const buckets = {
        Added:   [{ hash: 'a', text: 'new' }],
        Changed: [],
        Fixed:   [{ hash: 'c', text: 'bug' }],
        Removed: [{ hash: 'd', text: 'gone' }],
        TODO:    [],
        Other:   [],
    };
    const md = renderSection('Nightly 2026-04-20', buckets);
    const lines = md.split('\n').map(l => l.trim());
    const addedIdx   = lines.indexOf('### Added');
    const fixedIdx   = lines.indexOf('### Fixed');
    const removedIdx = lines.indexOf('### Removed');

    assert.ok(addedIdx   !== -1);
    assert.ok(fixedIdx   !== -1);
    assert.ok(removedIdx !== -1);
    assert.ok(addedIdx < fixedIdx && fixedIdx < removedIdx, 'buckets must render in Added/Fixed/Removed order');
    assert.ok(!lines.includes('### Changed'));
    assert.ok(!lines.includes('### TODO'));
    assert.ok(!lines.includes('### Other'));
});

test('renderSection emits a placeholder when every bucket is empty', () => {
    const md = renderSection('Nightly 2026-04-21', Object.fromEntries(BUCKET_ORDER.map(b => [b, []])));
    assert.ok(md.includes('_No notable changes._'));
});

test('prependSection keeps the top-level H1 intact', () => {
    const existing  = '# Changelog\n\nIntro paragraph.\n\n## Nightly 2026-04-19\n- old thing\n';
    const newSection = '## Nightly 2026-04-20\n### Added\n- new thing\n';
    const merged = prependSection(existing, newSection);
    assert.ok(merged.startsWith('# Changelog'));
    assert.ok(merged.indexOf('## Nightly 2026-04-20') < merged.indexOf('## Nightly 2026-04-19'));
    assert.ok(merged.includes('- new thing'));
    assert.ok(merged.includes('- old thing'));
});

test('prependSection works when file has no H1 yet', () => {
    const merged = prependSection('', '## Nightly 2026-04-20\n- hello\n');
    assert.ok(merged.startsWith('# Changelog'));
    assert.ok(merged.includes('## Nightly 2026-04-20'));
});
