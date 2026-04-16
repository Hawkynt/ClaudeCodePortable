import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truncate, relativeTime, padRight, padLeft, color } from '../launcher/ui.mjs';

test('truncate leaves short strings alone', () => {
    assert.equal(truncate('hello', 10), 'hello');
});

test('truncate cuts with ellipsis', () => {
    assert.equal(truncate('abcdefghijklmno', 8), 'abcde...');
});

test('truncate flattens whitespace', () => {
    assert.equal(truncate('hello\nworld   foo'), 'hello world foo');
});

test('truncate handles empty/null', () => {
    assert.equal(truncate(''), '');
    assert.equal(truncate(null), '');
});

test('relativeTime: seconds', () => {
    const now = new Date(Date.now() - 12_000);
    assert.match(relativeTime(now), /^\d+s ago$/);
});

test('relativeTime: minutes', () => {
    const now = new Date(Date.now() - 5 * 60_000);
    assert.match(relativeTime(now), /^\d+m ago$/);
});

test('relativeTime: hours', () => {
    const now = new Date(Date.now() - 3 * 3600_000);
    assert.match(relativeTime(now), /^\d+h ago$/);
});

test('relativeTime: days', () => {
    const now = new Date(Date.now() - 5 * 86400_000);
    assert.match(relativeTime(now), /^\d+d ago$/);
});

test('relativeTime: null => never used', () => {
    assert.equal(relativeTime(null), '(never used)');
});

test('padRight fits long strings', () => {
    assert.equal(padRight('hi', 5),  'hi   ');
    assert.equal(padRight('hello', 3), 'hello');
});

test('padLeft', () => {
    assert.equal(padLeft('5', 3), '  5');
    assert.equal(padLeft('12345', 3), '12345');
});

test('color wraps with ANSI codes', () => {
    const s = color('green', 'ok');
    assert.ok(s.includes('\x1b['));
    assert.ok(s.includes('ok'));
    assert.ok(s.endsWith('\x1b[0m'));
});

test('color falls back to text for unknown color', () => {
    assert.equal(color('neon-pink', 'x'), 'x');
});
