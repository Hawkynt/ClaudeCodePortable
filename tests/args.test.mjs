import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../launcher/args.mjs';

// Isolate tests from any env bleed-in from the launching shell.
function withCleanEnv(fn) {
    const saved = {
        CLAUDE_PROFILE:   process.env.CLAUDE_PROFILE,
        CLAUDE_SKIP_MENU: process.env.CLAUDE_SKIP_MENU,
    };
    delete process.env.CLAUDE_PROFILE;
    delete process.env.CLAUDE_SKIP_MENU;
    try { fn(); }
    finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    }
}

test('no args → default', () => {
    withCleanEnv(() => {
        const a = parseArgs([]);
        assert.equal(a.mode, null);
        assert.equal(a.profile, null);
        assert.equal(a.skipMenu, false);
        assert.deepEqual(a.forwarded, []);
    });
});

test('--profile consumes value', () => {
    const a = parseArgs(['--profile', 'work', '--new']);
    assert.equal(a.profile, 'work');
    assert.equal(a.skipMenu, true);
    assert.deepEqual(a.forwarded, []);
});

test('--continue forwards to claude and skips menu', () => {
    const a = parseArgs(['--continue']);
    assert.equal(a.skipMenu, true);
    assert.deepEqual(a.forwarded, ['--continue']);
});

test('--resume carries the id', () => {
    const a = parseArgs(['--resume', 'abc-123']);
    assert.equal(a.skipMenu, true);
    assert.deepEqual(a.forwarded, ['--resume', 'abc-123']);
});

test('-p triggers skipMenu and is forwarded', () => {
    const a = parseArgs(['-p', 'hello']);
    assert.equal(a.skipMenu, true);
    assert.deepEqual(a.forwarded, ['-p', 'hello']);
});

test('--move-session collects id / to / from', () => {
    const a = parseArgs(['--move-session', 'uuid-1', '--to', 'work', '--from', 'default']);
    assert.equal(a.mode, 'moveSession');
    assert.equal(a.moveSession.id, 'uuid-1');
    assert.equal(a.moveSession.to, 'work');
    assert.equal(a.moveSession.from, 'default');
});

test('--reinstall defaults to all', () => {
    const a = parseArgs(['--reinstall']);
    assert.equal(a.mode, 'reinstall');
    assert.equal(a.reinstallTarget, 'all');
});

test('--reinstall <tool> picks the tool', () => {
    const a = parseArgs(['--reinstall', 'git']);
    assert.equal(a.mode, 'reinstall');
    assert.equal(a.reinstallTarget, 'git');
});

test('unknown flags pass through', () => {
    const a = parseArgs(['--model', 'opus', '--verbose']);
    assert.deepEqual(a.forwarded, ['--model', 'opus', '--verbose']);
    assert.equal(a.skipMenu, false);
});

test('CLAUDE_SKIP_MENU=1 forces continue', (t) => {
    const old = process.env.CLAUDE_SKIP_MENU;
    const oldProf = process.env.CLAUDE_PROFILE;
    process.env.CLAUDE_SKIP_MENU = '1';
    delete process.env.CLAUDE_PROFILE;
    t.after(() => {
        if (old === undefined) delete process.env.CLAUDE_SKIP_MENU; else process.env.CLAUDE_SKIP_MENU = old;
        if (oldProf === undefined) delete process.env.CLAUDE_PROFILE; else process.env.CLAUDE_PROFILE = oldProf;
    });
    const a = parseArgs([]);
    assert.equal(a.skipMenu, true);
    assert.ok(a.forwarded.includes('--continue'));
});
