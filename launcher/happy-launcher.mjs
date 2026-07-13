// ClaudeCodePortable -- HappyCoder launcher entry point.
//
// Orchestrates:
//   1. Argument parsing (reuses launcher.mjs's parser)
//   2. Portable runtime installation (Node / Git / Bash / Perl / Python / PWSH)
//   3. Profile selection (--profile / env / auto-pick / picker)
//   4. Per-profile Claude Code install (happy wraps claude)
//   5. Per-profile happy-coder install
//   6. Spawn `happy` with inherited stdio so the session can be driven
//      locally or attached to from the Happy mobile/web client.

import fs   from 'node:fs';
import path from 'node:path';

import {
    PROFILES_ROOT, APP_ROOT,
    claudeConfigDir, npmCacheDir, npmGlobalDir,
} from './paths.mjs';
import { color, getVersionLine } from './ui.mjs';
import { parseArgs } from './args.mjs';
import { profilePath } from './profiles.mjs';
import { ensureAllRuntimes, ensureClaudeCode } from './install.mjs';
import { runSessionMenu } from './session-menu.mjs';
import {
    resolveProfile, setupPath, setPrivacyEnv, baseProfileEnv,
    ensureNpmTool, spawnTool,
} from './tool-launcher-core.mjs';

(async () => {
    const args = parseArgs(process.argv.slice(2));

    fs.mkdirSync(APP_ROOT,      { recursive: true });
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });

    try { await ensureAllRuntimes(); }
    catch (e) { console.error(color('red', 'Runtime install failed: ' + e.message)); process.exit(1); }

    setupPath();
    setPrivacyEnv();

    let profileName = await resolveProfile(args, { menuTitle: 'Select Happy (remote) profile' });
    if (!profileName) process.exit(0);

    while (true) {
        fs.mkdirSync(profilePath(profileName),     { recursive: true });
        fs.mkdirSync(npmCacheDir(profileName),     { recursive: true });
        fs.mkdirSync(npmGlobalDir(profileName),    { recursive: true });
        fs.mkdirSync(claudeConfigDir(profileName), { recursive: true });

        Object.assign(process.env, baseProfileEnv(profileName), {
            CLAUDE_PROFILE:    profileName,
            CLAUDE_CONFIG_DIR: claudeConfigDir(profileName),
        });

        try { ensureClaudeCode(profileName); }
        catch (e) { console.error(color('red', e.message)); process.exit(1); }

        // happy-coder looks up claude via `npm root -g`/@anthropic-ai/claude-code/cli.js,
        // but claude-code v2+ ships only a native binary + cli-wrapper.cjs. Drop an ESM
        // shim at cli.js that forwards to the CJS wrapper. Rewritten every run because
        // a daily update inside ensureClaudeCode can reinstall and wipe it.
        try { ensureClaudeCliShim(profileName); }
        catch (e) { console.error(color('red', e.message)); process.exit(1); }

        try { ensureNpmTool(profileName, 'happy-coder', 'happy', { label: 'happy-coder' }); }
        catch (e) { console.error(color('red', e.message)); process.exit(1); }

        printVersionBanner(profileName);

        let sessionArgs = [];
        if (!args.skipMenu) {
            const res = await runSessionMenu({ profileName, cwd: process.cwd() });
            if (res.action === 'quit') process.exit(0);
            if (res.action === 'switchProfile') {
                profileName = res.profile;
                continue;
            }
            if (res.action === 'last')        sessionArgs = ['--continue'];
            else if (res.action === 'resume') sessionArgs = ['--resume', res.sessionId];
            else if (res.action === 'new')    sessionArgs = [];
        }

        console.log('');
        console.log(color('green', 'Starting Happy (portable Claude Code, remote-ready)...'));
        console.log('Profile:          ' + profileName);
        console.log('Config directory: ' + claudeConfigDir(profileName));
        if (sessionArgs.length) console.log('Session:          ' + sessionArgs.join(' '));
        console.log('');

        // happy-coder forwards unknown flags through to claude, so --continue /
        // --resume <id> / --dangerously-skip-permissions reach the underlying
        // session as intended.
        process.exit(spawnTool('happy',
            ['--dangerously-skip-permissions', ...sessionArgs, ...args.forwarded]));
    }
})().catch(e => {
    console.error(color('red', 'FATAL: ' + (e && e.stack || e)));
    process.exit(1);
});

// ---------------------------------------------------------------------------
// Happy-specific glue
// ---------------------------------------------------------------------------
function ensureClaudeCliShim(profileName) {
    const prefix = npmGlobalDir(profileName);
    // On Windows `npm root -g` returns <prefix>/node_modules; on Unix it's
    // <prefix>/lib/node_modules. happy-coder uses that exact command, so the
    // shim has to land at the matching path.
    const candidates = [
        path.join(prefix, 'node_modules', '@anthropic-ai', 'claude-code'),
        path.join(prefix, 'lib', 'node_modules', '@anthropic-ai', 'claude-code'),
    ];
    const pkgDir = candidates.find(p => fs.existsSync(path.join(p, 'cli-wrapper.cjs')));
    if (!pkgDir) {
        throw new Error('Could not locate @anthropic-ai/claude-code package for the Happy shim.');
    }
    const shimPath = path.join(pkgDir, 'cli.js');
    const shim =
        '// happy-coder compatibility shim: forwards to the CJS wrapper so that\n' +
        '// `findNpmGlobalCliPath` in happy-coder can locate this cli.js and still\n' +
        '// spawn the native claude binary. Generated by ClaudeCodePortable.\n' +
        "import('./cli-wrapper.cjs');\n";
    try {
        const existing = fs.readFileSync(shimPath, 'utf8');
        if (existing === shim) return;
    } catch {}
    fs.writeFileSync(shimPath, shim);
}

function printVersionBanner(profileName) {
    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    const line = getVersionLine().replace(/^\s*runtimes:\s*/, '');
    console.log('  ' + line);
}
