// Download + SHA256-verify + extract portable runtimes. Also installs and
// daily-updates @anthropic-ai/claude-code into the active profile's
// npm-global dir.

import fs    from 'node:fs';
import path  from 'node:path';
import os    from 'node:os';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
    IS_WIN, IS_LINUX, IS_MAC,
    NODE_DIR, GIT_DIR, BASH_DIR, PERL_DIR, PYTHON_DIR, PWSH_DIR,
    NODE_DIST, GIT_DIST, BASH_DIST, PERL_DIST, PY_DIST, PWSH_DIST,
    PY_GETPIP_URL, pickDist, nodeBinDir, npmCacheDir, npmGlobalDir,
    claudeCli, claudeConfigDir, lastUpdateFile,
} from './paths.mjs';
import { c, color } from './ui.mjs';

// ---------------------------------------------------------------------------
// Download with SHA256 verification.
// ---------------------------------------------------------------------------
export async function download(url, dest) {
    await new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'ClaudeCodePortable' } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                res.resume();
                return download(res.headers.location, dest).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const out = fs.createWriteStream(dest);
            res.pipe(out);
            out.on('finish', () => out.close(resolve));
            out.on('error', reject);
        });
        req.on('error', reject);
    });
}

export function sha256(file) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(file));
    return h.digest('hex').toLowerCase();
}

