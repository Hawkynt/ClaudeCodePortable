// Session-file (.jsonl) scanning, deletion, and cross-profile moves.

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profiles.mjs';

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
    if (fs.existsSync(direct)) return direct;
    // fallback: case-insensitive match
    if (!fs.existsSync(projectsDir)) return null;
    const name = fs.readdirSync(projectsDir, { withFileTypes: true })
        .find(d => d.isDirectory() && d.name.toLowerCase() === encoded.toLowerCase());
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

function parseSessionFile(filePath) {
    let startTs = null, endTs = null;
    let firstPrompt = null, lastPrompt = null;
    let msgCount = 0;
    let lines;
    try { lines = fs.readFileSync(filePath, 'utf8').split('\n'); } catch { return null; }
    for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
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
    }
    let started, changed;
    try { started = startTs ? new Date(startTs) : fs.statSync(filePath).birthtime; } catch { started = new Date(); }
    try { changed = endTs   ? new Date(endTs)   : fs.statSync(filePath).mtime;    } catch { changed = new Date(); }
    return {
        sessionId:   path.basename(filePath, '.jsonl'),
        fullPath:    filePath,
        started,
        changed,
        firstPrompt: firstPrompt || '(no user prompt)',
        lastPrompt:  lastPrompt  || firstPrompt || '(no user prompt)',
        msgCount,
    };
}

/** Scan a profile's projects/<encoded-cwd>/ for sessions. */
export function scanSessions(profileName, cwd) {
    const projectsDir = path.join(profilePath(profileName), 'claude-config', 'projects');
    const projectDir = resolveProjectDir(projectsDir, cwd);
    if (!projectDir) return [];
    const files = fs.readdirSync(projectDir, { withFileTypes: true })
        .filter(d => d.isFile() && d.name.endsWith('.jsonl'))
        .map(d => path.join(projectDir, d.name));
    const out = [];
    for (const f of files) {
        let st;
        try { st = fs.statSync(f); } catch { continue; }
        if (st.size === 0) continue;
        const session = parseSessionFile(f);
        if (session) out.push(session);
    }
    // Newest-first
    out.sort((a, b) => b.changed.getTime() - a.changed.getTime());
    return out;
}

export function deleteSession(session) {
    const dir = path.dirname(session.fullPath);
    if (fs.existsSync(session.fullPath)) {
        fs.rmSync(session.fullPath, { force: true });
    }
    const sibling = path.join(dir, session.sessionId);
    if (fs.existsSync(sibling)) {
        fs.rmSync(sibling, { recursive: true, force: true });
    }
}

/**
 * Move a session's .jsonl and its sibling UUID dir from the source profile
 * to the target profile, preserving the project (encoded-cwd) subdir.
 */
export function moveSessionBetweenProfiles(session, targetProfileName, cwd) {
    const targetProjects = path.join(profilePath(targetProfileName), 'claude-config', 'projects');
    const targetProjectDir = path.join(targetProjects, encodeCwd(cwd));
    fs.mkdirSync(targetProjectDir, { recursive: true });
    const destJsonl = path.join(targetProjectDir, session.sessionId + '.jsonl');
    fs.renameSync(session.fullPath, destJsonl);
    const srcSibling = path.join(path.dirname(session.fullPath), session.sessionId);
    if (fs.existsSync(srcSibling)) {
        fs.renameSync(srcSibling, path.join(targetProjectDir, session.sessionId));
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
            if (e.isDirectory()) stack.push(p);
            else if (e.isFile() && e.name === fileName) return p;
        }
    }
    return null;
}
