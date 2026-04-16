import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidProfileName } from '../launcher/profiles.mjs';

test('valid names', () => {
    for (const n of ['default', 'work', 'dev-test', 'my_profile', 'A1', 'profile.1']) {
        assert.equal(isValidProfileName(n), true, `expected "${n}" valid`);
    }
});

test('rejects path chars', () => {
    for (const n of ['a/b', 'a\\b', 'a:b', 'a?b', 'a*b', 'a"b', 'a<b', 'a>b', 'a|b']) {
        assert.equal(isValidProfileName(n), false, `expected "${n}" invalid`);
    }
});

test('rejects leading dot/dash', () => {
    assert.equal(isValidProfileName('.hidden'), false);
    assert.equal(isValidProfileName('-weird'), false);
});

test('rejects whitespace-only and empty', () => {
    assert.equal(isValidProfileName(''),   false);
    assert.equal(isValidProfileName('   '), false);
    assert.equal(isValidProfileName(null), false);
    assert.equal(isValidProfileName(undefined), false);
});

test('rejects leading/trailing whitespace', () => {
    assert.equal(isValidProfileName(' a'), false);
    assert.equal(isValidProfileName('a '), false);
});
