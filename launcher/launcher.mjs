// ClaudePortable launcher entry point.
//
// Orchestrates:
//   1. Argument parsing
//   2. Early-exit admin modes (list / new-profile / register-shell / move-session)
//   3. Portable runtime installation (Node / Git / Bash / Perl / Python / PowerShell)
//   4. Profile selection (override / env / auto-pick / picker)
//   5. Per-profile Claude Code install + daily update
//   6. Session menu loop (with profile-switch re-entry)
//   7. Spawn `claude` with resolved arguments and profile-scoped env

import fs   from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
    IS_WIN, PORTABLE_ROOT, PROFILES_ROOT, APP_ROOT,
    NODE_DIR, GIT_DIR, BASH_DIR, PERL_DIR, PYTHON_DIR, PWSH_DIR,
    nodeBinDir, claudeCli, claudeConfigDir, npmCacheDir, npmGlobalDir,
    profileDataDir,
} from './paths.mjs';
import { c, color, banner, getVersionLine } from './ui.mjs';
import { parseArgs } from './args.mjs';
import {
    listProfileNames, createProfile, isValidProfileName, profilePath,
} from './profiles.mjs';
import {
    ensureAllRuntimes, ensureClaudeCode,
} from './install.mjs';
import { runSessionMenu }  from './session-menu.mjs';
import { runProfileMenu }  from './profile-menu.mjs';
import {
    installShell, uninstallShell, isShellRegistered,
} from './registry.mjs';
import {
    findSessionByIdAcrossProfiles, moveSessionBetweenProfiles,
} from './sessions.mjs';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
    const args = parseArgs(process.argv.slice(2));

    // Make sure core dirs exist
    fs.mkdirSync(APP_ROOT,      { recursive: true });
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });

    // Early-exit modes ------------------------------------------------------
    if (args.mode === 'list') {
        handleListProfiles();
        process.exit(0);
    }
    if (args.mode === 'newProfile') {
        handleNewProfile(args.newProfileName);
        process.exit(0);
    }
    if (args.mode === 'regShell') {
        const r = installShell();
        if (!r.ok) { console.error(color('red', r.reason || 'install failed')); process.exit(1); }
        console.log(color('green', `Registered Explorer submenu with ${r.profiles.length} profile(s):`));
        for (const p of r.profiles) console.log(color('darkgreen', '  - ' + p));
        process.exit(0);
    }
    if (args.mode === 'unregShell') {
        const r = uninstallShell();
        if (!r.ok) { console.error(color('red', r.reason || 'uninstall failed')); process.exit(1); }
        console.log(color('green', 'Unregistered Explorer submenu.'));
        process.exit(0);
    }
    if (args.mode === 'moveSession') {
        handleMoveSession(args.moveSession);
        process.exit(0);
    }
    if (args.mode === 'reinstall') {
        handleReinstall(args.reinstallTarget || 'all');
        process.exit(0);
    }

    // Runtime installation --------------------------------------------------
    try { await ensureAllRuntimes(); }
    catch (e) { console.error(color('red', 'Runtime install failed: ' + e.message)); process.exit(1); }

    // Set PATH + shared env for every child process we spawn
    setupPath();
    setPrivacyEnv();
    setVersionLine();

    // Profile loop: re-enterable after a profile switch from the session menu
    let profileName = resolveProfile(args);
    if (!profileName) process.exit(0); // user aborted profile picker

    while (true) {
        fs.mkdirSync(profilePath(profileName), { recursive: true });
        fs.mkdirSync(npmCacheDir(profileName), { recursive: true });
        fs.mkdirSync(npmGlobalDir(profileName), { recursive: true });
        fs.mkdirSync(claudeConfigDir(profileName), { recursive: true });

        // Per-profile env overrides
        const perProfileEnv = profileEnv(profileName);
        Object.assign(process.env, perProfileEnv);

        try { ensureClaudeCode(profileName); }
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
            if (res.action === 'last') sessionArgs = ['--continue'];
            else if (res.action === 'resume') sessionArgs = ['--resume', res.sessionId];
            else if (res.action === 'new') sessionArgs = [];
        }

        // Launch Claude. We spawn `node cli.js` directly instead of going
        // through the claude.cmd wrapper -- Node's stdio inheritance through
        // a .cmd file on Windows is unreliable and can cause the child to
        // exit before drawing any UI.
        const cliJs    = claudeCli(profileName);
        const nodeExe  = path.join(nodeBinDir(), IS_WIN ? 'node.exe' : 'node');

        console.log('');
        console.log(color('green', 'Starting Claude Code (Portable)...'));
        console.log('Profile:          ' + profileName);
        console.log('Config directory: ' + claudeConfigDir(profileName));
        if (sessionArgs.length) console.log('Session:          ' + sessionArgs.join(' '));
        console.log('');

        const finalArgs = [cliJs, '--dangerously-skip-permissions', ...sessionArgs, ...args.forwarded];
        const r = spawnSync(nodeExe, finalArgs, { stdio: 'inherit' });
        if (r.error) {
            console.error(color('red', 'Failed to start Claude: ' + r.error.message));
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
function handleListProfiles() {
    if (!fs.existsSync(PROFILES_ROOT)) {
        console.log('No profiles directory yet.');
        return;
    }
    console.log('Profiles under ' + PROFILES_ROOT + ':');
    for (const name of listProfileNames()) console.log('  ' + name);
}

function handleNewProfile(name) {
    if (!name)                  { console.error('ERROR: --new-profile requires a name.'); process.exit(2); }
    if (!isValidProfileName(name)) { console.error('ERROR: invalid profile name.'); process.exit(2); }
    if (listProfileNames().includes(name)) {
        console.error(`Profile "${name}" already exists.`);
        process.exit(1);
    }
    createProfile(name);
    console.log(color('green', `Created profile "${name}" at ${profilePath(name)}.`));
    if (isShellRegistered()) {
        installShell();
        console.log(color('darkgreen', 'Explorer menu refreshed.'));
    }
}

function handleReinstall(target) {
    const dirs = {
        node:       NODE_DIR,
        git:        GIT_DIR,
        bash:       BASH_DIR,
        perl:       PERL_DIR,
        python:     PYTHON_DIR,
        powershell: PWSH_DIR,
    };
    const labels = Object.keys(dirs);
    const hits   = target === 'all' ? labels : [target];
    for (const name of hits) {
        const dir = dirs[name];
        if (!dir) { console.error(color('red', `Unknown reinstall target: ${name}`)); process.exit(2); }
        if (name === 'node') {
            // We're currently running from app/node -- can't wipe our own feet.
            console.log(color('yellow',
                'Skipping node: it is currently in use. Close all ClaudePortable launchers, then manually delete:\n  ' + dir));
            continue;
        }
        if (!fs.existsSync(dir)) {
            console.log(color('gray', `  ${name}: not installed (skipped)`));
            continue;
        }
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(color('green', `  ${name}: removed. Will reinstall on next launch.`));
        } catch (e) {
            console.error(color('red', `  ${name}: ${e.message}`));
        }
    }
    // Claude Code lives per-profile under npm-global; offer a separate target
    if (target === 'claude' || target === 'all-profiles') {
        for (const name of listProfileNames()) {
            const global = npmGlobalDir(name);
            const ncache = npmCacheDir(name);
            try {
                if (fs.existsSync(global)) { fs.rmSync(global, { recursive: true, force: true }); console.log(color('green', `  profile ${name}: npm-global removed`)); }
                if (fs.existsSync(ncache)) { fs.rmSync(ncache, { recursive: true, force: true }); console.log(color('green', `  profile ${name}: npm-cache removed`)); }
                const stamp = path.join(profileDataDir(name), 'last-update.txt');
                if (fs.existsSync(stamp)) fs.rmSync(stamp, { force: true });
            } catch (e) {
                console.error(color('red', `  profile ${name}: ${e.message}`));
            }
        }
    }
    console.log(color('cyan', 'Done. Re-run the launcher to re-install.'));
}

