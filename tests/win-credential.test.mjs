import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { loadProfileCredential, saveProfileCredential } from '../launcher/win-credential.mjs';

// The CredMan calls are Windows-only side effects; the profile-persistence
// layer is pure fs and testable everywhere.

test('saveProfileCredential + loadProfileCredential round-trip', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-cred-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'nested', 'credential.json');
    const rec = { blob: 'YWJjZA==', userName: 'antigravity', persist: 2, type: 1 };
    assert.equal(saveProfileCredential(file, rec), true);
    assert.deepEqual(loadProfileCredential(file), rec);
});

test('loadProfileCredential returns null for missing/corrupt files', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccp-cred-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    assert.equal(loadProfileCredential(path.join(dir, 'nope.json')), null);
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{not json');
    assert.equal(loadProfileCredential(bad), null);
});
