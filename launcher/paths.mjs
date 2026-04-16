// Central constants + resolved paths for the launcher.
// Everything that looks like a knob lives here.

import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------
// launcher.mjs lives at  <ClaudePortable>/launcher/launcher.mjs
// So ClaudePortable root is two levels up from this file.
const __filename    = url.fileURLToPath(import.meta.url);
const __dirname     = path.dirname(__filename);
// launcher.mjs lives at <PORTABLE_ROOT>/launcher/launcher.mjs
export const PORTABLE_ROOT = path.resolve(__dirname, '..');

// The user-facing launcher script. Used by registry.mjs so the Windows
// context menu knows what to invoke.
export const LAUNCHER_BAT  = path.join(PORTABLE_ROOT, process.platform === 'win32' ? 'Claude.bat' : 'claude.sh');

// ---------------------------------------------------------------------------
// App / data
// ---------------------------------------------------------------------------
export const APP_ROOT      = path.join(PORTABLE_ROOT, 'app');
export const PROFILES_ROOT = path.join(PORTABLE_ROOT, 'profiles');

// Per-tool install locations
export const NODE_DIR   = path.join(APP_ROOT, 'node');
export const GIT_DIR    = path.join(APP_ROOT, 'git');      // MinGit (standalone git)
export const BASH_DIR   = path.join(APP_ROOT, 'bash');     // PortableGit (bash + bundled perl)
export const PERL_DIR   = path.join(APP_ROOT, 'perl');     // relocatable-perl (unix); unused on Windows
export const PYTHON_DIR = path.join(APP_ROOT, 'python');
export const PWSH_DIR   = path.join(APP_ROOT, 'powershell');

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------
export const IS_WIN   = process.platform === 'win32';
export const IS_LINUX = process.platform === 'linux';
export const IS_MAC   = process.platform === 'darwin';
export const ARCH     = process.arch; // 'x64' | 'arm64'

// ---------------------------------------------------------------------------
// Tool versions, URLs, and SHA256 hashes.
// Hashes were either fetched from the vendor's published list or computed
// over an HTTPS-downloaded artifact. Missing hashes (null) disable verification
// for that tool with a warning printed by install.mjs.
// ---------------------------------------------------------------------------

// Node.js
export const NODE_VERSION = '22.16.0';
export const NODE_DIST = {
    'win32-x64':  {
        url:  `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
        sha256: '21c2d9735c80b8f86dab19305aa6a9f6f59bbc808f68de3eef09d5832e3bfbbd',
        subdir: `node-v${NODE_VERSION}-win-x64`,                // directory created after extraction
        bin:    `node-v${NODE_VERSION}-win-x64`,                // dir holding node.exe / npm.cmd
    },
    'linux-x64': {
        url:  `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz`,
        sha256: 'f4cb75bb036f0d0eddf6b79d9596df1aaab9ddccd6a20bf489be5abe9467e84e',
        subdir: `node-v${NODE_VERSION}-linux-x64`,
        bin:    `node-v${NODE_VERSION}-linux-x64/bin`,
    },
    'darwin-arm64': {
        url:  `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
        sha256: '1d7f34ec4c03e12d8b33481e5c4560432d7dc31a0ef3ff5a4d9a8ada7cf6ecc9',
        subdir: `node-v${NODE_VERSION}-darwin-arm64`,
        bin:    `node-v${NODE_VERSION}-darwin-arm64/bin`,
    },
    'darwin-x64': {
        url:  `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
        sha256: '838d400f7e66c804e5d11e2ecb61d6e9e878611146baff69d6a2def3cc23f4ac',
        subdir: `node-v${NODE_VERSION}-darwin-x64`,
        bin:    `node-v${NODE_VERSION}-darwin-x64/bin`,
    },
};

// Git for Windows - MinGit (standalone git, no bash) - Windows only
export const GIT_VERSION = '2.47.1';
export const GIT_DIST = {
    'win32-x64': {
        url:  `https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/MinGit-${GIT_VERSION}-64-bit.zip`,
        sha256: '50b04b55425b5c465d076cdb184f63a0cd0f86f6ec8bb4d5860114a713d2c29a',
    },
};

// Bash = PortableGit for Windows. On linux/darwin we rely on system bash.
export const BASH_VERSION = '2.47.1';
export const BASH_DIST = {
    'win32-x64': {
        url:  `https://github.com/git-for-windows/git/releases/download/v${BASH_VERSION}.windows.1/PortableGit-${BASH_VERSION}-64-bit.7z.exe`,
        sha256: '4f3f21f4effcb659566883ee1ed3ae403e5b3d7a0699cee455f6cd765e1ac39c',
    },
};

