// Session (.jsonl) scanning, deletion, cross-profile moves, plus our own
// sidecar metadata (pinning + friendly labels) stored OUTSIDE Claude's
// claude-config/ directory so it cannot be clobbered or confused by
// Claude-side cleanup.

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profiles.mjs';
import { sessionMetaDir } from './paths.mjs';

const SKIP_PREFIXES = [
    '<command-name>', '<command-message>', '<command-args>',
    '<local-command-stdout>', '<local-command-stderr>',
    '<stdout>', '<stderr>',
    '<system-reminder>', '<bash-input>', '<bash-stdout>', '<bash-stderr>',
    '<task-notification>', '<user-prompt-submit-hook>',
    'Caveat: The messages', '[Request interrupted',
    'This session is being continued from a previous conversation',
    'Please continue the conversation from where we left it off',
];

export function encodeCwd(cwd) {
    return String(cwd).replace(/[\\/]+$/,'').replace(/[^A-Za-z0-9_-]/g, '-');
}

function resolveProjectDir(projectsDir, cwd) {
    const encoded = encodeCwd(cwd);
    const direct = path.join(projectsDir, encoded);
    try { if (fs.existsSync(direct)) return direct; } catch { /* fallthrough */ }
    let entries;
    try { entries = fs.readdirSync(projectsDir, { withFileTypes: true }); }
    catch { return null; }
    const name = entries.find(d => {
        try { return d.isDirectory() && d.name.toLowerCase() === encoded.toLowerCase(); }
        catch { return false; }
    });
    return name ? path.join(projectsDir, name.name) : null;
}

function isRealUserPrompt(text) {
    if (!text) return false;
    const t = String(text).trimStart();
    return !SKIP_PREFIXES.some(p => t.startsWith(p));
}

function extractUserText(message) {
    if (!message) return null;
    const c = message.content;
    if (c == null) return null;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        const parts = [];
        for (const blk of c) {
            if (blk && typeof blk === 'object' && typeof blk.text === 'string') parts.push(blk.text);
            else if (typeof blk === 'string') parts.push(blk);
        }
        return parts.length ? parts.join(' ') : null;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Sidecar metadata (pinned + label) under profiles/<name>/cp-meta/sessions/
// ---------------------------------------------------------------------------
function sidecarPath(profileName, cwd, sessionId) {
    return path.join(sessionMetaDir(profileName), encodeCwd(cwd), sessionId + '.json');
}

function readSidecar(profileName, cwd, sessionId) {
    const p = sidecarPath(profileName, cwd, sessionId);
    let raw;
    try { raw = fs.readFileSync(p, 'utf8'); } catch { return { pinned: false, label: null }; }
    try {
        const obj = JSON.parse(raw);
        return {
            pinned: obj && obj.pinned === true,
            label:  obj && typeof obj.label === 'string' ? obj.label : null,
        };
    } catch {
        // Corrupt sidecar: treat as absent, never fail the scan.
        return { pinned: false, label: null };
    }
}

export function setSessionMeta(profileName, cwd, sessionId, patch) {
    const current = readSidecar(profileName, cwd, sessionId);
    const next = { ...current, ...patch };
    // Drop label when it becomes empty so the row falls back to the uuid
    if (next.label === '' || next.label === null || next.label === undefined) next.label = null;
    const p = sidecarPath(profileName, cwd, sessionId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // If everything is at default, remove the sidecar to keep the tree tidy.
    if (!next.pinned && !next.label) {
        try { fs.rmSync(p, { force: true }); } catch {}
        return next;
    }
    fs.writeFileSync(p, JSON.stringify(next, null, 2));
    return next;
}

function deleteSidecar(profileName, cwd, sessionId) {
    const p = sidecarPath(profileName, cwd, sessionId);
    try { fs.rmSync(p, { force: true }); } catch {}
    // Best effort: remove the encoded-cwd dir if it becomes empty.
    try {
        const d = path.dirname(p);
        if (fs.existsSync(d) && fs.readdirSync(d).length === 0) fs.rmdirSync(d);
    } catch {}
}

/**
 * Remove sidecar files for sessions whose .jsonl no longer exists. Called
 * lazily from scanSessions so the cp-meta tree stays in sync.
 */
export function pruneOrphanSidecars(profileName, cwd) {
    const dir = path.join(sessionMetaDir(profileName), encodeCwd(cwd));
    if (!fs.existsSync(dir)) return;
    const projectsDir = path.join(profilePath(profileName), 'claude-config', 'projects');
    const projectDir  = resolveProjectDir(projectsDir, cwd);
    const live = new Set();
    if (projectDir) {
        try {
            for (const e of fs.readdirSync(projectDir, { withFileTypes: true })) {
                if (e.isFile() && e.name.endsWith('.jsonl')) live.add(e.name.slice(0, -'.jsonl'.length));
            }
        } catch { /* ignore -- better to keep sidecars than prune blindly */ return; }
    }
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!e.isFile() || !e.name.endsWith('.json')) continue;
            const sid = e.name.slice(0, -'.json'.length);
            if (!live.has(sid)) {
                try { fs.rmSync(path.join(dir, e.name), { force: true }); } catch {}
            }
        }
    } catch {}
}

