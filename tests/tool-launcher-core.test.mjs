import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { baseProfileEnv, npmBinProbe } from '../launcher/tool-launcher-core.mjs';
import {
    IS_WIN, profileDataDir, npmCacheDir, npmGlobalDir,
    codexConfigDir, copilotConfigDir, copilotCacheDir, geminiHomeDir,
} from '../launcher/paths.mjs';

test('baseProfileEnv: redirects HOME + npm dirs into the profile', () => {
    const env = baseProfileEnv('envtest');
    assert.equal(env.HOME,              profileDataDir('envtest'));
    assert.equal(env.npm_config_cache,  npmCacheDir('envtest'));
    assert.equal(env.npm_config_prefix, npmGlobalDir('envtest'));
});

test('baseProfileEnv: npm-global is prepended to PATH', () => {
    const env = baseProfileEnv('envtest');
    const expectedPrefix = IS_WIN
        ? npmGlobalDir('envtest') + ';'
        : path.join(npmGlobalDir('envtest'), 'bin') + ':';
    assert.ok(env.PATH.startsWith(expectedPrefix));
});

test('baseProfileEnv: carries no tool-specific vars', () => {
    const env = baseProfileEnv('envtest');
    for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'COPILOT_HOME']) {
        assert.equal(env[k], undefined, `${k} must be added by the tool launcher, not the core`);
    }
});

test('npmBinProbe: platform-correct shim location', () => {
    const probe = npmBinProbe('envtest', 'codex');
    if (IS_WIN) assert.ok(probe.endsWith(path.join('npm-global', 'codex.cmd')));
    else        assert.ok(probe.endsWith(path.join('npm-global', 'bin', 'codex')));
});

test('sibling config dirs are disjoint per tool and per profile', () => {
    const dirs = [
        codexConfigDir('a'), copilotConfigDir('a'), copilotCacheDir('a'),
        geminiHomeDir('a'), codexConfigDir('b'),
    ];
    assert.equal(new Set(dirs).size, dirs.length);
    for (const d of dirs.slice(0, 4)) {
        assert.ok(d.includes(path.join('profiles', 'a') + path.sep) || d.includes(`${path.sep}a${path.sep}`),
            `${d} not under profile a`);
    }
});
