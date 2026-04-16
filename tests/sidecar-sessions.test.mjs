import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import {
    scanSessions, setSessionMeta, deleteSession, encodeCwd,
    moveSessionBetweenProfiles, pruneOrphanSidecars,
} from '../launcher/sessions.mjs';
import { PROFILES_ROOT, sessionMetaDir, claudeConfigDir } from '../launcher/paths.mjs';

function setupProfile(t, name, { withSession = true } = {}) {
    const projectsDir = path.join(claudeConfigDir(name), 'projects', encodeCwd('/fake/project-abc'));
    fs.mkdirSync(projectsDir, { recursive: true });
    const sid = '00000000-0000-4000-8000-000000000000';
    if (withSession) {
        const file = path.join(projectsDir, sid + '.jsonl');
        const lines = [
            { type: 'user', message: { role: 'user', content: 'real prompt' },
              timestamp: '2026-04-10T10:00:00Z' },
            { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
              timestamp: '2026-04-10T10:00:05Z' },
        ];
        fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'));
    }
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));
    return { name, sid, cwd: '/fake/project-abc' };
}

test('sidecar lives under cp-meta/ — nothing is written into claude-config/', (t) => {
    const p = setupProfile(t, 'cp-test-' + process.hrtime.bigint().toString());
    setSessionMeta(p.name, p.cwd, p.sid, { pinned: true, label: 'hello' });

    // Confirm cp-meta sidecar exists
    const sidecar = path.join(sessionMetaDir(p.name), encodeCwd(p.cwd), p.sid + '.json');
    assert.ok(fs.existsSync(sidecar), 'sidecar should exist under cp-meta/');

    // Confirm NOTHING new inside claude-config/projects/<cwd>/ other than the jsonl
    const projDir = path.join(claudeConfigDir(p.name), 'projects', encodeCwd(p.cwd));
    const entries = fs.readdirSync(projDir);
    assert.deepEqual(entries.filter(e => e.endsWith('.meta.json')), [],
        'no *.meta.json should leak into claude-config');
});

test('pinned session sorts above an older, more-recently-changed unpinned one', (t) => {
    const p = setupProfile(t, 'cp-sort-' + process.hrtime.bigint().toString(), { withSession: false });
    const dir = path.join(claudeConfigDir(p.name), 'projects', encodeCwd(p.cwd));

    function writeSession(sid, isoTs) {
        const file = path.join(dir, sid + '.jsonl');
        fs.writeFileSync(file, JSON.stringify({
            type: 'user', message: { role: 'user', content: sid },
            timestamp: isoTs,
        }));
        // Bump mtime so sort by changed works deterministically
        const t = new Date(isoTs);
        fs.utimesSync(file, t, t);
    }
    writeSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-04-10T10:00:00Z'); // old, will pin
    writeSession('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-04-15T10:00:00Z'); // newer

    setSessionMeta(p.name, p.cwd, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { pinned: true });
    const list = scanSessions(p.name, p.cwd);
    assert.equal(list.length, 2);
    assert.equal(list[0].sessionId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pinned first');
});

test('deleteSession removes the sidecar too', (t) => {
    const p = setupProfile(t, 'cp-del-' + process.hrtime.bigint().toString());
    setSessionMeta(p.name, p.cwd, p.sid, { pinned: true });

    const sessions = scanSessions(p.name, p.cwd);
    assert.equal(sessions.length, 1);

    deleteSession(sessions[0], p.name, p.cwd);
    const sidecar = path.join(sessionMetaDir(p.name), encodeCwd(p.cwd), p.sid + '.json');
    assert.ok(!fs.existsSync(sidecar));
});

test('moveSessionBetweenProfiles carries the sidecar', (t) => {
    const a = setupProfile(t, 'cp-mvA-' + process.hrtime.bigint().toString());
    const b = setupProfile(t, 'cp-mvB-' + process.hrtime.bigint().toString(), { withSession: false });

    setSessionMeta(a.name, a.cwd, a.sid, { pinned: true, label: 'keep me' });
    const sessions = scanSessions(a.name, a.cwd);
    assert.equal(sessions.length, 1);

    moveSessionBetweenProfiles(sessions[0], b.name, b.cwd, a.name);

    const oldSidecar = path.join(sessionMetaDir(a.name), encodeCwd(a.cwd), a.sid + '.json');
    const newSidecar = path.join(sessionMetaDir(b.name), encodeCwd(b.cwd), a.sid + '.json');
    assert.ok(!fs.existsSync(oldSidecar));
    assert.ok(fs.existsSync(newSidecar));
});

test('pruneOrphanSidecars removes sidecars whose jsonl no longer exists', (t) => {
    const p = setupProfile(t, 'cp-orph-' + process.hrtime.bigint().toString(), { withSession: false });

    // Write a sidecar for a session that has no .jsonl
    const sid = 'orphan-1';
    const metaDir = path.join(sessionMetaDir(p.name), encodeCwd(p.cwd));
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, sid + '.json'), JSON.stringify({ pinned: true }));

    pruneOrphanSidecars(p.name, p.cwd);
    assert.ok(!fs.existsSync(path.join(metaDir, sid + '.json')));
});
