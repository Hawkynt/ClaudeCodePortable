// Profile CRUD + metadata lookup.

import fs from 'node:fs';
import path from 'node:path';
import { PROFILES_ROOT } from './paths.mjs';

export function isValidProfileName(name) {
    if (!name || typeof name !== 'string') return false;
    if (/[\\/:*?"<>|]/.test(name))   return false;
    if (name.startsWith('.'))        return false;
    if (name.startsWith('-'))        return false;
    if (name.trim() !== name)        return false;
    return name.length > 0;
}

export function profilePath(name) {
    return path.join(PROFILES_ROOT, name);
}

export function listProfileNames() {
    if (!fs.existsSync(PROFILES_ROOT)) return [];
    return fs.readdirSync(PROFILES_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
}

export function createProfile(name) {
    if (!isValidProfileName(name)) throw new Error(`Invalid profile name: ${name}`);
    const dir = profilePath(name);
    if (fs.existsSync(dir))          throw new Error(`Profile already exists: ${name}`);
    fs.mkdirSync(path.join(dir, 'claude-config'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'npm-cache'),     { recursive: true });
    fs.mkdirSync(path.join(dir, 'npm-global'),    { recursive: true });
    return dir;
}

export function deleteProfile(name) {
    const dir = profilePath(name);
    if (!fs.existsSync(dir)) throw new Error(`Profile not found: ${name}`);
    fs.rmSync(dir, { recursive: true, force: true });
}

export function renameProfile(oldName, newName) {
    if (!isValidProfileName(newName)) throw new Error(`Invalid profile name: ${newName}`);
    const src = profilePath(oldName);
    const dst = profilePath(newName);
    if (!fs.existsSync(src)) throw new Error(`Profile not found: ${oldName}`);
    if (fs.existsSync(dst))  throw new Error(`Profile already exists: ${newName}`);
    fs.renameSync(src, dst);
}

/**
 * Load profile metadata: email (from oauthAccount.emailAddress in
 * claude-config/.claude.json), session count across all projects, and the
 * most recent session-file mtime.
 */
export function getProfileInfo(name) {
    const dir = profilePath(name);
    const info = {
        name,
        path: dir,
        email: '<not logged in>',
        sessionCount: 0,
        lastUsed: null,
    };

    const claudeJson = path.join(dir, 'claude-config', '.claude.json');
    if (fs.existsSync(claudeJson)) {
        try {
            const raw = fs.readFileSync(claudeJson, 'utf8');
            const j = JSON.parse(raw);
            if (j.oauthAccount && j.oauthAccount.emailAddress) {
                info.email = String(j.oauthAccount.emailAddress);
            }
        } catch { /* ignore */ }
    }

    const projects = path.join(dir, 'claude-config', 'projects');
    if (fs.existsSync(projects)) {
        const files = walkJsonl(projects);
        info.sessionCount = files.length;
        let newest = 0;
        for (const f of files) {
            try {
                const st = fs.statSync(f);
                if (st.mtimeMs > newest) newest = st.mtimeMs;
            } catch { /* ignore */ }
        }
        info.lastUsed = newest > 0 ? new Date(newest) : null;
    }

    return info;
}

function walkJsonl(root) {
    const out = [];
    const stack = [root];
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
        }
    }
    return out;
}

/**
 * Sort profiles: "default" first, then by most-recently-used descending.
 * If "exclude" is provided, that profile is omitted from the result.
 */
export function loadSortedProfiles({ exclude = null } = {}) {
    const names = listProfileNames().filter(n => n !== exclude);
    const infos = names.map(getProfileInfo);
    const defaultFirst = infos.filter(p => p.name === 'default');
    const rest = infos.filter(p => p.name !== 'default').sort((a, b) => {
        const at = a.lastUsed ? a.lastUsed.getTime() : 0;
        const bt = b.lastUsed ? b.lastUsed.getTime() : 0;
        return bt - at;
    });
    return [...defaultFirst, ...rest];
}
