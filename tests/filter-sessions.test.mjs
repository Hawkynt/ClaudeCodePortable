import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSessions } from '../launcher/sessions.mjs';

function mk(id, { firstPrompt = '', lastPrompt = '', label = null, pinned = false } = {}) {
    return { sessionId: id, firstPrompt, lastPrompt, label, pinned };
}

test('empty query returns every session', () => {
    const all = [mk('a'), mk('b')];
    assert.equal(filterSessions(all, '').length, 2);
    assert.equal(filterSessions(all, null).length, 2);
});

test('substring match on firstPrompt', () => {
    const all = [
        mk('a', { firstPrompt: 'add a portable node launcher' }),
        mk('b', { firstPrompt: 'fix the flaky test' }),
    ];
    assert.deepEqual(filterSessions(all, 'launcher').map(s => s.sessionId), ['a']);
    assert.deepEqual(filterSessions(all, 'FLAKY').map(s => s.sessionId),    ['b']);
});

test('pinned session is always kept even when the query excludes it', () => {
    const all = [
        mk('pin', { firstPrompt: 'unrelated text', pinned: true }),
        mk('hit', { firstPrompt: 'launcher work' }),
        mk('miss', { firstPrompt: 'nothing matches' }),
    ];
    const out = filterSessions(all, 'launcher').map(s => s.sessionId);
    assert.ok(out.includes('pin'));
    assert.ok(out.includes('hit'));
    assert.ok(!out.includes('miss'));
});

test('label field is searched too', () => {
    const all = [
        mk('a', { label: 'feature X iteration 3' }),
        mk('b', { firstPrompt: 'irrelevant' }),
    ];
    assert.deepEqual(filterSessions(all, 'iteration').map(s => s.sessionId), ['a']);
});

test('sessionId is searched too', () => {
    const all = [mk('abc-session-123', { firstPrompt: 'x' })];
    assert.equal(filterSessions(all, 'session-123').length, 1);
});
