import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    checkNode, checkGit, checkBash, checkPerl, checkPython,
    checkPowerShell, checkShaPins, checkShellRegistration, checkActiveProfile,
    formatResult,
} from '../launcher/doctor.mjs';

function hasShape(r) {
    assert.equal(typeof r,        'object');
    assert.equal(typeof r.ok,     'boolean');
    assert.equal(typeof r.name,   'string');
    assert.equal(typeof r.detail, 'string');
    assert.ok(['ok','warn','fail','skip'].includes(r.level));
}

test('every check returns a well-formed object, even on a clean machine', () => {
    for (const c of [checkNode, checkGit, checkBash, checkPerl, checkPython,
                     checkPowerShell, checkShaPins, checkShellRegistration]) {
        const r = c();
        hasShape(r);
    }
});

test('checkActiveProfile accepts an unknown profile without throwing', () => {
    const r = checkActiveProfile('this-profile-really-does-not-exist-xyz');
    hasShape(r);
    // Either "fail" (no claude-config) or "warn" (no cli installed) is fine;
    // never throws.
    assert.ok(['fail','warn','ok'].includes(r.level));
});

test('formatResult produces a non-empty printable line for every level', () => {
    for (const level of ['ok','warn','fail','skip']) {
        const line = formatResult({ ok: level !== 'fail', level, name: 'x', detail: 'y' });
        assert.ok(typeof line === 'string' && line.length > 0);
    }
});

test('checkShaPins does not throw when one dist has sha256: null', () => {
    // The live paths.mjs currently has some `null` entries on unsupported
    // platforms; whatever the current state, the call must not crash.
    const r = checkShaPins();
    hasShape(r);
});
