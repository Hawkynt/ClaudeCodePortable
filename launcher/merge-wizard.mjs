// Interactive wizard: pick config items from the template library and/or
// another profile, merge them into a target profile. Used right after
// creating a profile and via [M] on an existing one.

import fs from 'node:fs';
import { color, banner, clearScreen, multiSelect, readKey, truncate } from './ui.mjs';
import { loadSortedProfiles } from './profiles.mjs';
import { TEMPLATE_CLAUDE_MD } from './paths.mjs';
import {
    listMergeableItems, listTemplateSkills, mergeIntoProfile,
} from './profile-merge.mjs';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Let the user pick a source profile (or none). Returns a profile name or
 * null. Excludes the target itself.
 */
async function pickSourceProfile(targetProfile) {
    const profiles = loadSortedProfiles({ exclude: targetProfile });
    if (profiles.length === 0) return null;

    clearScreen();
    banner(`Merge into '${targetProfile}' — pick a source profile`, 'magenta');
    console.log(color('darkmagenta', ' skills/MCP/statusline/model can be copied from another profile.'));
    console.log(color('darkmagenta', ' [Esc]/[Enter] skip — use only the template library'));
    console.log('');
    const keys = '123456789ABCDEFGHIJKLMNOPRSTUVWYZ'.split('');
    const map = {};
    for (let i = 0; i < Math.min(profiles.length, keys.length); i++) {
        map[keys[i]] = profiles[i].name;
        console.log(color('yellow', ` [${keys[i]}] ${profiles[i].name}  (${profiles[i].email})`));
    }
    console.log('');
    process.stdout.write('Source profile: ');
    const k = await readKey();
    if (k.isEscape || k.isEnter) { process.stdout.write('<none>\n'); return null; }
    const ch = (k.sequence || '').toUpperCase();
    process.stdout.write(ch + '\n');
    return map[ch] || null;
}

/**
 * Build the combined multi-select item list. Each entry carries a `pick`
 * descriptor consumed by applySelection().
 */
function buildItems(sourceProfile) {
    const items = [];

    const templates = listTemplateSkills();
    const hasTemplateClaudeMd = fs.existsSync(TEMPLATE_CLAUDE_MD);
    if (templates.length || hasTemplateClaudeMd) {
        items.push({ header: true, label: `Templates (shipped with the launcher):` });
        for (const s of templates) {
            items.push({
                label: `${s.name} — ${truncate(s.description, 70)}`,
                pick: { kind: 'templateSkill', name: s.name },
            });
        }
        if (hasTemplateClaudeMd) {
            items.push({
                label: 'CLAUDE.md — skill-gate global instructions',
                pick: { kind: 'templateClaudeMd' },
            });
        }
    }

    if (sourceProfile) {
        const avail = listMergeableItems(sourceProfile);
        const any = avail.skills.length || avail.mcpServers.length
                 || avail.statusline || avail.model || avail.claudeMd;
        if (any) items.push({ header: true, label: `From profile '${sourceProfile}':` });
        for (const s of avail.skills) {
            items.push({
                label: `skill ${s.name} — ${truncate(s.description, 60)}`,
                pick: { kind: 'skill', name: s.name },
            });
        }
        if (avail.mcpServers.length) {
            items.push({
                label: `MCP servers (${avail.mcpServers.join(', ')})`,
                pick: { kind: 'mcp' },
            });
        }
        if (avail.statusline) {
            items.push({ label: 'status line (statusline.py + setting)', pick: { kind: 'statusline' } });
        }
        if (avail.model) {
            const desc = Object.entries(avail.model).map(([k, v]) => `${k}=${v}`).join(', ');
            items.push({ label: `model configuration (${desc})`, pick: { kind: 'model' } });
        }
        if (avail.claudeMd) {
            items.push({ label: 'CLAUDE.md (global instructions)', pick: { kind: 'claudeMd' } });
        }
    }

    return items;
}

function toSelections(items, indices, sourceProfile) {
    const sel = {
        fromProfile: sourceProfile, skills: [], templateSkills: [], templateClaudeMd: false,
        mcp: false, statusline: false, model: false, claudeMd: false,
    };
    for (const i of indices) {
        const p = items[i].pick;
        if (!p) continue;
        if (p.kind === 'templateSkill') sel.templateSkills.push(p.name);
        else if (p.kind === 'skill')    sel.skills.push(p.name);
        else                            sel[p.kind] = true;
    }
    return sel;
}

/**
 * Run the wizard against `targetProfile`. Returns true if anything merged.
 */
export async function runMergeWizard(targetProfile) {
    const sourceProfile = await pickSourceProfile(targetProfile);
    const items = buildItems(sourceProfile);

    if (items.length === 0) {
        console.log(color('gray', '  nothing available to merge.'));
        await sleep(700);
        return false;
    }

    const indices = await multiSelect(
        `Merge into '${targetProfile}' — select items`, items,
        { hint: 'existing items in the target are never overwritten' });
    if (indices === null || indices.length === 0) {
        console.log(color('gray', '  nothing selected.'));
        await sleep(500);
        return false;
    }

    let result;
    try {
        result = mergeIntoProfile(targetProfile, toSelections(items, indices, sourceProfile));
    } catch (e) {
        console.log(color('red', '  merge failed: ' + e.message));
        await sleep(1200);
        return false;
    }

    console.log('');
    for (const m of result.merged)  console.log(color('darkgreen', '  + ' + m));
    for (const s of result.skipped) console.log(color('gray',      '  = skipped: ' + s));
    console.log(color('darkgreen', `  done (${result.merged.length} merged, ${result.skipped.length} skipped).`));
    await sleep(result.skipped.length ? 1500 : 900);
    return result.merged.length > 0;
}