// Perl - relocatable-perl for unix; on Windows we use the perl bundled in BASH_DIR
export const PERL_VERSION = '5.42.2.0';
export const PERL_DIST = {
    'linux-x64': {
        url:  `https://github.com/skaji/relocatable-perl/releases/download/${PERL_VERSION}/perl-linux-amd64.tar.xz`,
        sha256: '2ae07b9b5e75c09f844810960c49eb731f6ca9a3dc839482dc473c7e6e4f1bdf',
    },
    'darwin-arm64': {
        url:  `https://github.com/skaji/relocatable-perl/releases/download/${PERL_VERSION}/perl-darwin-arm64.tar.xz`,
        sha256: '9e217db92f6ad87092c9279c8c31c70a7435465cdfdb274dfed016f0878ab452',
    },
    'darwin-x64': {
        url:  `https://github.com/skaji/relocatable-perl/releases/download/${PERL_VERSION}/perl-darwin-amd64.tar.xz`,
        sha256: '8845f0e668fef0f84e713e2570bf4a3cb0446c3014c7162578fdf8c099473cd9',
    },
};

// Python
export const PY_VERSION = '3.13.1';
export const PY_DIST = {
    'win32-x64': {
        url:  `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`,
        sha256: '7b7923ff0183a8b8fca90f6047184b419b108cb437f75fc1c002f9d2f8bcec16',
    },
    // python-build-standalone uses datestamp tags; this release provides 3.13.1
    'linux-x64': {
        url:  `https://github.com/astral-sh/python-build-standalone/releases/download/20250106/cpython-${PY_VERSION}+20250106-x86_64-unknown-linux-gnu-install_only.tar.gz`,
        sha256: 'bb4696825039a2b5dc7fea2c6aeb085c89fd397016b44165ec73b4224ccc83e2',
        subdir: 'python',
    },
    'darwin-arm64': {
        url:  `https://github.com/astral-sh/python-build-standalone/releases/download/20250106/cpython-${PY_VERSION}+20250106-aarch64-apple-darwin-install_only.tar.gz`,
        sha256: 'bbfc96038d0b6922fd783f6eb2c9bf9abb648531d23d236bc1a0c16bdd061944',
        subdir: 'python',
    },
    'darwin-x64': {
        url:  `https://github.com/astral-sh/python-build-standalone/releases/download/20250106/cpython-${PY_VERSION}+20250106-x86_64-apple-darwin-install_only.tar.gz`,
        sha256: '4c4dafe2d59bb58e8d3ad26af637b7ae9c8141bb79738966752976861bdb103d',
        subdir: 'python',
    },
};
export const PY_GETPIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

// PowerShell 7
export const PWSH_VERSION = '7.4.6';
export const PWSH_DIST = {
    'win32-x64': {
        url:  `https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/PowerShell-${PWSH_VERSION}-win-x64.zip`,
        sha256: 'ed49ce5adb2162cc4a835d740486be729ba904627cca71fcb6c2b95be11b993d',
    },
    'linux-x64': {
        url:  `https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-linux-x64.tar.gz`,
        sha256: '6f6015203c47806c5cc444c19d8ed019695e610fbd948154264bf9ca8e157561',
    },
    'darwin-arm64': {
        url:  `https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-osx-arm64.tar.gz`,
        sha256: 'a482d668787ef98c37f0a5a7696107dffdb3dc340c5be3d1c153ec9d239072a8',
    },
    'darwin-x64': {
        url:  `https://github.com/PowerShell/PowerShell/releases/download/v${PWSH_VERSION}/powershell-${PWSH_VERSION}-osx-x64.tar.gz`,
        sha256: '7a18daed105b7cfc80bf8cc00762fe7990105dd23f951cc32ceb744651650e3d',
    },
};

export function currentPlatformKey() {
    const os   = IS_WIN ? 'win32' : (IS_MAC ? 'darwin' : 'linux');
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return `${os}-${arch}`;
}

/** Resolve the dist entry for the current platform from a per-tool map. */
export function pickDist(distMap) {
    return distMap[currentPlatformKey()] || null;
}

// ---------------------------------------------------------------------------
// Paths into the currently-active profile (derived from CLAUDE_PROFILE).
// ---------------------------------------------------------------------------
export function profileDataDir(profileName) {
    return path.join(PROFILES_ROOT, profileName);
}
export function claudeConfigDir(profileName) {
    return path.join(profileDataDir(profileName), 'claude-config');
}
export function npmCacheDir(profileName) {
    return path.join(profileDataDir(profileName), 'npm-cache');
}
export function npmGlobalDir(profileName) {
    return path.join(profileDataDir(profileName), 'npm-global');
}
export function lastUpdateFile(profileName) {
    return path.join(profileDataDir(profileName), 'last-update.txt');
}

// ---------------------------------------------------------------------------
// Runtime bin directories - used to build PATH.
// ---------------------------------------------------------------------------
export function nodeBinDir() {
    const d = pickDist(NODE_DIST);
    if (!d) return NODE_DIR;
    return path.join(NODE_DIR, d.bin);
}

/**
 * Resolve the absolute path to the Claude Code CLI script (cli.js). Spawning
 * `node cli.js` directly avoids the wrapper .cmd/shell-script shenanigans
 * of `claude.cmd`, which in turn eliminates stdio inheritance issues when
 * node spawns a batch file without `shell: true`.
 */
export function claudeCli(profileName) {
    const global = npmGlobalDir(profileName);
    // npm on Windows lays out global packages flat under npm-global/
    // node_modules; on Unix under lib/node_modules.
    const candidates = [
        path.join(global, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
        path.join(global, 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return candidates[0]; // best-effort; install step will put it there
}