// ---------------------------------------------------------------------------
// Parse + scan
// ---------------------------------------------------------------------------
function parseSessionFile(filePath, profileName, cwd) {
    let raw;
    try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
    const lines = raw.split('\n');

    let startTs = null, endTs = null;
    let firstPrompt = null, lastPrompt = null;
    let msgCount = 0;

    for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }      // tolerate bad lines
        try {
            if (obj.timestamp) {
                if (!startTs) startTs = obj.timestamp;
                endTs = obj.timestamp;
            }
            if (obj.type === 'assistant') msgCount++;
            if (obj.type === 'user' && obj.message && obj.message.role === 'user') {
                const txt = extractUserText(obj.message);
                if (isRealUserPrompt(txt)) {
                    msgCount++;
                    if (!firstPrompt) firstPrompt = txt;
                    lastPrompt = txt;
                }
            }
        } catch { /* line-level glitch: skip, keep scanning */ }
    }

    let started, changed;
    try { started = startTs ? new Date(startTs) : fs.statSync(filePath).birthtime; } catch { started = new Date(); }
    try { changed = endTs   ? new Date(endTs)   : fs.statSync(filePath).mtime;    } catch { changed = new Date(); }

    const sessionId = path.basename(filePath, '.jsonl');
    const meta = readSidecar(profileName, cwd, sessionId);

    return {
        sessionId,
        fullPath:    filePath,
        started,
        changed,
        firstPrompt: firstPrompt || '(no user prompt)',
        lastPrompt:  lastPrompt  || firstPrompt || '(no user prompt)',
        msgCount,
        pinned:      meta.pinned,
        label:       meta.label,
    };
}

/** Scan a profile's projects/<encoded-cwd>/ for sessions. Corrupt
 *  individual files are silently dropped so the menu always has a
 *  usable list. */
export function scanSessions(profileName, cwd) {
    const projectsDir = path.join(profilePath(profileName), 'claude-config', 'projects');
    const projectDir  = resolveProjectDir(projectsDir, cwd);
    if (!projectDir) return [];

    let files;
    try {
        files = fs.readdirSync(projectDir, { withFileTypes: true })
                  .filter(d => { try { return d.isFile() && d.name.endsWith('.jsonl'); } catch { return false; } })
                  .map(d => path.join(projectDir, d.name));
    } catch { return []; }

    const out = [];
    for (const f of files) {
        let st;
        try { st = fs.statSync(f); } catch { continue; }
        if (st.size === 0) continue;
        try {
            const session = parseSessionFile(f, profileName, cwd);
            if (session) out.push(session);
        } catch { /* per-file isolation */ }
    }

    // Pinned first, then newest by changed
    out.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.changed.getTime() - a.changed.getTime();
    });

    // Fire-and-forget orphan sidecar cleanup.
    try { pruneOrphanSidecars(profileName, cwd); } catch {}
    return out;
}

// ---------------------------------------------------------------------------
// Filtering (search bar)
// ---------------------------------------------------------------------------
/**
 * Filter a scanned-sessions array by a case-insensitive substring match
 * over firstPrompt/lastPrompt/label/sessionId. Pinned sessions are always
 * included so a pin is a durable promise.
 */
export function filterSessions(sessions, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(s => {
        if (s.pinned) return true;
        const hay = [
            s.firstPrompt, s.lastPrompt, s.label || '', s.sessionId,
        ].join('\u0000').toLowerCase();
        return hay.includes(q);
    });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function deleteSession(session, profileName, cwd) {
    const dir = path.dirname(session.fullPath);
    try { if (fs.existsSync(session.fullPath)) fs.rmSync(session.fullPath, { force: true }); } catch {}
    const sibling = path.join(dir, session.sessionId);
    try { if (fs.existsSync(sibling)) fs.rmSync(sibling, { recursive: true, force: true }); } catch {}
    if (profileName && cwd) deleteSidecar(profileName, cwd, session.sessionId);
}

/**
 * Move a session's .jsonl, its sibling UUID dir, AND its sidecar (if any)
 * from the source profile to the target, preserving the encoded-cwd
 * subdir in both trees.
 */
export function moveSessionBetweenProfiles(session, targetProfileName, cwd, fromProfileName = null) {
    const targetProjects   = path.join(profilePath(targetProfileName), 'claude-config', 'projects');
    const targetProjectDir = path.join(targetProjects, encodeCwd(cwd));
    fs.mkdirSync(targetProjectDir, { recursive: true });

    const destJsonl = path.join(targetProjectDir, session.sessionId + '.jsonl');
    fs.renameSync(session.fullPath, destJsonl);

    const srcSibling = path.join(path.dirname(session.fullPath), session.sessionId);
    if (fs.existsSync(srcSibling)) {
        try { fs.renameSync(srcSibling, path.join(targetProjectDir, session.sessionId)); } catch {}
    }

    // Move sidecar if present.
    if (fromProfileName) {
        const srcSidecar = sidecarPath(fromProfileName, cwd, session.sessionId);
        if (fs.existsSync(srcSidecar)) {
            const dstSidecar = sidecarPath(targetProfileName, cwd, session.sessionId);
            fs.mkdirSync(path.dirname(dstSidecar), { recursive: true });
            try { fs.renameSync(srcSidecar, dstSidecar); } catch {}
        }
    }
    return destJsonl;
}

/**
 * For CLI: locate a session by ID across profiles. Optionally constrained
 * to a specific source profile name.
 */
export function findSessionByIdAcrossProfiles(id, fromProfile = null, { listProfileNames }) {
    const profiles = fromProfile ? [fromProfile] : listProfileNames();
    for (const name of profiles) {
        const projects = path.join(profilePath(name), 'claude-config', 'projects');
        if (!fs.existsSync(projects)) continue;
        const hit = findJsonlRecursively(projects, id + '.jsonl');
        if (hit) return { profile: name, fullPath: hit };
    }
    return null;
}

function findJsonlRecursively(root, fileName) {
    const stack = [root];
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const p = path.join(d, e.name);
            try {
                if (e.isDirectory()) stack.push(p);
                else if (e.isFile() && e.name === fileName) return p;
            } catch { /* skip */ }
        }
    }
    return null;
}
