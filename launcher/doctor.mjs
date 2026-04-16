// ClaudeCodePortable health check.
//
// Each check is a small isolated function that returns
//   { ok: boolean, level: 'ok'|'warn'|'fail', name, detail }
// so the doctor never aborts mid-report. A single failing probe yields a
// single red line, not a crash.

import fs   from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
    IS_WIN, NODE_DIR, GIT_DIR, BASH_DIR, PERL_DIR, PYTHON_DIR, PWSH_DIR,
    NODE_VERSION, GIT_VERSION, PERL_VERSION, PY_VERSION, PWSH_VERSION,
    NODE_DIST, GIT_DIST, BASH_DIST, PERL_DIST, PY_DIST, PWSH_DIST,
    pickDist, nodeBinDir, claudeCli, claudeConfigDir, profileDataDir,
    PORTABLE_ROOT, LAUNCHER_BAT,
} from './paths.mjs';
import { c, color } from './ui.mjs';
import { listProfileNames, getProfileInfo } from './profiles.mjs';
import { isShellRegistered } from './registry.mjs';

function safeExec(cmd, args) {
    try {
        const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
        return ((r.stdout || '') + (r.stderr || '')).trim();
    } catch (e) { return `ERR: ${e.message}`; }
}

function firstMatch(text, re) {
    const m = re.exec(text || '');
    return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------
export function checkNode() {
    try {
        const binDir = nodeBinDir();
        const exe    = path.join(binDir, IS_WIN ? 'node.exe' : 'node');
        if (!fs.existsSync(exe)) return fail('node', `not installed (${exe})`);
        const out = safeExec(exe, ['-v']);
        const v   = (out || '').trim().replace(/^v/, '');
        if (v === NODE_VERSION) return ok('node', `${v} (matches pin)`);
        return warn('node', `${v} installed, pinned ${NODE_VERSION}`);
    } catch (e) { return fail('node', e.message); }
}

export function checkGit() {
    try {
        if (!IS_WIN) return skip('git', 'using system git on this platform');
        const exe = path.join(GIT_DIR, 'cmd', 'git.exe');
        if (!fs.existsSync(exe)) return fail('git', `not installed (${exe})`);
        const v = firstMatch(safeExec(exe, ['--version']), /git version\s+(\d+\.\d+\.\d+)/);
        if (!v) return warn('git', 'could not parse --version');
        if (v === GIT_VERSION) return ok('git', `${v} (MinGit)`);
        return warn('git', `${v} installed, pinned ${GIT_VERSION}`);
    } catch (e) { return fail('git', e.message); }
}

export function checkBash() {
    try {
        if (!IS_WIN) return skip('bash', 'using system bash on this platform');
        const exe = path.join(BASH_DIR, 'bin', 'bash.exe');
        if (!fs.existsSync(exe)) return fail('bash', `not installed (${exe})`);
        const v = firstMatch(safeExec(exe, ['--version']), /version\s+([\d.]+)/);
        if (!v) return warn('bash', 'could not parse --version');
        return ok('bash', `${v} (bundled PortableGit)`);
    } catch (e) { return fail('bash', e.message); }
}

export function checkPerl() {
    try {
        if (IS_WIN) {
            // Windows uses the perl bundled inside PortableGit under BASH_DIR.
            const exe = path.join(BASH_DIR, 'usr', 'bin', 'perl.exe');
            if (!fs.existsSync(exe)) return fail('perl', `not installed (${exe})`);
            const v = firstMatch(safeExec(exe, ['--version']), /\(v?([\d.]+)\)/);
            if (!v) return warn('perl', 'could not parse --version');
            return ok('perl', `${v} (bundled from PortableGit; no standalone pin)`);
        }
        const exe = path.join(PERL_DIR, 'bin', 'perl');
        if (!fs.existsSync(exe)) return fail('perl', `not installed (${exe})`);
        const v = firstMatch(safeExec(exe, ['--version']), /\(v?([\d.]+)\)/);
        if (!v) return warn('perl', 'could not parse --version');
        return ok('perl', `${v} (relocatable-perl)`);
    } catch (e) { return fail('perl', e.message); }
}

export function checkPython() {
    try {
        const exe = IS_WIN
            ? path.join(PYTHON_DIR, 'python.exe')
            : path.join(PYTHON_DIR, 'python', 'bin', 'python3');
        if (!fs.existsSync(exe)) return fail('python', `not installed (${exe})`);
        const v = firstMatch(safeExec(exe, ['--version']), /([\d.]+)/);
        if (!v) return warn('python', 'could not parse --version');
        if (v === PY_VERSION) return ok('python', `${v} (matches pin)`);
        return warn('python', `${v} installed, pinned ${PY_VERSION}`);
    } catch (e) { return fail('python', e.message); }
}

export function checkPowerShell() {
    try {
        const exe = IS_WIN
            ? path.join(PWSH_DIR, 'pwsh.exe')
            : path.join(PWSH_DIR, 'pwsh');
        if (!fs.existsSync(exe)) return fail('pwsh', `not installed (${exe})`);
        const v = firstMatch(safeExec(exe, ['--version']), /PowerShell\s+([\d.]+)/);
        if (!v) return warn('pwsh', 'could not parse --version');
        if (v === PWSH_VERSION) return ok('pwsh', `${v} (matches pin)`);
        return warn('pwsh', `${v} installed, pinned ${PWSH_VERSION}`);
    } catch (e) { return fail('pwsh', e.message); }
}

export function checkActiveProfile(profileName) {
    try {
        const cfg = claudeConfigDir(profileName);
        if (!fs.existsSync(cfg)) return fail('profile', `claude-config missing for ${profileName}`);
        const info = getProfileInfo(profileName);
        const cliPath = claudeCli(profileName);
        if (!fs.existsSync(cliPath)) return warn('profile',
            `${profileName}: Claude Code not installed (will install on next launch)`);
        return ok('profile', `${profileName} · ${info.email} · ${info.sessionCount} session(s)`);
    } catch (e) { return fail('profile', e.message); }
}

export function checkShellRegistration() {
    try {
        if (!IS_WIN)               return skip('shell-menu', 'Windows-only feature');
        if (!isShellRegistered())  return skip('shell-menu', 'not registered (run --register-shell to install)');
        // Query the registry to see whether the command path still matches
        // this launcher's location.
        const q = spawnSync('reg.exe', [
            'query', 'HKCU\\Software\\Classes\\ClaudeCodeCmds\\shell', '/s',
        ], { encoding: 'utf8', windowsHide: true });
        const expected = LAUNCHER_BAT.toLowerCase();
        const body = (q.stdout || '').toLowerCase();
        if (!body.includes(expected)) {
            return fail('shell-menu',
                `registry points at a different launcher path. Run Claude.bat --register-shell to refresh.`);
        }
        return ok('shell-menu', 'registered, launcher path matches');
    } catch (e) { return fail('shell-menu', e.message); }
}

export function checkShaPins() {
    try {
        const unpinned = [];
        function scan(label, map) {
            const d = pickDist(map);
            if (!d)       return;
            if (!d.sha256) unpinned.push(label);
        }
        scan('node',   NODE_DIST);
        scan('git',    GIT_DIST);
        scan('bash',   BASH_DIST);
        scan('perl',   PERL_DIST);
        scan('python', PY_DIST);
        scan('pwsh',   PWSH_DIST);
        if (unpinned.length === 0) return ok('sha256 pins', 'all tools pinned for current platform');
        return warn('sha256 pins', `unpinned: ${unpinned.join(', ')}`);
    } catch (e) { return fail('sha256 pins', e.message); }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
function ok  (name, detail) { return { ok: true,  level: 'ok',   name, detail }; }
function warn(name, detail) { return { ok: true,  level: 'warn', name, detail }; }
function fail(name, detail) { return { ok: false, level: 'fail', name, detail }; }
function skip(name, detail) { return { ok: true,  level: 'skip', name, detail }; }

export const ALL_CHECKS = [
    checkNode,
    checkGit,
    checkBash,
    checkPerl,
    checkPython,
    checkPowerShell,
    checkShaPins,
    checkShellRegistration,
    // checkActiveProfile is run separately -- needs profileName argument
];

export function formatResult(r) {
    const tag = {
        ok:   color('green',    '[ ok ]'),
        warn: color('yellow',   '[warn]'),
        fail: color('red',      '[fail]'),
        skip: color('darkgray', '[skip]'),
    }[r.level] || r.level;
    return `  ${tag}  ${r.name.padEnd(11)}  ${r.detail}`;
}

/**
 * Run every check and print a report. Returns a numeric exit code:
 *   0 = all ok/warn/skip
 *   1 = at least one hard failure
 */
export function runDoctor(profileName = 'default') {
    console.log('');
    console.log(color('cyan', 'Running ClaudeCodePortable doctor...'));
    console.log('');

    const results = [];
    for (const check of ALL_CHECKS) {
        try { results.push(check()); }
        catch (e) { results.push(fail(check.name || 'check', e.message)); }
    }
    // Profile check takes the active profile name
    try { results.push(checkActiveProfile(profileName)); }
    catch (e) { results.push(fail('profile', e.message)); }

    for (const r of results) console.log(formatResult(r));

    const counts = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const r of results) counts[r.level]++;

    console.log('');
    console.log(
        `${color('green',    counts.ok   + ' green')},  ` +
        `${color('yellow',   counts.warn + ' yellow')},  ` +
        `${color('red',      counts.fail + ' red')},  ` +
        `${color('darkgray', counts.skip + ' skipped')}`
    );

    return counts.fail === 0 ? 0 : 1;
}
