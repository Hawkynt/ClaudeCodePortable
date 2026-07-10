import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs   from 'node:fs';
import path from 'node:path';
import {
    listMergeableItems, listTemplateSkills, mergeIntoProfile,
} from '../launcher/profile-merge.mjs';
import {
    PROFILES_ROOT, claudeConfigDir, TEMPLATE_SKILLS_DIR, TEMPLATE_CLAUDE_MD,
} from '../launcher/paths.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function mkProfile(t, prefix) {
    const name = prefix + '-' + process.hrtime.bigint().toString();
    fs.mkdirSync(path.join(claudeConfigDir(name)), { recursive: true });
    t.after(() => fs.rmSync(path.join(PROFILES_ROOT, name), { recursive: true, force: true }));
    return name;
}

function writeSkill(profileName, skillName, description = 'a test skill') {
    const dir = path.join(claudeConfigDir(profileName), 'skills', skillName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'),
        `---\nname: ${skillName}\ndescription: ${description}\n---\n\n# ${skillName}\n`);
    return dir;
}

function writeJson(profileName, file, obj) {
    fs.writeFileSync(path.join(claudeConfigDir(profileName), file), JSON.stringify(obj, null, 2));
}

function readJson(profileName, file) {
    return JSON.parse(fs.readFileSync(path.join(claudeConfigDir(profileName), file), 'utf8'));
}

function fullSource(t) {
    const src = mkProfile(t, 'cpm-src');
    writeSkill(src, 'alpha', 'first skill');
    writeSkill(src, 'beta',  'second skill');
    writeJson(src, 'settings.json', {
        model: 'fable',
        effortLevel: 'high',
        statusLine: { type: 'command', command: 'python "$CLAUDE_CONFIG_DIR/statusline.py"' },
        skipDangerousModePermissionPrompt: true,
    });
    writeJson(src, '.claude.json', {
        mcpServers: { jira: { command: 'npx', args: ['jira-mcp'] } },
        oauthAccount: { emailAddress: 'x@y.z' },
    });
    fs.writeFileSync(path.join(claudeConfigDir(src), 'statusline.py'), '# fake statusline\n');
    fs.writeFileSync(path.join(claudeConfigDir(src), 'CLAUDE.md'), '# my rules\n');
    return src;
}

// ---------------------------------------------------------------------------
// listMergeableItems
// ---------------------------------------------------------------------------
test('listMergeableItems: full profile reports everything', (t) => {
    const src = fullSource(t);
    const items = listMergeableItems(src);
    assert.deepEqual(items.skills.map(s => s.name).sort(), ['alpha', 'beta']);
    assert.deepEqual(items.mcpServers, ['jira']);
    assert.equal(items.statusline, true);
    assert.deepEqual(items.model, { model: 'fable', effortLevel: 'high' });
    assert.equal(items.claudeMd, true);
});

test('listMergeableItems: empty profile reports nothing', (t) => {
    const src = mkProfile(t, 'cpm-empty');
    const items = listMergeableItems(src);
    assert.deepEqual(items.skills, []);
    assert.deepEqual(items.mcpServers, []);
    assert.equal(items.statusline, false);
    assert.equal(items.model, null);
    assert.equal(items.claudeMd, false);
});

test('listMergeableItems: corrupt json files are tolerated', (t) => {
    const src = mkProfile(t, 'cpm-corrupt');
    fs.writeFileSync(path.join(claudeConfigDir(src), 'settings.json'), '{oops');
    fs.writeFileSync(path.join(claudeConfigDir(src), '.claude.json'), 'not json');
    const items = listMergeableItems(src);
    assert.deepEqual(items.mcpServers, []);
    assert.equal(items.model, null);
});

test('listMergeableItems: skill dir without SKILL.md is not a skill', (t) => {
    const src = mkProfile(t, 'cpm-noskill');
    fs.mkdirSync(path.join(claudeConfigDir(src), 'skills', 'junk'), { recursive: true });
    assert.deepEqual(listMergeableItems(src).skills, []);
});

