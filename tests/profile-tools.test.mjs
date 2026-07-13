import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import path from 'node:path';
import {
    createProfile, listProfileNames, profileTool, getProfileInfo,
    defaultProfileName,
} from '../launcher/profiles.mjs';
import {
    PROFILES_ROOT, codexConfigDir, copilotConfigDir, geminiHomeDir,
} from '../launcher/paths.mjs';

function uniq(prefix) { return prefix + '-' + process.hrtime.bigint().toString(); }

function mk(t, prefix, opts) {
    const name = uniq(prefix);
    createProfile(name, opts);
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));
    return name;
}

test('createProfile writes the .tool marker; profileTool reads it back', (t) => {
    const p = mk(t, 'pt-codex', { tool: 'codex' });
    assert.equal(profileTool(p), 'codex');
    assert.equal(fs.readFileSync(path.join(PROFILES_ROOT, p, '.tool'), 'utf8').trim(), 'codex');
});

test('profile without marker is a claude profile (legacy)', (t) => {
    const name = uniq('pt-legacy');
    fs.mkdirSync(path.join(PROFILES_ROOT, name, 'claude-config'), { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));
    assert.equal(profileTool(name), 'claude');
});

test('garbage marker falls back to claude', (t) => {
    const p = mk(t, 'pt-garbage', { tool: 'claude' });
    fs.writeFileSync(path.join(PROFILES_ROOT, p, '.tool'), 'vim\n');
    assert.equal(profileTool(p), 'claude');
});

test('listProfileNames({tool}) filters by owner', (t) => {
    const claude = mk(t, 'pt-c', { tool: 'claude' });
    const codex  = mk(t, 'pt-x', { tool: 'codex' });
    const all      = listProfileNames();
    const codexes  = listProfileNames({ tool: 'codex' });
    const claudes  = listProfileNames({ tool: 'claude' });
    assert.ok(all.includes(claude) && all.includes(codex));
    assert.ok(codexes.includes(codex)  && !codexes.includes(claude));
    assert.ok(claudes.includes(claude) && !claudes.includes(codex));
});

test('sibling profiles get no claude-config directory', (t) => {
    const p = mk(t, 'pt-nocc', { tool: 'copilot' });
    assert.ok(!fs.existsSync(path.join(PROFILES_ROOT, p, 'claude-config')));
    assert.ok(fs.existsSync(path.join(PROFILES_ROOT, p, 'npm-global')));
});

test('getProfileInfo on a codex profile shows the ChatGPT email, not claude', (t) => {
    const p = mk(t, 'pt-cxinfo', { tool: 'codex' });
    // Even if a stray claude-config with a login exists, codex identity wins.
    fs.mkdirSync(path.join(PROFILES_ROOT, p, 'claude-config'), { recursive: true });
    fs.writeFileSync(path.join(PROFILES_ROOT, p, 'claude-config', '.claude.json'),
        JSON.stringify({ oauthAccount: { emailAddress: 'WRONG@claude.login' } }));

    const payload = Buffer.from(JSON.stringify({ email: 'me@chatgpt.example' }))
        .toString('base64url');
    fs.mkdirSync(codexConfigDir(p), { recursive: true });
    fs.writeFileSync(path.join(codexConfigDir(p), 'auth.json'), JSON.stringify({
        tokens: { id_token: `x.${payload}.y` },
    }));

    const info = getProfileInfo(p);
    assert.equal(info.tool, 'codex');
    assert.equal(info.email, 'me@chatgpt.example');
});

test('getProfileInfo on a copilot profile picks up the GitHub login', (t) => {
    const p = mk(t, 'pt-cpinfo', { tool: 'copilot' });
    fs.mkdirSync(copilotConfigDir(p), { recursive: true });
    fs.writeFileSync(path.join(copilotConfigDir(p), 'config.json'),
        JSON.stringify({ login: 'octocat', other: 1 }));
    const info = getProfileInfo(p);
    assert.equal(info.tool, 'copilot');
    assert.equal(info.email, 'octocat');
});

test('getProfileInfo on an antigravity profile reads the email from cli.log', (t) => {
    const p = mk(t, 'pt-agyinfo', { tool: 'antigravity' });
    const logDir = path.join(geminiHomeDir(p), 'antigravity-cli');
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'cli.log'), [
        'I0713 08:00:00 server_oauth.go:219] OAuth: authenticated successfully as old@acct.example',
        'I0713 09:00:00 server_oauth.go:219] OAuth: authenticated successfully as new@acct.example',
    ].join('\n'));
    const info = getProfileInfo(p);
    assert.equal(info.tool, 'antigravity');
    assert.equal(info.email, 'new@acct.example');   // last line wins
});

test('getProfileInfo on unauthenticated sibling profile keeps the placeholder', (t) => {
    const p = mk(t, 'pt-fresh', { tool: 'codex' });
    const info = getProfileInfo(p);
    assert.equal(info.email, '<not logged in>');
});

test('defaultProfileName: claude keeps back-compat, siblings use their tool name', () => {
    assert.equal(defaultProfileName('claude'), 'default');
    assert.equal(defaultProfileName('codex'), 'codex');
    assert.equal(defaultProfileName('copilot'), 'copilot');
    assert.equal(defaultProfileName('antigravity'), 'antigravity');
});
