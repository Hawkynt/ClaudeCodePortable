// Windows Explorer context-menu register/unregister via reg.exe.
// No-op on non-Windows.

import { spawnSync } from 'node:child_process';
import { listProfileNames } from './profiles.mjs';
import { LAUNCHER_BAT, PORTABLE_ROOT } from './paths.mjs';

const IS_WIN = process.platform === 'win32';
const BASE_USER    = 'HKCU\\Software\\Classes';
const BASE_MACHINE = 'HKLM\\Software\\Classes';

function baseFor(scope) { return scope === 'Machine' ? BASE_MACHINE : BASE_USER; }

function regRun(args) {
    const r = spawnSync('reg.exe', args, { encoding: 'utf8', windowsHide: true });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function regAdd(key, name, type, data) {
    const args = ['add', key, '/f'];
    if (name === '(default)') args.push('/ve');
    else { args.push('/v', name); }
    args.push('/t', type, '/d', data);
    return regRun(args);
}

function regDelete(key) {
    return regRun(['delete', key, '/f']);
}

function regQuery(key) {
    return regRun(['query', key]);
}

export function isShellRegistered() {
    if (!IS_WIN) return false;
    const r = regQuery(`${BASE_USER}\\Directory\\shell\\ClaudeCode`);
    return r.code === 0;
}

export function installShell({ scope = 'User' } = {}) {
    if (!IS_WIN) return { ok: false, reason: 'Not Windows' };
    const base = baseFor(scope);
    const shellKeys = [
        `${base}\\Directory\\shell\\ClaudeCode`,
        `${base}\\Directory\\Background\\shell\\ClaudeCode`,
    ];
    const subRoot = `${base}\\ClaudeCodeCmds`;
    const ICON    = '%SystemRoot%\\System32\\shell32.dll,71';

    // Start with a clean submenu subtree so stale profiles vanish.
    regDelete(subRoot);
    regAdd(subRoot, '(default)', 'REG_SZ', '');

    // Parent entries
    for (const k of shellKeys) {
        regDelete(k);
        regAdd(k, 'MUIVerb',                'REG_SZ', 'Open Claude Code');
        regAdd(k, 'Icon',                   'REG_EXPAND_SZ', ICON);
        regAdd(k, 'ExtendedSubCommandsKey', 'REG_SZ', 'ClaudeCodeCmds');
    }

    // Subcommand per profile
    const profiles = listProfileNames();
    if (!profiles.includes('default')) profiles.unshift('default');
    let i = 0;
    for (const p of profiles) {
        const label   = p === 'default' ? 'Open Claude (default) here' : `Open Claude (${p}) here`;
        const subName = `${String(i).padStart(2,'0')}-${p}`;
        const subKey  = `${subRoot}\\shell\\${subName}`;
        const cmdKey  = `${subKey}\\command`;
        regAdd(subKey,  'MUIVerb',  'REG_SZ',          label);
        regAdd(subKey,  'Icon',     'REG_EXPAND_SZ',   ICON);
        regAdd(cmdKey,  '(default)', 'REG_SZ',
               `cmd.exe /k "${LAUNCHER_BAT}" --profile ${p}`);
        i++;
    }

    return { ok: true, profiles };
}

export function uninstallShell({ scope = 'User' } = {}) {
    if (!IS_WIN) return { ok: false, reason: 'Not Windows' };
    const base = baseFor(scope);
    regDelete(`${base}\\Directory\\shell\\ClaudeCode`);
    regDelete(`${base}\\Directory\\Background\\shell\\ClaudeCode`);
    regDelete(`${base}\\ClaudeCodeCmds`);
    return { ok: true };
}