function handleMoveSession({ id, to, from }) {
    if (!id || !to) { console.error('ERROR: --move-session requires a session id and --to <profile>.'); process.exit(2); }
    const hit = findSessionByIdAcrossProfiles(id, from, { listProfileNames });
    if (!hit) {
        console.error(color('red', `Session ${id} not found in ${from ? `profile '${from}'` : 'any profile'}.`));
        process.exit(3);
    }
    // Reconstruct a session record that moveSessionBetweenProfiles understands
    const encodedCwdDir = path.dirname(hit.fullPath);
    const cwdEncoded    = path.basename(encodedCwdDir);
    const decodedCwd    = cwdEncoded; // best-effort; only used to recreate subdir
    const session = { sessionId: id, fullPath: hit.fullPath };
    moveSessionBetweenProfiles(session, to, decodedCwd);
    console.log(color('green', `Moved session ${id}:`));
    console.log(color('darkgreen', `  from: profiles/${hit.profile}/claude-config/projects/${cwdEncoded}/`));
    console.log(color('darkgreen', `  to:   profiles/${to}/claude-config/projects/${cwdEncoded}/`));
}

function resolveProfile(args) {
    if (args.profile) return args.profile;

    const names = listProfileNames();
    if (names.length === 0) {
        createProfile('default');
        return 'default';
    }
    if (names.length === 1) return names[0];

    if (args.skipMenu) return names.includes('default') ? 'default' : names[0];

    // Picker
    return runProfileMenuSync();
}

