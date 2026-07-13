// Windows Credential Manager access for the Antigravity per-profile login
// swap. Antigravity stores its Google OAuth token in a machine-wide credential
// (`gemini:antigravity`) that HOME redirection cannot isolate; we swap each
// profile's saved token into that slot around launch so profiles stay
// independent. Windows-only - every function no-ops (returns null/false) on
// other platforms, where the keyring story differs (Secret Service / Keychain).

import fs   from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { IS_WIN, PORTABLE_ROOT } from './paths.mjs';

const PS_SCRIPT = path.join(PORTABLE_ROOT, 'launcher', 'agy-cred.ps1');

function runPs(args) {
    if (!IS_WIN) return null;
    const r = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT, ...args],
        { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return null;
    try { return JSON.parse((r.stdout || '').trim()); }
    catch { return null; }
}

/** Read a generic credential. Returns {blob,userName,persist,type} or null. */
export function readCredential(target) {
    const out = runPs(['-Verb', 'read', '-Target', target]);
    if (!out || !out.found) return null;
    return { blob: out.blob, userName: out.userName || '', persist: out.persist ?? 2, type: out.type ?? 1 };
}

/** Write a generic credential from a saved record. Returns true on success. */
export function writeCredential(target, rec) {
    if (!rec || !rec.blob) return false;
    const out = runPs([
        '-Verb', 'write', '-Target', target, '-Data', rec.blob,
        '-UserName', rec.userName || '', '-Persist', String(rec.persist ?? 2),
        '-Type', String(rec.type ?? 1),
    ]);
    return !!(out && out.ok);
}

export function deleteCredential(target) {
    const out = runPs(['-Verb', 'delete', '-Target', target]);
    return !!(out && out.ok);
}

// --- per-profile persistence -------------------------------------------------

/** Load a profile's saved credential record ({blob,userName,...}) or null. */
export function loadProfileCredential(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
}

/** Persist a credential record for a profile (restrictive perms best-effort). */
export function saveProfileCredential(file, rec) {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(rec), { mode: 0o600 });
        return true;
    } catch { return false; }
}
