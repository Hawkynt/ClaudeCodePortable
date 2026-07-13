import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import path from 'node:path';
import { exportSkills, supportedExportTools } from '../launcher/skills-export.mjs';
import { listTemplateSkills } from '../launcher/profile-merge.mjs';
import {
    PROFILES_ROOT, TEMPLATE_SKILLS_DIR, TEMPLATE_CLAUDE_MD,
    codexConfigDir, copilotConfigDir, geminiHomeDir,
} from '../launcher/paths.mjs';

const shipped = fs.existsSync(TEMPLATE_SKILLS_DIR) && fs.existsSync(TEMPLATE_CLAUDE_MD);

function mkProfile(t, prefix) {
    const name = prefix + '-' + process.hrtime.bigint().toString();
    fs.mkdirSync(path.join(PROFILES_ROOT, name), { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));
    return name;
}

test('supportedExportTools lists the three siblings', () => {
    assert.deepEqual(supportedExportTools().sort(), ['antigravity', 'codex', 'copilot']);
});

test('unknown tool throws', () => {
    assert.throws(() => exportSkills('vim', 'nope'), /unknown export tool/i);
});

test('codex export: all skills + AGENTS.md land in CODEX_HOME layout', (t) => {
    if (!shipped) return;
    const p = mkProfile(t, 'sx-codex');
    const r = exportSkills('codex', p);
    const skills = listTemplateSkills();
    assert.ok(skills.length >= 15, 'template library unexpectedly small');
    for (const s of skills) {
        assert.ok(fs.existsSync(path.join(codexConfigDir(p), 'skills', s.name, 'SKILL.md')),
            `codex missing skill ${s.name}`);
    }
    assert.ok(fs.existsSync(path.join(codexConfigDir(p), 'AGENTS.md')));
    assert.equal(r.merged.length, skills.length + 1);
    assert.equal(r.skipped.length, 0);
});

test('copilot export: skills + copilot-instructions.md in COPILOT_HOME layout', (t) => {
    if (!shipped) return;
    const p = mkProfile(t, 'sx-copilot');
    exportSkills('copilot', p);
    assert.ok(fs.existsSync(
        path.join(copilotConfigDir(p), 'skills', 'plan-gate', 'SKILL.md')));
    const instr = path.join(copilotConfigDir(p), 'copilot-instructions.md');
    assert.equal(fs.readFileSync(instr, 'utf8'),
                 fs.readFileSync(TEMPLATE_CLAUDE_MD, 'utf8'));
});

test('antigravity export: global config skills + GEMINI.md gate', (t) => {
    if (!shipped) return;
    const p = mkProfile(t, 'sx-agy');
    exportSkills('antigravity', p);
    // Per agy's customization guide: machine-global skills live under
    // ~/.gemini/config/skills/<name>/SKILL.md.
    assert.ok(fs.existsSync(path.join(
        geminiHomeDir(p), 'config', 'skills', 'structured-memory', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(geminiHomeDir(p), 'GEMINI.md')));
});

test('re-export is a no-op that reports skips, never overwrites', (t) => {
    if (!shipped) return;
    const p = mkProfile(t, 'sx-again');
    exportSkills('codex', p);
    // User customizes an exported file; re-export must not clobber it.
    const agents = path.join(codexConfigDir(p), 'AGENTS.md');
    fs.writeFileSync(agents, '# MY OWN rules\n');
    const r = exportSkills('codex', p);
    assert.equal(r.merged.length, 0);
    assert.ok(r.skipped.length >= listTemplateSkills().length + 1);
    assert.match(fs.readFileSync(agents, 'utf8'), /MY OWN/);
});

test('skill copies include subdirectories (codebase-index scripts/)', (t) => {
    if (!shipped) return;
    const p = mkProfile(t, 'sx-scripts');
    exportSkills('codex', p);
    assert.ok(fs.existsSync(path.join(
        codexConfigDir(p), 'skills', 'codebase-index', 'scripts', 'index_codebase.py')));
});
