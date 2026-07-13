// Profile CRUD + metadata lookup.
//
// Profile ownership: every profile belongs to exactly one tool, recorded in
// a `.tool` marker file at the profile root. Profiles without a marker are
// Claude profiles (they predate multi-tool support). Pickers filter by tool
// so Codex never lists Claude logins and vice versa - the directories stay
// side by side under the same profiles/ root.

import fs from 'node:fs';
import path from 'node:path';
import {
    PROFILES_ROOT, codexConfigDir, copilotConfigDir, geminiHomeDir,
} from './paths.mjs';

export const KNOWN_TOOLS = ['claude', 'codex', 'copilot', 'antigravity'];

/** Which tool owns a profile. Missing/unreadable marker = 'claude' (legacy). */
export function profileTool(name) {
    try {
        const t = fs.readFileSync(path.join(profilePath(name), '.tool'), 'utf8').trim();
        return KNOWN_TOOLS.includes(t) ? t : 'claude';
    } catch { return 'claude'; }
}

/** The profile a tool auto-creates when none of its own exist yet. */
export function defaultProfileName(tool) {
    return tool === 'claude' ? 'default' : tool;
}

/**
 * One-time migration, safe to call every start: profiles created before
 * multi-tool support get an explicit 'claude' marker so ownership is
 * visible on disk, not just implied.
 */
export function ensureProfileMarkers() {
    for (const name of listProfileNames()) {
        const marker = path.join(profilePath(name), '.tool');
        try {
            if (!fs.existsSync(marker)) fs.writeFileSync(marker, 'claude\n');
        } catch { /* read-only media: implied-claude still works */ }
    }
}

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

export function listProfileNames({ tool = null } = {}) {
    let entries;
    try { entries = fs.readdirSync(PROFILES_ROOT, { withFileTypes: true }); }
    catch { return []; }
    const out = [];
    for (const d of entries) {
        try {
            if (!d.isDirectory()) continue;
        } catch { continue; }
        // Skip names that can't address a profile (leading dot/dash,
        // path-problematic chars) so the picker never renders a broken row.
        if (!isValidProfileName(d.name)) continue;
        if (tool && profileTool(d.name) !== tool) continue;
        out.push(d.name);
    }
    return out;
}