export async function downloadVerified({ url, sha256: expected, dest, label }) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    console.log(color('darkcyan', `  downloading ${label} ...`));
    await download(url, dest);
    if (expected) {
        const actual = sha256(dest);
        if (actual !== expected.toLowerCase()) {
            try { fs.rmSync(dest, { force: true }); } catch {}
            throw new Error(`SHA256 mismatch for ${label}\n  expected: ${expected}\n  actual:   ${actual}`);
        }
    } else {
        console.log(color('yellow', `  (no SHA256 pinned for ${label}; skipping verification)`));
    }
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------
function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true, ...opts });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (code ${r.status})`);
}

function runQuiet(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, ...opts });
}

export function extractZip(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    if (IS_WIN) {
        run('powershell.exe', ['-NoProfile','-Command',
            `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`]);
    } else {
        run('unzip', ['-q', '-o', zipPath, '-d', destDir]);
    }
}

export function extractTar(tarPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    // GNU tar (linux/macOS) or BSD tar (macOS) both support these flags
    run('tar', ['-xf', tarPath, '-C', destDir]);
}

export function extract7zSfx(sfxPath, destDir) {
    // Git for Windows PortableGit 7z SFX accepts -o<dir> -y for silent extract
    fs.mkdirSync(destDir, { recursive: true });
    run(sfxPath, [`-o${destDir}`, '-y']);
}

// ---------------------------------------------------------------------------
// Per-tool installers
// ---------------------------------------------------------------------------
export async function ensureNode() {
    const d = pickDist(NODE_DIST);
    if (!d) throw new Error(`No Node build for ${process.platform}-${process.arch}`);
    const binDir = nodeBinDir();
    const nodeExe = path.join(binDir, IS_WIN ? 'node.exe' : 'node');
    if (fs.existsSync(nodeExe)) return;

    console.log(color('cyan', `First-time setup: Node.js ${d.subdir}`));
    const archive = path.join(NODE_DIR, path.basename(d.url));
    await downloadVerified({ url: d.url, sha256: d.sha256, dest: archive, label: 'Node.js' });
    if (archive.endsWith('.zip')) extractZip(archive, NODE_DIR);
    else extractTar(archive, NODE_DIR);
    fs.rmSync(archive, { force: true });
    if (!fs.existsSync(nodeExe)) throw new Error('Node extract incomplete.');
}

export async function ensureGit() {
    if (!IS_WIN) return; // Linux/macOS rely on system git (v1)
    const d = pickDist(GIT_DIST);
    if (!d) return;
    const gitExe = path.join(GIT_DIR, 'cmd', 'git.exe');
    if (fs.existsSync(gitExe)) return;

    console.log(color('cyan', 'First-time setup: MinGit (standalone git)'));
    fs.mkdirSync(GIT_DIR, { recursive: true });
    const archive = path.join(GIT_DIR, 'mingit.zip');
    await downloadVerified({ url: d.url, sha256: d.sha256, dest: archive, label: 'MinGit' });
    extractZip(archive, GIT_DIR);
    fs.rmSync(archive, { force: true });
}

export async function ensureBash() {
    if (!IS_WIN) return; // Linux/macOS rely on system bash (v1)
    const d = pickDist(BASH_DIST);
    if (!d) return;
    const bashExe = path.join(BASH_DIR, 'bin', 'bash.exe');
    if (fs.existsSync(bashExe)) return;

    console.log(color('cyan', 'First-time setup: PortableGit (bash + bundled perl)'));
    fs.mkdirSync(BASH_DIR, { recursive: true });
    const sfx = path.join(BASH_DIR, 'PortableGit.7z.exe');
    await downloadVerified({ url: d.url, sha256: d.sha256, dest: sfx, label: 'PortableGit' });
    extract7zSfx(sfx, BASH_DIR);
    fs.rmSync(sfx, { force: true });
    if (!fs.existsSync(bashExe)) throw new Error('PortableGit extract incomplete.');
}

export async function ensurePerl() {
    if (IS_WIN) return; // use bundled perl from PortableGit on Windows
    const d = pickDist(PERL_DIST);
    if (!d) return;
    const perlBin = path.join(PERL_DIR, 'bin', 'perl');
    if (fs.existsSync(perlBin)) return;

    console.log(color('cyan', 'First-time setup: relocatable-perl'));
    fs.mkdirSync(PERL_DIR, { recursive: true });
    const archive = path.join(PERL_DIR, path.basename(d.url));
    await downloadVerified({ url: d.url, sha256: d.sha256, dest: archive, label: 'relocatable-perl' });
    extractTar(archive, PERL_DIR);
    fs.rmSync(archive, { force: true });
}

export async function ensurePython() {
    const d = pickDist(PY_DIST);
    if (!d) return;
    if (IS_WIN) {
        const pyExe = path.join(PYTHON_DIR, 'python.exe');
        if (fs.existsSync(pyExe)) return;

        console.log(color('cyan', 'First-time setup: Python (embeddable + pip)'));
        fs.mkdirSync(PYTHON_DIR, { recursive: true });
        const zip = path.join(PYTHON_DIR, 'python-embed.zip');
        await downloadVerified({ url: d.url, sha256: d.sha256, dest: zip, label: 'Python' });
        extractZip(zip, PYTHON_DIR);
        fs.rmSync(zip, { force: true });

        // Enable `import site` so pip works
        const pth = fs.readdirSync(PYTHON_DIR).find(n => /^python\d+._pth$/.test(n));
        if (pth) {
            const p = path.join(PYTHON_DIR, pth);
            const content = fs.readFileSync(p, 'utf8').replace(/#\s*import\s+site/, 'import site');
            fs.writeFileSync(p, content);
        }

        // Bootstrap pip
        const scripts = path.join(PYTHON_DIR, 'Scripts');
        const pipExe  = path.join(scripts, 'pip.exe');
        if (!fs.existsSync(pipExe)) {
            const getpip = path.join(PYTHON_DIR, 'get-pip.py');
            try {
                await download(PY_GETPIP_URL, getpip);
                run(pyExe, [getpip, '--no-warn-script-location']);
            } catch (e) {
                console.log(color('yellow', '  WARN: failed to bootstrap pip: ' + e.message));
            } finally {
                fs.rmSync(getpip, { force: true });
            }
        }
    } else {
        // python-build-standalone tarball contains a top-level 'python' dir
        const pyBin = path.join(PYTHON_DIR, 'python', 'bin', 'python3');
        if (fs.existsSync(pyBin)) return;

        console.log(color('cyan', 'First-time setup: python-build-standalone'));
        fs.mkdirSync(PYTHON_DIR, { recursive: true });
        const archive = path.join(PYTHON_DIR, path.basename(d.url));
        await downloadVerified({ url: d.url, sha256: d.sha256, dest: archive, label: 'Python' });
        extractTar(archive, PYTHON_DIR);
        fs.rmSync(archive, { force: true });
    }
}

export async function ensurePowerShell() {
    const d = pickDist(PWSH_DIST);
    if (!d) return;
    if (IS_WIN) {
        const pwshExe = path.join(PWSH_DIR, 'pwsh.exe');
        if (fs.existsSync(pwshExe)) return;

        console.log(color('cyan', 'First-time setup: PowerShell 7'));
        fs.mkdirSync(PWSH_DIR, { recursive: true });
        const zip = path.join(PWSH_DIR, 'powershell.zip');
        await downloadVerified({ url: d.url, sha256: d.sha256, dest: zip, label: 'PowerShell' });
        extractZip(zip, PWSH_DIR);
        fs.rmSync(zip, { force: true });
    } else {
        const pwshBin = path.join(PWSH_DIR, 'pwsh');
        if (fs.existsSync(pwshBin)) return;

        console.log(color('cyan', 'First-time setup: PowerShell 7'));
        fs.mkdirSync(PWSH_DIR, { recursive: true });
        const archive = path.join(PWSH_DIR, 'powershell.tar.gz');
        await downloadVerified({ url: d.url, sha256: d.sha256, dest: archive, label: 'PowerShell' });
        extractTar(archive, PWSH_DIR);
        fs.rmSync(archive, { force: true });
        try { fs.chmodSync(pwshBin, 0o755); } catch {}
    }
}

export async function ensureAllRuntimes() {
    await ensureNode();
    await ensureGit();
    await ensureBash();
    await ensurePerl();
    await ensurePython();
    await ensurePowerShell();
}

// ---------------------------------------------------------------------------
// Claude Code install + daily update
// ---------------------------------------------------------------------------
function todayYmd() {
    const d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

/**
 * On Windows a running .exe cannot be overwritten -- npm's reinstall will
 * fail with EBUSY whenever another Claude session holds the binary. We
 * probe by opening for write (same sharing semantics, zero side effects).
 *
 * Two files matter: the top-level bin/claude.exe, plus the platform-specific
 * optional-dep (claude-code-win32-xxx/claude.exe) that postinstall copies from.
 * install.cjs hardlinks when it can but falls back to a plain copy, so the
 * two are often distinct inodes and either can be the one that's running.
 * npm's reinstall touches both paths, so a lock on either blocks the update.
 *
 * Unix tolerates overwriting a running binary via inode replacement.
 */
function claudeBinaryIsLocked(cli) {
    if (!IS_WIN || cli.kind !== 'native') return false;
    const pkgDir = path.dirname(path.dirname(cli.path));
    const candidates = [cli.path];
    try {
        const optDepRoot = path.join(pkgDir, 'node_modules', '@anthropic-ai');
        for (const name of fs.readdirSync(optDepRoot)) {
            if (!name.startsWith('claude-code-')) continue;
            const exe = path.join(optDepRoot, name, 'claude.exe');
            if (fs.existsSync(exe)) candidates.push(exe);
        }
    } catch {}
    for (const p of candidates) {
        let fd;
        try {
            fd = fs.openSync(p, 'r+');
        } catch (e) {
            if (e.code === 'EBUSY' || e.code === 'EPERM') return true;
        } finally {
            if (fd !== undefined) try { fs.closeSync(fd); } catch {}
        }
    }
    return false;
}

/**
 * Run `npm install -g ...` against the portable Node, bypassing the .cmd
 * shim. Node 22 refuses to spawn .bat/.cmd files without shell:true as a
 * side effect of the CVE-2024-27980 fix -- the spawn fails with EINVAL and
 * status ends up null. Invoking npm-cli.js directly via node sidesteps the
 * whole shell-wrapper path and works on every platform.
 */
function runNpmInstall(env) {
    const nodeExe = path.join(nodeBinDir(), IS_WIN ? 'node.exe' : 'node');
    const npmCli  = path.join(nodeBinDir(),
        IS_WIN ? 'node_modules/npm/bin/npm-cli.js'
               : '../lib/node_modules/npm/bin/npm-cli.js');
    return spawnSync(nodeExe,
        [npmCli, 'install', '-g', '@anthropic-ai/claude-code@latest'],
        { stdio: 'inherit', env, windowsHide: true });
}

function npmFailureDetail(r) {
    if (r.error) return r.error.code || r.error.message;
    if (r.signal) return `signal ${r.signal}`;
    return `exit ${r.status}`;
}

export function ensureClaudeCode(profileName) {
    const cli   = claudeCli(profileName);
    const stamp = lastUpdateFile(profileName);

    // Set npm env explicitly so the install lands in the profile-scoped dirs
    // even when the launcher inherits other values.
    const env = {
        ...process.env,
        npm_config_cache:  npmCacheDir(profileName),
        npm_config_prefix: npmGlobalDir(profileName),
    };

    if (cli.kind === 'missing') {
        console.log(color('cyan', `Installing Claude Code into profile [${profileName}] ...`));
        const r = runNpmInstall(env);
        if (r.status !== 0 || claudeCli(profileName).kind === 'missing') {
            throw new Error(`Failed to install Claude Code (${npmFailureDetail(r)}).`);
        }
        fs.writeFileSync(stamp, todayYmd());
        return;
    }

    // Daily update check
    let last = '';
    try { last = fs.readFileSync(stamp, 'utf8').trim(); } catch {}
    if (last !== todayYmd()) {
        if (claudeBinaryIsLocked(cli)) {
            console.log(color('gray',
                'Skipping daily update check -- another Claude session is using the binary.'));
            return;
        }
        console.log(color('cyan', 'Checking for Claude Code updates (daily) ...'));
        const r = runNpmInstall(env);
        if (r.status === 0) {
            fs.writeFileSync(stamp, todayYmd());
        } else {
            console.log(color('yellow',
                `WARN: update check failed (${npmFailureDetail(r)}) -- continuing with existing install.`));
        }
    }
}
