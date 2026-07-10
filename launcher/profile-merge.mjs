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

/** Parse `description:` out of a SKILL.md frontmatter block. */
function skillDescription(skillMd) {
    try {
        const txt = fs.readFileSync(skillMd, 'utf8');
        const m = /^---\r?\n[\s\S]*?^description:\s*(.+?)\r?\n[\s\S]*?^---/m.exec(txt);
        return m ? m[1].trim() : '';
    } catch { return ''; }
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
 *   { skills: [{name, description}], mcpServers: [names],
 *     statusline: bool, model: {model?, effortLevel?}|null, claudeMd: bool }
 */
export function listMergeableItems(sourceProfileName) {
    const cfg = claudeConfigDir(sourceProfileName);

    const skills = scanSkillsDir(path.join(cfg, 'skills'));

    const claudeJson = readJsonSafe(path.join(cfg, '.claude.json'));
    const mcpServers = Object.keys((claudeJson && claudeJson.mcpServers) || {}).sort();

    const settings = readJsonSafe(path.join(cfg, 'settings.json')) || {};
    const statusline = !!settings.statusLine
                    || fs.existsSync(path.join(cfg, 'statusline.py'));

    let model = null;
    for (const k of MODEL_KEYS) {
        if (settings[k] !== undefined) model = { ...(model || {}), [k]: settings[k] };
    }

    const claudeMd = fs.existsSync(path.join(cfg, 'CLAUDE.md'));

    return { skills, mcpServers, statusline, model, claudeMd };
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
 *   mcp:              true -> merge all mcpServers (target keys win)
 *   statusline:       true -> copy statusline.py + statusLine settings key
 *   model:            true -> copy model/effortLevel settings keys
 *   claudeMd:         true -> copy CLAUDE.md from the source profile
 *
 * Returns { merged: [labels], skipped: [labels] }. Throws only on a missing
 * source/target profile - individual absent items are reported, not thrown.
 */
export function mergeIntoProfile(targetProfileName, selections = {}) {
    const {
        fromProfile = null, skills = [], templateSkills = [], templateClaudeMd = false,
        mcp = false, statusline = false, model = false, claudeMd = false,
    } = selections;

    const merged = [], skipped = [];
    const dstCfg = claudeConfigDir(targetProfileName);
    if (!fs.existsSync(profilePath(targetProfileName))) {
        throw new Error(`Target profile not found: ${targetProfileName}`);
    }
    fs.mkdirSync(dstCfg, { recursive: true });

    const wantsSource = skills.length || mcp || statusline || model || claudeMd;
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
    if (mcp) {
        const srcServers = (readJsonSafe(path.join(srcCfg, '.claude.json')) || {}).mcpServers || {};
        const names = Object.keys(srcServers);
        if (!names.length) {
            skipped.push('MCP servers (source has none)');
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
    if (statusline) {
        const srcPy = path.join(srcCfg, 'statusline.py');
        const dstPy = path.join(dstCfg, 'statusline.py');
        const srcSettings = readJsonSafe(path.join(srcCfg, 'settings.json')) || {};
        const dstFile = path.join(dstCfg, 'settings.json');
        const dstSettings = readJsonSafe(dstFile) || {};

        const pyBlocked  = fs.existsSync(srcPy) && fs.existsSync(dstPy);
        const keyBlocked = srcSettings.statusLine !== undefined
                        && dstSettings.statusLine !== undefined;
        if (pyBlocked || keyBlocked) {
            skipped.push('statusline (already present in target)');
        } else if (!fs.existsSync(srcPy) && srcSettings.statusLine === undefined) {
            skipped.push('statusline (source has none)');
        } else {
            if (fs.existsSync(srcPy) && !fs.existsSync(dstPy)) fs.copyFileSync(srcPy, dstPy);
            if (srcSettings.statusLine !== undefined && dstSettings.statusLine === undefined) {
                dstSettings.statusLine = srcSettings.statusLine;
                writeJsonPretty(dstFile, dstSettings);
            }
            merged.push('statusline');
        }
    }

    // -- model configuration ------------------------------------------------
    if (model) {
        const srcSettings = readJsonSafe(path.join(srcCfg, 'settings.json')) || {};
        const dstFile = path.join(dstCfg, 'settings.json');
        const dstSettings = readJsonSafe(dstFile) || {};
        let touched = false;
        for (const k of MODEL_KEYS) {
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
        else if (!MODEL_KEYS.some(k => srcSettings[k] !== undefined)) {
            skipped.push('model configuration (source has none)');
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
