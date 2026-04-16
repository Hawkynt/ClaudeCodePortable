import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import path from 'node:path';
import { scanSessions, encodeCwd } from '../launcher/sessions.mjs';
import { PROFILES_ROOT, claudeConfigDir, sessionMetaDir } from '../launcher/paths.mjs';
import { getProfileInfo, listProfileNames } from '../launcher/profiles.mjs';

function uniqueName(prefix) { return prefix + process.hrtime.bigint().toString(); }

test('scanSessions tolerates malformed lines (keeps the session)', (t) => {
    const name = uniqueName('cp-parse-');
    const cwd  = '/defensive/x';
    const dir  = path.join(claudeConfigDir(name), 'projects', encodeCwd(cwd));
    fs.mkdirSync(dir, { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));

    const sid  = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const file = path.join(dir, sid + '.jsonl');
    fs.writeFileSync(file, [
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' }, timestamp: '2026-04-10T10:00:00Z' }),
        '{not valid json',                                    // corrupt line
        JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } }),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'second' }, timestamp: '2026-04-10T10:01:00Z' }),
    ].join('\n'));

    const list = scanSessions(name, cwd);
    assert.equal(list.length, 1);
    assert.equal(list[0].firstPrompt, 'hello');
    assert.equal(list[0].lastPrompt,  'second');
});

test('scanSessions drops empty and unreadable files silently', (t) => {
    const name = uniqueName('cp-empty-');
    const cwd  = '/defensive/y';
    const dir  = path.join(claudeConfigDir(name), 'projects', encodeCwd(cwd));
    fs.mkdirSync(dir, { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));

    fs.writeFileSync(path.join(dir, 'empty.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'valid.jsonl'),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' },
                         timestamp: '2026-04-10T10:00:00Z' }));

    const list = scanSessions(name, cwd);
    assert.equal(list.length, 1);
    assert.equal(list[0].sessionId, 'valid');
});

test('corrupt sidecar falls back to pinned=false label=null', (t) => {
    const name = uniqueName('cp-badcar-');
    const cwd  = '/defensive/z';
    const dir  = path.join(claudeConfigDir(name), 'projects', encodeCwd(cwd));
    fs.mkdirSync(dir, { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));

    const sid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    fs.writeFileSync(path.join(dir, sid + '.jsonl'),
        JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' },
                         timestamp: '2026-04-10T10:00:00Z' }));
    const metaDir = path.join(sessionMetaDir(name), encodeCwd(cwd));
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, sid + '.json'), '{not json');

    const list = scanSessions(name, cwd);
    assert.equal(list.length, 1);
    assert.equal(list[0].pinned, false);
    assert.equal(list[0].label,  null);
});

test('getProfileInfo survives a corrupt .claude.json', (t) => {
    const name = uniqueName('cp-profjson-');
    const dir = claudeConfigDir(name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), '{not json');
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));

    const info = getProfileInfo(name);
    assert.equal(info.name, name);
    assert.equal(info.email, '<not logged in>');
});

test('listProfileNames hides invalid directory names like leading-dash', (t) => {
    const bad = path.join(PROFILES_ROOT, '-invalid');
    fs.mkdirSync(bad, { recursive: true });
    t.after(() => fs.rmSync(bad, { recursive: true, force: true }));

    const names = listProfileNames();
    assert.ok(!names.includes('-invalid'));
});