// ---------------------------------------------------------------------------
// listTemplateSkills
// ---------------------------------------------------------------------------
test('listTemplateSkills: reads the shipped template library', () => {
    const skills = listTemplateSkills();
    assert.ok(Array.isArray(skills));
    // The repo ships these; if the template dir exists they must be found.
    if (fs.existsSync(TEMPLATE_SKILLS_DIR)) {
        const names = skills.map(s => s.name);
        assert.ok(names.includes('structured-memory'), 'structured-memory template missing');
        assert.ok(names.includes('codebase-index'), 'codebase-index template missing');
        for (const n of ['finish-the-task', 'effort-scaling', 'root-cause-first', 'done-means-done']) {
            assert.ok(names.includes(n), `${n} template missing`);
        }
        for (const s of skills) {
            assert.equal(typeof s.description, 'string');
            assert.ok(s.description.length > 0, `${s.name} has no description`);
        }
    }
});

// ---------------------------------------------------------------------------
// mergeIntoProfile: skills
// ---------------------------------------------------------------------------
test('merge skills: copies selected skill dirs', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    const r = mergeIntoProfile(dst, { fromProfile: src, skills: ['alpha'] });
    assert.ok(fs.existsSync(path.join(claudeConfigDir(dst), 'skills', 'alpha', 'SKILL.md')));
    assert.ok(!fs.existsSync(path.join(claudeConfigDir(dst), 'skills', 'beta')));
    assert.ok(r.merged.some(m => m.includes('alpha')));
});

test('merge skills: existing skill in target is skipped, not clobbered', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    writeSkill(dst, 'alpha', 'MY OWN alpha - do not touch');
    const r = mergeIntoProfile(dst, { fromProfile: src, skills: ['alpha'] });
    const kept = fs.readFileSync(
        path.join(claudeConfigDir(dst), 'skills', 'alpha', 'SKILL.md'), 'utf8');
    assert.match(kept, /MY OWN alpha/);
    assert.ok(r.skipped.some(m => m.includes('alpha')));
});

test('merge template skills into a profile', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    if (!fs.existsSync(TEMPLATE_SKILLS_DIR)) return; // library not shipped in this checkout
    const r = mergeIntoProfile(dst, { templateSkills: ['structured-memory'] });
    assert.ok(fs.existsSync(
        path.join(claudeConfigDir(dst), 'skills', 'structured-memory', 'SKILL.md')));
    assert.ok(r.merged.some(m => m.includes('structured-memory')));
});

test('merge skills: subdirectories (scripts/) are copied too', (t) => {
    const src = mkProfile(t, 'cpm-src');
    const dir = writeSkill(src, 'withscripts');
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'tool.py'), 'print(1)\n');
    const dst = mkProfile(t, 'cpm-dst');
    mergeIntoProfile(dst, { fromProfile: src, skills: ['withscripts'] });
    assert.ok(fs.existsSync(
        path.join(claudeConfigDir(dst), 'skills', 'withscripts', 'scripts', 'tool.py')));
});

// ---------------------------------------------------------------------------
// mergeIntoProfile: mcp / statusline / model / CLAUDE.md
// ---------------------------------------------------------------------------
test('merge mcp: servers land in target .claude.json, existing keys win', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    writeJson(dst, '.claude.json', {
        mcpServers: { jira: { command: 'KEEP-ME' } },
        userID: 'target-user',
    });
    const r = mergeIntoProfile(dst, { fromProfile: src, mcp: true });
    const j = readJson(dst, '.claude.json');
    assert.equal(j.mcpServers.jira.command, 'KEEP-ME');   // target wins
    assert.equal(j.userID, 'target-user');                // unrelated keys untouched
    assert.ok(r.skipped.some(m => m.includes('jira')));
});

test('merge mcp: creates .claude.json when target has none', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    mergeIntoProfile(dst, { fromProfile: src, mcp: true });
    assert.deepEqual(Object.keys(readJson(dst, '.claude.json').mcpServers), ['jira']);
});

test('merge statusline: copies statusline.py and the settings key', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    mergeIntoProfile(dst, { fromProfile: src, statusline: true });
    assert.ok(fs.existsSync(path.join(claudeConfigDir(dst), 'statusline.py')));
    assert.ok(readJson(dst, 'settings.json').statusLine);
});

