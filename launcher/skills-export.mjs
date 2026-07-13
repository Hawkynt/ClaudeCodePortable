// Export the template skill library + skill-gate instructions into the
// native layout of a sibling tool (codex / copilot / antigravity).
//
// Same contract as profile-merge: strictly ADDITIVE. Existing skills and
// instruction files in the target are never overwritten - they are reported
// in `skipped`.

import fs   from 'node:fs';
import path from 'node:path';
import {
    TEMPLATE_SKILLS_DIR, TEMPLATE_CLAUDE_MD,
    codexConfigDir, copilotConfigDir, geminiHomeDir,
} from './paths.mjs';
import { listTemplateSkills } from './profile-merge.mjs';

/**
 * Per-tool native layout:
 *   skillsDir(profile)       where SKILL.md folders go
 *   instructionFiles(profile) global-instruction file(s) seeded with the
 *                             skill gate (create-if-absent each)
 */
const LAYOUTS = {
    codex: {
        skillsDirs: p => [path.join(codexConfigDir(p), 'skills')],
        instructionFiles: p => [path.join(codexConfigDir(p), 'AGENTS.md')],
    },
    copilot: {
        skillsDirs: p => [path.join(copilotConfigDir(p), 'skills')],
        instructionFiles: p => [path.join(copilotConfigDir(p), 'copilot-instructions.md')],
    },
    antigravity: {
        // Per agy's own customization guide (builtin skill agy-customizations):
        // machine-global customizations are discovered under ~/.gemini/config/,
        // skills as config/skills/<name>/SKILL.md. The global GEMINI.md rules
        // file carries the skill gate.
        skillsDirs: p => [path.join(geminiHomeDir(p), 'config', 'skills')],
        instructionFiles: p => [path.join(geminiHomeDir(p), 'GEMINI.md')],
    },
};

export function supportedExportTools() {
    return Object.keys(LAYOUTS);
}

/**
 * Export all template skills + the skill-gate instructions into `tool`'s
 * native layout for `profileName`. Returns { merged: [], skipped: [] }.
 */
export function exportSkills(tool, profileName) {
    const layout = LAYOUTS[tool];
    if (!layout) throw new Error(`Unknown export tool: ${tool}`);

    const merged = [], skipped = [];

    const skills = listTemplateSkills();
    if (!skills.length) skipped.push('skills (template library not shipped)');
    for (const dir of layout.skillsDirs(profileName)) {
        for (const s of skills) {
            const src = path.join(TEMPLATE_SKILLS_DIR, s.name);
            const dst = path.join(dir, s.name);
            if (fs.existsSync(dst)) { skipped.push(`skill '${s.name}' (already present)`); continue; }
            fs.mkdirSync(dir, { recursive: true });
            fs.cpSync(src, dst, { recursive: true });
            merged.push(`skill '${s.name}'`);
        }
    }

    if (!fs.existsSync(TEMPLATE_CLAUDE_MD)) {
        skipped.push('instructions (no template CLAUDE.md shipped)');
    } else {
        const gate = fs.readFileSync(TEMPLATE_CLAUDE_MD, 'utf8');
        for (const file of layout.instructionFiles(profileName)) {
            if (fs.existsSync(file)) {
                skipped.push(`${path.basename(file)} (already present)`);
                continue;
            }
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, gate);
            merged.push(path.basename(file));
        }
    }

    return { merged, skipped };
}
