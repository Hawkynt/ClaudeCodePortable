import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { encodeCwd, scanSessions, deleteSession, moveSessionBetweenProfiles } from '../launcher/sessions.mjs';
import { PROFILES_ROOT } from '../launcher/paths.mjs';

test('encodeCwd replaces path separators + colons', () => {
    assert.equal(encodeCwd('D:\\Agents'), 'D--Agents');
    assert.equal(encodeCwd('C:\\Users\\Internet\\AppData'), 'C--Users-Internet-AppData');
    assert.equal(encodeCwd('/home/user/work'), '-home-user-work');
    assert.equal(encodeCwd('D:\\Agents\\'), 'D--Agents');
});

test('encodeCwd preserves existing dashes', () => {
    assert.equal(encodeCwd('D:\\Working-Copies\\Foo'), 'D--Working-Copies-Foo');
});

test('scanSessions handles missing project dir gracefully', () => {
    // non-existent profile + cwd should return [] without throwing
    const result = scanSessions('__nonexistent__', '/nonexistent/path');
    assert.deepEqual(result, []);
});

test('scanSessions parses a minimal jsonl session', (t) => {
    // Build a scratch profile tree in TEMP
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-test-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const profileName = path.basename(tmp);
    const cwd = '/fake/project';
    const projDir = path.join(tmp, 'claude-config', 'projects', encodeCwd(cwd));
    fs.mkdirSync(projDir, { recursive: true });

    // Redirect PROFILES_ROOT for this test by symlinking profile into real tree -- but
    // that's brittle; instead, place the tmp *inside* PROFILES_ROOT.
    const realProfileDir = path.join(PROFILES_ROOT, profileName);
    fs.mkdirSync(realProfileDir, { recursive: true });
    t.after(() => fs.rmSync(realProfileDir, { recursive: true, force: true }));
    const realProjDir = path.join(realProfileDir, 'claude-config', 'projects', encodeCwd(cwd));
    fs.mkdirSync(realProjDir, { recursive: true });

    const sid  = '00000000-0000-4000-8000-000000000001';
    const file = path.join(realProjDir, sid + '.jsonl');
    const lines = [
        { type: 'permission-mode', permissionMode: 'bypassPermissions', sessionId: sid },
        { type: 'user', message: { role: 'user', content: 'hello there' },
          timestamp: '2026-04-10T10:00:00Z', sessionId: sid },
        { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi back' }] },
          timestamp: '2026-04-10T10:00:05Z' },
        { type: 'user', message: { role: 'user', content: 'second prompt' },
          timestamp: '2026-04-10T10:01:00Z' },
    ];
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'));

    const sessions = scanSessions(profileName, cwd);
    assert.equal(sessions.length, 1);
    const s = sessions[0];
    assert.equal(s.sessionId, sid);
    assert.equal(s.firstPrompt, 'hello there');
    assert.equal(s.lastPrompt, 'second prompt');
    assert.equal(s.msgCount, 3);                                // 2 user + 1 assistant
    assert.ok(s.started instanceof Date);
    assert.ok(s.changed instanceof Date);
});

test('scanSessions filters system-injected user entries', (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-test-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const profileName = path.basename(tmp);
    const cwd = '/fake/project2';
    const realProfileDir = path.join(PROFILES_ROOT, profileName);
    fs.mkdirSync(realProfileDir, { recursive: true });
    t.after(() => fs.rmSync(realProfileDir, { recursive: true, force: true }));
    const projDir = path.join(realProfileDir, 'claude-config', 'projects', encodeCwd(cwd));
    fs.mkdirSync(projDir, { recursive: true });

    const sid  = '00000000-0000-4000-8000-000000000002';
    const file = path.join(projDir, sid + '.jsonl');
    const lines = [
        { type: 'user', message: { role: 'user', content: 'real prompt' },
          timestamp: '2026-04-10T10:00:00Z' },
        { type: 'user', message: { role: 'user', content: '<system-reminder>\nignore me\n</system-reminder>' },
          timestamp: '2026-04-10T10:00:30Z' },
        { type: 'user', message: { role: 'user', content: '<task-notification>bg</task-notification>' },
          timestamp: '2026-04-10T10:01:00Z' },
    ];
    fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'));

    const sessions = scanSessions(profileName, cwd);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].firstPrompt, 'real prompt');
    assert.equal(sessions[0].lastPrompt,  'real prompt');
    assert.equal(sessions[0].msgCount, 1);
});
