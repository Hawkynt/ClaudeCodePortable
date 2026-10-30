import { spawnSync } from 'node:child_process';

export const INSTALL_PS1 = 'https://antigravity.google/cli/install.ps1';
export const INSTALL_SH = 'https://antigravity.google/cli/install.sh';

/** Run Google's installer using the caller's profile-redirected environment. */
export function runAgyInstaller(isWindows, env = process.env) {
    return isWindows
        ? spawnSync('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
              `irm ${INSTALL_PS1} | iex`],
              { stdio: 'inherit', env, windowsHide: true })
        : spawnSync('bash', ['-o', 'pipefail', '-c', `curl -fsSL ${INSTALL_SH} | bash`],
              { stdio: 'inherit', env });
}