export function createProfile(name, { tool = 'claude' } = {}) {
    if (!isValidProfileName(name)) throw new Error(`Invalid profile name: ${name}`);
    const dir = profilePath(name);
    if (fs.existsSync(dir))          throw new Error(`Profile already exists: ${name}`);
    // Only Claude-family profiles get a claude-config; sibling tools create
    // their own config home on first launch.
    if (tool === 'claude') fs.mkdirSync(path.join(dir, 'claude-config'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'npm-cache'),  { recursive: true });
    fs.mkdirSync(path.join(dir, 'npm-global'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.tool'), tool + '\n');
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
 * Load profile metadata: the owning tool, that tool's OWN account identity
 * (never another tool's login), session count, and last-used time.
 */
export function getProfileInfo(name) {
    const dir = profilePath(name);
    const tool = profileTool(name);
    const info = {
        name,
        path: dir,
        tool,
        email: '<not logged in>',
        sessionCount: 0,
        lastUsed: null,
    };

    if (tool === 'codex')            fillCodexInfo(name, info);
    else if (tool === 'copilot')     fillCopilotInfo(name, info);
    else if (tool === 'antigravity') fillAntigravityInfo(name, info);
    else                             fillClaudeInfo(name, info);

    return info;
}

function fillClaudeInfo(name, info) {
    const dir = profilePath(name);
    // Email: anything going wrong parsing .claude.json leaves the default
    // "<not logged in>" string in place. Corrupted JSON never throws up.
    try {
        const claudeJson = path.join(dir, 'claude-config', '.claude.json');
        if (fs.existsSync(claudeJson)) {
            const raw = fs.readFileSync(claudeJson, 'utf8');
            const j = JSON.parse(raw);
            if (j && j.oauthAccount && j.oauthAccount.emailAddress) {
                info.email = String(j.oauthAccount.emailAddress);
            }
        }
    } catch { /* keep default */ }

    // Session count + lastUsed: tolerate any fs error
    try {
        const projects = path.join(dir, 'claude-config', 'projects');
        if (fs.existsSync(projects)) {
            const files = walkJsonl(projects);
            let count = 0;
            let newest = 0;
            for (const f of files) {
                try {
                    const st = fs.statSync(f);
                    // Skip zero-byte placeholders: Claude leaves an empty
                    // .jsonl for the session it is about to start, which would
                    // otherwise inflate the count by one. scanSessions() drops
                    // these too, so the picker and this number stay in sync.
                    if (st.size === 0) continue;
                    count++;
                    if (st.mtimeMs > newest) newest = st.mtimeMs;
                } catch { /* skip this file */ }
            }
            info.sessionCount = count;
            info.lastUsed = newest > 0 ? new Date(newest) : null;
        }
    } catch { /* keep zero / null */ }
}

function fillCodexInfo(name, info) {
    // Identity: auth.json's id_token is a JWT whose payload carries the
    // ChatGPT account email. Decode base64url payload, no verification -
    // this is display-only.
    try {
        const auth = JSON.parse(fs.readFileSync(
            path.join(codexConfigDir(name), 'auth.json'), 'utf8'));
        const idToken = auth && auth.tokens && auth.tokens.id_token;
        if (idToken) {
            const payload = JSON.parse(Buffer.from(
                idToken.split('.')[1], 'base64url').toString('utf8'));
            if (payload.email) info.email = String(payload.email);
        }
    } catch { /* keep default */ }
    countTreeInto(info, path.join(codexConfigDir(name), 'sessions'));
}

function fillCopilotInfo(name, info) {
    // Identity: config.json keeps the GitHub login of the authenticated
    // user (field name has varied across versions - probe the likely ones).
    try {
        const raw = fs.readFileSync(
            path.join(copilotConfigDir(name), 'config.json'), 'utf8');
        const m = /"(?:login|user|github_login|username)"\s*:\s*"([^"]+)"/.exec(raw);
        if (m) info.email = m[1];
    } catch { /* keep default */ }
    countTreeInto(info, path.join(copilotConfigDir(name), 'session-state'));
}

function fillAntigravityInfo(name, info) {
    // Login lives in the OS keyring (no readable identity file), but agy logs
    // the authenticated account on every start:
    //   "OAuth: authenticated successfully as <email>"
    // The last such line in cli.log is the current account.
    try {
        const log = fs.readFileSync(
            path.join(geminiHomeDir(name), 'antigravity-cli', 'cli.log'), 'utf8');
        const matches = log.match(/authenticated (?:successfully as|via)[^\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/g);
        if (matches && matches.length) {
            const last = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)/.exec(matches[matches.length - 1]);
            if (last) info.email = last[1];
        }
    } catch { /* keep default */ }
    countTreeInto(info, path.join(geminiHomeDir(name), 'antigravity-cli'));
    // A state dir full of settings isn't "sessions" - show activity time
    // but not a misleading count.
    info.sessionCount = 0;
}

/** Count files + newest mtime under a tree into info (best-effort). */
function countTreeInto(info, root) {
    try {
        if (!fs.existsSync(root)) return;
        let count = 0, newest = 0;
        const stack = [root];
        while (stack.length) {
            const d = stack.pop();
            let entries;
            try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
            for (const e of entries) {
                const p = path.join(d, e.name);
                try {
                    if (e.isDirectory()) { stack.push(p); continue; }
                    count++;
                    const st = fs.statSync(p);
                    if (st.mtimeMs > newest) newest = st.mtimeMs;
                } catch { /* skip */ }
            }
        }
        info.sessionCount = count;
        info.lastUsed = newest > 0 ? new Date(newest) : info.lastUsed;
    } catch { /* keep defaults */ }
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
            try {
                if (e.isDirectory()) stack.push(p);
                else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
            } catch { /* skip */ }
        }
    }
    return out;
}

/**
 * Sort profiles: "default" first, then by most-recently-used descending.
 * If "exclude" is provided, that profile is omitted from the result.
 * If "tool" is provided, only that tool's profiles are listed.
 */
export function loadSortedProfiles({ exclude = null, tool = null } = {}) {
    const names = listProfileNames({ tool }).filter(n => n !== exclude);
    const infos = names.map(getProfileInfo);
    const defaultFirst = infos.filter(p => p.name === 'default');
    const rest = infos.filter(p => p.name !== 'default').sort((a, b) => {
        const at = a.lastUsed ? a.lastUsed.getTime() : 0;
        const bt = b.lastUsed ? b.lastUsed.getTime() : 0;
        return bt - at;
    });
    return [...defaultFirst, ...rest];
}
