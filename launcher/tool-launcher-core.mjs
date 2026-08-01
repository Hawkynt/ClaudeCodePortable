// Shared building blocks for tool launchers (claude, happy, codex, copilot,
// antigravity). One implementation of the profile/PATH/env/install/spawn
// plumbing so per-tool launchers stay a thin descriptor + wiring file.

import fs   from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
    IS_WIN, GIT_DIR, BASH_DIR, PYTHON_DIR, PWSH_DIR,
    nodeBinDir, perlBinDir, npmCacheDir, npmGlobalDir, profileDataDir, lastUpdateFile,
} from './paths.mjs';
import { color } from './ui.mjs';
import {
    listProfileNames, createProfile, defaultProfileName, profileTool,
    ensureProfileMarkers,
} from './profiles.mjs';
import { runProfileMenu } from './profile-menu.mjs';

/**
 * Resolve which profile to use for a tool: --profile wins (created with the
 * tool's marker if new, rejected if owned by another tool). Interactive
 * starts ALWAYS show the picker - even with zero or one profile - so the
 * user can see which account a profile holds and manage profiles before
 * launch. --skip-menu takes the tool's default/first profile, auto-creating
 * it when none exists. Null when the user aborts.
 */
export async function resolveProfile(args, { tool = 'claude', menuTitle = 'Select profile' } = {}) {
    ensureProfileMarkers();   // legacy pre-multi-tool profiles become explicit claude

    if (args.profile) {
        if (!listProfileNames().includes(args.profile)) {
            createProfile(args.profile, { tool });   // marker written at birth
            return args.profile;
        }
        const owner = profileTool(args.profile);
        if (owner !== tool) {
            console.error(color('red',
                `Profile '${args.profile}' belongs to ${owner}, not ${tool}.`));
            return null;
        }
        return args.profile;
    }

    if (args.skipMenu) {
        const names = listProfileNames({ tool });
        if (names.length === 0) {
            const auto = defaultProfileName(tool);
            // The shared namespace may already hold a foreign profile with
            // that name; find a free variant rather than hijacking it.
            let name = auto, i = 2;
            while (listProfileNames().includes(name)) name = `${auto}-${i++}`;
            createProfile(name, { tool });
            return name;
        }
        const auto = defaultProfileName(tool);
        return names.includes(auto) ? auto : names[0];
    }

    const r = await runProfileMenu({ title: menuTitle, tool });
    if (r.action === 'pick') return r.profile;
    return null;
}

/** Prepend all portable runtime bin dirs to PATH. */
export function setupPath() {
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
        bins.push(perlBinDir());
        bins.push(path.join(PYTHON_DIR, 'python', 'bin'));
        bins.push(PWSH_DIR);
    }
    const sep = IS_WIN ? ';' : ':';
    process.env.PATH = bins.filter(Boolean).join(sep) + sep + (process.env.PATH || '');
}

export function setPrivacyEnv() {
    process.env.DISABLE_TELEMETRY       = '1';
    process.env.DISABLE_ERROR_REPORTING = '1';
    process.env.DISABLE_BUG_COMMAND     = '1';
}

/**
 * Tool-agnostic per-profile env: profile-local npm cache/prefix, HOME
 * redirected into the profile, npm-global on PATH. Tool launchers spread
 * their own vars (CODEX_HOME, COPILOT_HOME, CLAUDE_CONFIG_DIR, ...) on top.
 */
export function baseProfileEnv(profileName) {
    return {
        HOME:              profileDataDir(profileName),
        npm_config_cache:  npmCacheDir(profileName),
        npm_config_prefix: npmGlobalDir(profileName),
        PATH: (IS_WIN
            ? npmGlobalDir(profileName) + ';'
            : path.join(npmGlobalDir(profileName), 'bin') + ':')
            + process.env.PATH,
    };
}

/** Where an npm-global-installed CLI's entry shim lives for probing. */
export function npmBinProbe(profileName, binName) {
    const prefix = npmGlobalDir(profileName);
    return IS_WIN
        ? path.join(prefix, binName + '.cmd')
        : path.join(prefix, 'bin', binName);
}

function todayYmd() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Install (and daily-update) an npm-distributed CLI into a profile's
 * npm-global prefix. Invokes npm-cli.js through node directly - the .cmd
 * shim cannot be spawned on Node 22+ (CVE-2024-27980).
 *
 * opts.updateStampKey: suffix so multiple tools sharing lastUpdateFile don't
 * clobber each other's daily stamp (a per-tool stamp file is used).
 */
export function ensureNpmTool(profileName, pkgName, binName, { label = pkgName } = {}) {
    const probe = npmBinProbe(profileName, binName);
    const stamp = lastUpdateFile(profileName).replace(/\.txt$/, `-${binName}.txt`);

    const installed = fs.existsSync(probe);
    if (installed) {
        // Daily update check, same policy as ensureClaudeCode.
        let last = '';
        try { last = fs.readFileSync(stamp, 'utf8').trim(); } catch {}
        if (last === todayYmd()) return;
    }

    console.log(color('cyan',
        (installed ? `Checking ${label} update for` : `Installing ${label} into`)
        + ` profile [${profileName}] ...`));
    const env = {
        ...process.env,
        npm_config_cache:  npmCacheDir(profileName),
        npm_config_prefix: npmGlobalDir(profileName),
    };
    const nodeExe = path.join(nodeBinDir(), IS_WIN ? 'node.exe' : 'node');
    const npmCli  = path.join(nodeBinDir(),
        IS_WIN ? 'node_modules/npm/bin/npm-cli.js'
               : '../lib/node_modules/npm/bin/npm-cli.js');
    const r = spawnSync(nodeExe, [npmCli, 'install', '-g', `${pkgName}@latest`],
        { stdio: 'inherit', env, windowsHide: true });
    if (r.status !== 0) {
        // An update failure on an already-working install is a warning, not fatal.
        const detail = r.error ? (r.error.code || r.error.message)
                               : r.signal ? `signal ${r.signal}`
                               : `exit ${r.status}`;
        if (!installed) throw new Error(`Failed to install ${label} (${detail}).`);
        console.log(color('yellow', `  update failed (${detail}); keeping existing install.`));
        return;
    }
    if (!fs.existsSync(probe)) {
        throw new Error(`${label} installed but '${binName}' binary not found at ${probe}`);
    }
    try { fs.writeFileSync(stamp, todayYmd()); } catch {}
}

/**
 * Spawn a CLI with inherited stdio. On Windows npm-global CLIs are .cmd
 * shims, which Node 22 refuses to spawn without shell:true.
 * Returns the child's exit code.
 */
export function spawnTool(binName, cmdArgs, { shell = IS_WIN } = {}) {
    const cmd = IS_WIN && shell ? binName + '.cmd' : binName;
    const r = spawnSync(cmd, cmdArgs, {
        stdio: 'inherit',
        shell,
        windowsHide: false,
    });
    if (r.error) {
        console.error(color('red', `Failed to start ${binName}: ${r.error.message}`));
        return 1;
    }
    return r.status ?? 0;
}
