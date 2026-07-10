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
import { spawnSync } from 'node:child_process';

import {
    IS_WIN, PORTABLE_ROOT, PROFILES_ROOT, APP_ROOT,
    GIT_DIR, BASH_DIR, PYTHON_DIR, PWSH_DIR, PERL_DIR,
    nodeBinDir, claudeConfigDir, npmCacheDir, npmGlobalDir,
    profileDataDir,
} from './paths.mjs';
import { color, getVersionLine } from './ui.mjs';
import { parseArgs } from './args.mjs';
import {
    listProfileNames, createProfile, profilePath,
} from './profiles.mjs';
import { ensureAllRuntimes, ensureClaudeCode } from './install.mjs';
import { runProfileMenu } from './profile-menu.mjs';
import { runSessionMenu } from './session-menu.mjs';

(async () => {
    const args = parseArgs(process.argv.slice(2));

    fs.mkdirSync(APP_ROOT,      { recursive: true });
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });

    try { await ensureAllRuntimes(); }
    catch (e) { console.error(color('red', 'Runtime install failed: ' + e.message)); process.exit(1); }

    setupPath();
    setPrivacyEnv();

    let profileName = await resolveProfile(args);
    if (!profileName) process.exit(0);

    while (true) {
        fs.mkdirSync(profilePath(profileName),     { recursive: true });
        fs.mkdirSync(npmCacheDir(profileName),     { recursive: true });
        fs.mkdirSync(npmGlobalDir(profileName),    { recursive: true });
        fs.mkdirSync(claudeConfigDir(profileName), { recursive: true });

        Object.assign(process.env, profileEnv(profileName));

        try { ensureClaudeCode(profileName); }
        catch (e) { console.error(color('red', e.message)); process.exit(1); }

        // happy-coder looks up claude via `npm root -g`/@anthropic-ai/claude-code/cli.js,
        // but claude-code v2+ ships only a native binary + cli-wrapper.cjs. Drop an ESM
        // shim at cli.js that forwards to the CJS wrapper. Rewritten every run because
        // a daily update inside ensureClaudeCode can reinstall and wipe it.
        try { ensureClaudeCliShim(profileName); }
        catch (e) { console.error(color('red', e.message)); process.exit(1); }

        try { ensureHappyCoder(profileName); }
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

        // On Windows, npm-global installs CLIs as .cmd shims at the prefix root;
        // Node 22 can't spawn .cmd without shell:true (CVE-2024-27980 fix). On
        // Unix the bin is under <prefix>/bin and is directly executable.
        const cmd     = IS_WIN ? 'happy.cmd' : 'happy';
        // happy-coder forwards unknown flags through to claude, so --continue /
        // --resume <id> / --dangerously-skip-permissions reach the underlying
        // session as intended.
        const cmdArgs = ['--dangerously-skip-permissions', ...sessionArgs, ...args.forwarded];
        const r = spawnSync(cmd, cmdArgs, {
            stdio: 'inherit',
            shell: IS_WIN,
            windowsHide: false,
        });
        if (r.error) {
            console.error(color('red', 'Failed to start Happy: ' + r.error.message));
            process.exit(1);
        }
        process.exit(r.status ?? 0);
    }
})().catch(e => {
    console.error(color('red', 'FATAL: ' + (e && e.stack || e)));
    process.exit(1);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function resolveProfile(args) {
    if (args.profile) return args.profile;

    const names = listProfileNames();
    if (names.length === 0) {
        createProfile('default');
        return 'default';
    }
    if (names.length === 1) return names[0];
    if (args.skipMenu) return names.includes('default') ? 'default' : names[0];

    const r = await runProfileMenu({ title: 'Select Happy (remote) profile' });
    if (r.action === 'pick')  return r.profile;
    return null;
}

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

function ensureHappyCoder(profileName) {
    const prefix = npmGlobalDir(profileName);
    const probe  = IS_WIN
        ? path.join(prefix, 'happy.cmd')
        : path.join(prefix, 'bin', 'happy');
    if (fs.existsSync(probe)) return;

    console.log(color('cyan', `Installing happy-coder into profile [${profileName}] ...`));
    const env = {
        ...process.env,
        npm_config_cache:  npmCacheDir(profileName),
        npm_config_prefix: prefix,
    };
    const nodeExe = path.join(nodeBinDir(), IS_WIN ? 'node.exe' : 'node');
    const npmCli  = path.join(nodeBinDir(),
        IS_WIN ? 'node_modules/npm/bin/npm-cli.js'
               : '../lib/node_modules/npm/bin/npm-cli.js');
    const r = spawnSync(nodeExe,
        [npmCli, 'install', '-g', 'happy-coder@latest'],
        { stdio: 'inherit', env, windowsHide: true });
    if (r.status !== 0) {
        const detail = r.error ? (r.error.code || r.error.message)
                               : r.signal ? `signal ${r.signal}`
                               : `exit ${r.status}`;
        throw new Error(`Failed to install happy-coder (${detail}).`);
    }
    if (!fs.existsSync(probe)) {
        throw new Error(`happy-coder installed but 'happy' binary not found at ${probe}`);
    }
}

function setupPath() {
    const bins = [];
    bins.push(nodeBinDir());
    if (IS_WIN) {
        bins.push(path.join(GIT_DIR, 'cmd'));
        bins.push(path.join(BASH_DIR, 'bin'));
        bins.push(path.join(BASH_DIR, 'usr', 'bin'));
        bins.push(PYTHON_DIR);
        bins.push(path.join(PYTHON_DIR, 'Scripts'));
        bins.push(PWSH_DIR);
    } else {
        bins.push(path.join(PERL_DIR, 'bin'));
        bins.push(path.join(PYTHON_DIR, 'python', 'bin'));
        bins.push(PWSH_DIR);
    }
    const sep = IS_WIN ? ';' : ':';
    process.env.PATH = bins.filter(Boolean).join(sep) + sep + (process.env.PATH || '');
}

function setPrivacyEnv() {
    process.env.DISABLE_TELEMETRY       = '1';
    process.env.DISABLE_ERROR_REPORTING = '1';
    process.env.DISABLE_BUG_COMMAND     = '1';
}

function profileEnv(profileName) {
    return {
        CLAUDE_PROFILE:    profileName,
        CLAUDE_CONFIG_DIR: claudeConfigDir(profileName),
        HOME:              profileDataDir(profileName),
        npm_config_cache:  npmCacheDir(profileName),
        npm_config_prefix: npmGlobalDir(profileName),
        PATH: (IS_WIN
            ? npmGlobalDir(profileName) + ';'
            : path.join(npmGlobalDir(profileName), 'bin') + ':')
            + process.env.PATH,
    };
}

function printVersionBanner(profileName) {
    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    const line = getVersionLine().replace(/^\s*runtimes:\s*/, '');
    console.log('  ' + line);
}