function runProfileMenuSync() {
    // runProfileMenu is async. Use dynamic import to avoid top-level await.
    const { runProfileMenu } = require('./profile-menu.mjs'); // eslint-disable-line
    return runProfileMenu().then(r => {
        if (r.action === 'pick')  return r.profile;
        if (r.action === 'quit' || r.action === 'abort') return null;
        return null;
    });
}

function setupPath() {
    const bins = [];
    bins.push(nodeBinDir());
    if (IS_WIN) {
        // On Windows: MinGit cmd comes FIRST so `git` resolves to the standalone
        // version, then PortableGit bin (bash) and usr/bin (bundled coreutils/perl),
        // then python, then pwsh.
        bins.push(path.join(GIT_DIR, 'cmd'));
        bins.push(path.join(BASH_DIR, 'bin'));
        bins.push(path.join(BASH_DIR, 'usr', 'bin'));
        bins.push(PYTHON_DIR);
        bins.push(path.join(PYTHON_DIR, 'Scripts'));
        bins.push(PWSH_DIR);
    } else {
        // Linux/macOS: relocatable-perl first, python-build-standalone bin, pwsh
        bins.push(path.join(PERL_DIR, 'bin'));
        bins.push(path.join(PYTHON_DIR, 'python', 'bin'));
        bins.push(PWSH_DIR);
    }
    const sep = IS_WIN ? ';' : ':';
    process.env.PATH = bins.filter(Boolean).join(sep) + sep + (process.env.PATH || '');
}

function setPrivacyEnv() {
    process.env.DISABLE_TELEMETRY        = '1';
    process.env.DISABLE_ERROR_REPORTING  = '1';
    process.env.DISABLE_BUG_COMMAND      = '1';
}

/** Pre-compute and export the compact runtime version line for child menus. */
function setVersionLine() {
    // We piggyback on ui.mjs's probing logic.
    const line = getVersionLine();
    // ui.mjs returns " runtimes: ..."; the env var holds the compact half only.
    process.env.CLAUDE_VERSION_LINE = line.replace(/^\s*runtimes:\s*/, '');
}

function profileEnv(profileName) {
    return {
        CLAUDE_PROFILE:      profileName,
        CLAUDE_CONFIG_DIR:   claudeConfigDir(profileName),
        HOME:                profileDataDir(profileName),
        npm_config_cache:    npmCacheDir(profileName),
        npm_config_prefix:   npmGlobalDir(profileName),
        // Prepend npm-global to PATH so claude binary resolves
        PATH: (IS_WIN ? npmGlobalDir(profileName) + ';' : path.join(npmGlobalDir(profileName), 'bin') + ':') + process.env.PATH,
    };
}

function printVersionBanner(profileName) {
    console.log('');
    console.log(color('cyan', `Portable runtimes attached (profile [${profileName}]):`));
    const line = getVersionLine().replace(/^\s*runtimes:\s*/, '');
    console.log('  ' + line);
}