test('merge statusline: never overwrites an existing target statusline', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    fs.writeFileSync(path.join(claudeConfigDir(dst), 'statusline.py'), '# MINE\n');
    const r = mergeIntoProfile(dst, { fromProfile: src, statusline: true });
    assert.match(fs.readFileSync(
        path.join(claudeConfigDir(dst), 'statusline.py'), 'utf8'), /MINE/);
    assert.ok(r.skipped.some(m => m.toLowerCase().includes('statusline')));
});

test('merge model: copies model + effortLevel, keeps target values', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    writeJson(dst, 'settings.json', { model: 'opus' });
    mergeIntoProfile(dst, { fromProfile: src, model: true });
    const s = readJson(dst, 'settings.json');
    assert.equal(s.model, 'opus');          // target wins
    assert.equal(s.effortLevel, 'high');    // missing key merged
});

test('merge CLAUDE.md: copied when absent, skipped when present', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    let r = mergeIntoProfile(dst, { fromProfile: src, claudeMd: true });
    assert.match(fs.readFileSync(path.join(claudeConfigDir(dst), 'CLAUDE.md'), 'utf8'), /my rules/);
    assert.ok(r.merged.some(m => m.includes('CLAUDE.md')));

    fs.writeFileSync(path.join(claudeConfigDir(dst), 'CLAUDE.md'), '# target rules\n');
    r = mergeIntoProfile(dst, { fromProfile: src, claudeMd: true });
    assert.match(fs.readFileSync(path.join(claudeConfigDir(dst), 'CLAUDE.md'), 'utf8'), /target rules/);
    assert.ok(r.skipped.some(m => m.includes('CLAUDE.md')));
});

// ---------------------------------------------------------------------------
// mergeIntoProfile: template CLAUDE.md
// ---------------------------------------------------------------------------
test('merge template CLAUDE.md: copied when absent, no fromProfile needed', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    if (!fs.existsSync(TEMPLATE_CLAUDE_MD)) return; // template not shipped in this checkout
    const r = mergeIntoProfile(dst, { templateClaudeMd: true });
    const dstFile = path.join(claudeConfigDir(dst), 'CLAUDE.md');
    assert.ok(fs.existsSync(dstFile));
    assert.equal(fs.readFileSync(dstFile, 'utf8'),
                 fs.readFileSync(TEMPLATE_CLAUDE_MD, 'utf8'));
    assert.ok(r.merged.some(m => m.includes('CLAUDE.md')));
});

test('merge template CLAUDE.md: never overwrites an existing target CLAUDE.md', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    if (!fs.existsSync(TEMPLATE_CLAUDE_MD)) return;
    fs.writeFileSync(path.join(claudeConfigDir(dst), 'CLAUDE.md'), '# MY rules\n');
    const r = mergeIntoProfile(dst, { templateClaudeMd: true });
    assert.match(fs.readFileSync(path.join(claudeConfigDir(dst), 'CLAUDE.md'), 'utf8'),
                 /MY rules/);
    assert.ok(r.skipped.some(m => m.includes('CLAUDE.md')));
});

test('merge template CLAUDE.md + template skills in one call', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    if (!fs.existsSync(TEMPLATE_CLAUDE_MD) || !fs.existsSync(TEMPLATE_SKILLS_DIR)) return;
    const r = mergeIntoProfile(dst, {
        templateClaudeMd: true, templateSkills: ['done-means-done'],
    });
    assert.ok(fs.existsSync(path.join(claudeConfigDir(dst), 'CLAUDE.md')));
    assert.ok(fs.existsSync(
        path.join(claudeConfigDir(dst), 'skills', 'done-means-done', 'SKILL.md')));
    assert.equal(r.merged.length, 2);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test('merge with nothing selected is a no-op', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    const r = mergeIntoProfile(dst, {});
    assert.deepEqual(r.merged, []);
    assert.deepEqual(r.skipped, []);
});

test('merge from a nonexistent source profile throws', (t) => {
    const dst = mkProfile(t, 'cpm-dst');
    assert.throws(() => mergeIntoProfile(dst, {
        fromProfile: 'no-such-profile-xyz', skills: ['a'],
    }), /not found/i);
});

test('merge unknown skill name is reported, not thrown', (t) => {
    const src = fullSource(t);
    const dst = mkProfile(t, 'cpm-dst');
    const r = mergeIntoProfile(dst, { fromProfile: src, skills: ['does-not-exist'] });
    assert.ok(r.skipped.some(m => m.includes('does-not-exist')));
});
