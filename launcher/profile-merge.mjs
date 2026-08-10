// Selective config merge between profiles and from the template skill
// library (templates/skills/ at the portable root).
//
// Semantics: strictly ADDITIVE and non-destructive. Anything already present
// in the target wins and is reported in `skipped` - a merge never clobbers a
// profile's own skills, servers, statusline, settings, or CLAUDE.md.

import fs   from 'node:fs';
import path from 'node:path';
import { claudeConfigDir, TEMPLATE_SKILLS_DIR, TEMPLATE_CLAUDE_MD } from './paths.mjs';
import { profilePath } from './profiles.mjs';

// Keys of settings.json that constitute "model configuration".
const MODEL_KEYS = ['model', 'effortLevel'];

// settings.json keys that are NOT offered as plain key/value picks because a
// dedicated merge item owns them (and copies their sidecar files).
const SETTINGS_OWNED_ELSEWHERE = new Set(['statusLine']);

// ---------------------------------------------------------------------------
// Tolerant IO helpers - a corrupt file means "nothing there", never a crash.
// ---------------------------------------------------------------------------
function readJsonSafe(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
}

function writeJsonPretty(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

/** Parse `description:` out of a SKILL.md frontmatter block. Descriptions
 *  are YAML double-quoted (strict parsers reject bare colons) - unquote. */
function skillDescription(skillMd) {
    try {
        const txt = fs.readFileSync(skillMd, 'utf8');
        const m = /^---\r?\n[\s\S]*?^description:\s*(.+?)\r?\n[\s\S]*?^---/m.exec(txt);
        if (!m) return '';
        const raw = m[1].trim();
        if (raw.startsWith('"')) {
            try { return JSON.parse(raw); } catch { /* fall through */ }
        }
        return raw;
    } catch { return ''; }
}

/**
 * Same-content test for two files. Bytes first; failing that, text files are
 * compared with line endings normalized - a skill that only picked up CRLF on
 * the way through git or a copy is still the same skill.
 */
function filesEqual(a, b) {
    let ba, bb;
    try { ba = fs.readFileSync(a); bb = fs.readFileSync(b); } catch { return false; }
    if (ba.equals(bb)) return true;
    if (ba.includes(0) || bb.includes(0)) return false;   // binary - bytes are the only truth
    return ba.toString('utf8').replace(/\r\n/g, '\n')
        === bb.toString('utf8').replace(/\r\n/g, '\n');
}

/** Recursive same-content comparison of two directory trees. */
function dirsEqual(a, b) {
    let ea, eb;
    try {
        ea = fs.readdirSync(a, { withFileTypes: true });
        eb = fs.readdirSync(b, { withFileTypes: true });
    } catch { return false; }
    const names = new Set([...ea, ...eb].map(d => d.name));
    if (names.size !== ea.length || names.size !== eb.length) return false;
    for (const name of names) {
        const pa = path.join(a, name), pb = path.join(b, name);
        let sa, sb;
        try { sa = fs.statSync(pa); sb = fs.statSync(pb); } catch { return false; }
        if (sa.isDirectory() !== sb.isDirectory()) return false;
        if (sa.isDirectory()) {
            if (!dirsEqual(pa, pb)) return false;
            continue;
        }
        if (!filesEqual(pa, pb)) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Status line: the setting decides which files matter, not a hardcoded name.
// ---------------------------------------------------------------------------

/** Split a shell-ish command into tokens, honoring "..." and '...' quoting. */
function shellTokens(command) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(command)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
}

/**
 * Expand the variables Claude Code makes available in a statusLine command,
 * plus `~`, to `cfgDir`-relative form. Unknown variables are left alone so the
 * token simply fails to resolve to a file we own.
 */
function expandConfigVars(token, cfgDir) {
    return token
        .replace(/\$\{CLAUDE_CONFIG_DIR\}|\$CLAUDE_CONFIG_DIR|%CLAUDE_CONFIG_DIR%/g, cfgDir)
        // `~/.claude/x` is how a non-portable install spells the same thing.
        .replace(/^(~|\$\{?HOME\}?|%USERPROFILE%)[\\/]\.claude(?=[\\/]|$)/, cfgDir)
        .replace(/^(~|\$\{?HOME\}?|%USERPROFILE%)(?=[\\/]|$)/, cfgDir);
}

/**
 * Which files inside `cfgDir` does this statusLine command reference?
 *
 * Returns config-dir-relative POSIX paths (e.g. `statusline.js`,
 * `bin/statusline/main.py`) for every token that resolves to something that
 * exists under `cfgDir`. Tokens pointing outside the config dir (system
 * interpreters, absolute paths elsewhere) are deliberately ignored - we can
 * only carry along what lives in the profile.
 */
export function statuslineAssets(cfgDir, statusLine) {
    const command = statusLine && typeof statusLine === 'object' ? statusLine.command : statusLine;
    if (typeof command !== 'string' || !command.trim()) return [];

    const root = path.resolve(cfgDir);
    const seen = new Set();
    for (const raw of shellTokens(command)) {
        const token = expandConfigVars(raw, root);
        // A bare `python` or a flag is not a path; require a separator or an
        // extension before we even try to resolve it.
        if (!/[\\/]/.test(token) && !/\.[A-Za-z0-9]+$/.test(token)) continue;
        if (token.startsWith('-')) continue;
        const abs = path.resolve(root, token);
        const rel = path.relative(root, abs);
        // Outside the config dir (or the config dir itself) - not ours to copy.
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
        if (!fs.existsSync(abs)) continue;
        seen.add(rel.split(path.sep).join('/'));
    }
    return [...seen].sort();
}

/**
 * Rewrite absolute references to the SOURCE config dir as $CLAUDE_CONFIG_DIR,
 * so the copied setting points at the target's own copy of the script instead
 * of reaching back into the profile it came from.
 */
function reanchorStatusline(statusLine, srcCfg) {
    if (!statusLine || typeof statusLine !== 'object'
        || typeof statusLine.command !== 'string') return statusLine;
    const root = path.resolve(srcCfg);
    const variants = new Set([root, root.split(path.sep).join('/'), root.split('/').join('\\')]);
    let command = statusLine.command;
    for (const v of variants) {
        if (!v) continue;
        command = command.split(v).join('$CLAUDE_CONFIG_DIR');
    }
    return command === statusLine.command ? statusLine : { ...statusLine, command };
}

/** Status line files a profile carries when settings.json says nothing. */
const LEGACY_STATUSLINE_FILES = ['statusline.py', 'statusline.js', 'statusline.sh'];

/**
 * Everything needed to reproduce a profile's status line elsewhere:
 * { statusLine: <settings value|null>, assets: [relative paths] }, or null
 * when the profile has no status line at all.
 */
function readStatusline(cfgDir, settings) {
    const value  = settings.statusLine;
    const assets = statuslineAssets(cfgDir, value);
    if (value !== undefined) return { statusLine: value, assets };
    // No setting, but a script is sitting there: still worth carrying over so
    // the user can wire it up (matches how this profile was likely set up).
    const orphans = LEGACY_STATUSLINE_FILES.filter(f => fs.existsSync(path.join(cfgDir, f)));
    if (!orphans.length) return null;
    return { statusLine: undefined, assets: orphans };
}

/** List skill dirs (must contain SKILL.md) under a skills/ root. */
function scanSkillsDir(root) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch { return []; }
    const out = [];
    for (const d of entries) {
        try { if (!d.isDirectory()) continue; } catch { continue; }
        const md = path.join(root, d.name, 'SKILL.md');
        if (!fs.existsSync(md)) continue;
        out.push({ name: d.name, description: skillDescription(md) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

/** What the template library offers: [{ name, description }] */
export function listTemplateSkills() {
    return scanSkillsDir(TEMPLATE_SKILLS_DIR);
}

/**
 * What a source profile offers for merging:
 *   { skills:      [{name, description, sameAsTemplate}],
 *     mcpServers:  [names],
 *     statusline:  bool,
 *     statuslineInfo: { statusLine, assets: [relative paths] } | null,
 *     settings:    { key: value }   (every settings.json key we can merge)
 *     model:       {model?, effortLevel?} | null,
 *     claudeMd:    bool }
 *
 * `sameAsTemplate` marks a skill whose directory has the same contents as the
 * shipped template of the same name - the caller should offer the template
 * instead of listing the same content twice.
 */
export function listMergeableItems(sourceProfileName) {
    const cfg = claudeConfigDir(sourceProfileName);

    const srcSkillsRoot = path.join(cfg, 'skills');
    const skills = scanSkillsDir(srcSkillsRoot).map(s => ({
        ...s,
        sameAsTemplate: dirsEqual(path.join(srcSkillsRoot, s.name),
                                  path.join(TEMPLATE_SKILLS_DIR, s.name)),
    }));

    const claudeJson = readJsonSafe(path.join(cfg, '.claude.json'));
    const mcpServers = Object.keys((claudeJson && claudeJson.mcpServers) || {}).sort();

    const settingsJson = readJsonSafe(path.join(cfg, 'settings.json')) || {};
    const statuslineInfo = readStatusline(cfg, settingsJson);

    const settings = {};
    for (const k of Object.keys(settingsJson).sort()) {
        if (SETTINGS_OWNED_ELSEWHERE.has(k)) continue;
        settings[k] = settingsJson[k];
    }

    let model = null;
    for (const k of MODEL_KEYS) {
        if (settingsJson[k] !== undefined) model = { ...(model || {}), [k]: settingsJson[k] };
    }

    const claudeMd = fs.existsSync(path.join(cfg, 'CLAUDE.md'));

    return {
        skills, mcpServers,
        statusline: !!statuslineInfo, statuslineInfo,
        settings, model, claudeMd,
    };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------
function copySkillDir(srcDir, dstSkillsRoot, name, merged, skipped, origin) {
    const src = path.join(srcDir, name);
    const dst = path.join(dstSkillsRoot, name);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) {
        skipped.push(`skill '${name}' (${origin}: not found)`);
        return;
    }
    if (fs.existsSync(dst)) {
        skipped.push(`skill '${name}' (already present in target)`);
        return;
    }
    fs.mkdirSync(dstSkillsRoot, { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
    merged.push(`skill '${name}' (${origin})`);
}

/**
 * Merge selected items into `targetProfileName`.
 *
 * selections:
 *   fromProfile:      source profile name (required for skills/mcp/statusline/
 *                     model/claudeMd; not for templateSkills/templateClaudeMd)
 *   skills:           array of skill names from the source profile
 *   templateSkills:   array of skill names from templates/skills/
 *   templateClaudeMd: true -> copy templates/CLAUDE.md (skill gate)
 *   mcp:              true -> all mcpServers, or an array of server names
 *   statusline:       true -> copy the files the statusLine command points at
 *                             (any name, any subfolder) + the settings key
 *   settings:         array of settings.json keys to copy
 *   model:            true -> shorthand for settings: ['model','effortLevel']
 *   claudeMd:         true -> copy CLAUDE.md from the source profile
 *
 * Target values always win: an existing key/file is reported in `skipped`.
 *
 * Returns { merged: [labels], skipped: [labels] }. Throws only on a missing
 * source/target profile - individual absent items are reported, not thrown.
 */
export function mergeIntoProfile(targetProfileName, selections = {}) {
    const {
        fromProfile = null, skills = [], templateSkills = [], templateClaudeMd = false,
        mcp = false, statusline = false, settings = [], model = false, claudeMd = false,
    } = selections;

    // `model: true` predates per-key selection; fold it into `settings`.
    const settingsKeys = [...new Set([...settings, ...(model ? MODEL_KEYS : [])])];

    const merged = [], skipped = [];
    const dstCfg = claudeConfigDir(targetProfileName);
    if (!fs.existsSync(profilePath(targetProfileName))) {
        throw new Error(`Target profile not found: ${targetProfileName}`);
    }
    fs.mkdirSync(dstCfg, { recursive: true });

    const wantsMcp    = mcp === true || (Array.isArray(mcp) && mcp.length > 0);
    const wantsSource = skills.length || wantsMcp || statusline
                     || settingsKeys.length || claudeMd;
    let srcCfg = null;
    if (wantsSource) {
        if (!fromProfile) throw new Error('fromProfile is required for the selected items');
        if (!fs.existsSync(profilePath(fromProfile))) {
            throw new Error(`Source profile not found: ${fromProfile}`);
        }
        srcCfg = claudeConfigDir(fromProfile);
    }

    // -- skills (from source profile) --------------------------------------
    const dstSkills = path.join(dstCfg, 'skills');
    for (const name of skills) {
        copySkillDir(path.join(srcCfg, 'skills'), dstSkills, name, merged, skipped,
            `from '${fromProfile}'`);
    }

    // -- skills (from template library) -------------------------------------
    for (const name of templateSkills) {
        copySkillDir(TEMPLATE_SKILLS_DIR, dstSkills, name, merged, skipped, 'template');
    }

    // -- CLAUDE.md (from template library) -----------------------------------
    if (templateClaudeMd) {
        const dst = path.join(dstCfg, 'CLAUDE.md');
        if (!fs.existsSync(TEMPLATE_CLAUDE_MD)) skipped.push('CLAUDE.md (no template shipped)');
        else if (fs.existsSync(dst)) skipped.push('CLAUDE.md (already present in target)');
        else { fs.copyFileSync(TEMPLATE_CLAUDE_MD, dst); merged.push('CLAUDE.md (template)'); }
    }

    // -- MCP servers ---------------------------------------------------------
    if (wantsMcp) {
        const srcServers = (readJsonSafe(path.join(srcCfg, '.claude.json')) || {}).mcpServers || {};
        // `mcp: true` means every server; an array narrows it to those names.
        const names = mcp === true
            ? Object.keys(srcServers)
            : mcp.filter(n => {
                if (srcServers[n] !== undefined) return true;
                skipped.push(`MCP server '${n}' (not found in source)`);
                return false;
            });
        if (!names.length) {
            if (mcp === true) skipped.push('MCP servers (source has none)');
        } else {
            const dstFile = path.join(dstCfg, '.claude.json');
            const dstJson = readJsonSafe(dstFile) || {};
            dstJson.mcpServers = dstJson.mcpServers || {};
            for (const n of names) {
                if (dstJson.mcpServers[n] !== undefined) {
                    skipped.push(`MCP server '${n}' (already present in target)`);
                } else {
                    dstJson.mcpServers[n] = srcServers[n];
                    merged.push(`MCP server '${n}'`);
                }
            }
            writeJsonPretty(dstFile, dstJson);
        }
    }

    // -- status line -----------------------------------------------------------
    // All-or-nothing on purpose: a statusLine key whose script did not come
    // along (or a script with no key) is a broken status line, so if any part
    // is already occupied in the target we touch nothing.
    if (statusline) {
        const srcSettings = readJsonSafe(path.join(srcCfg, 'settings.json')) || {};
        const dstFile = path.join(dstCfg, 'settings.json');
        const dstSettings = readJsonSafe(dstFile) || {};
        const info = readStatusline(srcCfg, srcSettings);

        const blocked = info && (
            dstSettings.statusLine !== undefined ||
            info.assets.some(rel => fs.existsSync(path.join(dstCfg, rel))));

        if (!info) {
            skipped.push('statusline (source has none)');
        } else if (blocked) {
            skipped.push('statusline (already present in target)');
        } else {
            for (const rel of info.assets) {
                const dst = path.join(dstCfg, rel);
                // The command may point into a subfolder - create it, or the
                // copied setting would reference a path that does not exist.
                fs.mkdirSync(path.dirname(dst), { recursive: true });
                fs.cpSync(path.join(srcCfg, rel), dst, { recursive: true });
            }
            if (info.statusLine !== undefined) {
                dstSettings.statusLine = reanchorStatusline(info.statusLine, srcCfg);
                writeJsonPretty(dstFile, dstSettings);
            }
            merged.push(info.assets.length
                ? `statusline (${info.assets.join(', ')})`
                : 'statusline');
        }
    }

    // -- settings keys ---------------------------------------------------------
    if (settingsKeys.length) {
        const srcSettings = readJsonSafe(path.join(srcCfg, 'settings.json')) || {};
        const dstFile = path.join(dstCfg, 'settings.json');
        const dstSettings = readJsonSafe(dstFile) || {};
        let touched = false;
        for (const k of settingsKeys) {
            if (srcSettings[k] === undefined) continue;
            if (dstSettings[k] !== undefined) {
                skipped.push(`setting '${k}' (already set in target)`);
                continue;
            }
            dstSettings[k] = srcSettings[k];
            merged.push(`setting '${k}' = ${JSON.stringify(srcSettings[k])}`);
            touched = true;
        }
        if (touched) writeJsonPretty(dstFile, dstSettings);
        else if (!settingsKeys.some(k => srcSettings[k] !== undefined)) {
            skipped.push(model && settingsKeys.length === MODEL_KEYS.length
                ? 'model configuration (source has none)'
                : 'settings (source has none of the selected keys)');
        }
    }

    // -- CLAUDE.md -------------------------------------------------------------
    if (claudeMd) {
        const src = path.join(srcCfg, 'CLAUDE.md');
        const dst = path.join(dstCfg, 'CLAUDE.md');
        if (!fs.existsSync(src)) skipped.push('CLAUDE.md (source has none)');
        else if (fs.existsSync(dst)) skipped.push('CLAUDE.md (already present in target)');
        else { fs.copyFileSync(src, dst); merged.push('CLAUDE.md'); }
    }

    return { merged, skipped };
}
