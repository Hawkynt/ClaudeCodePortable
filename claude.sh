#!/usr/bin/env bash
# =============================================================================
#  ClaudePortable bootstrap (Linux/macOS)
#    Ensures a SHA256-verified portable Node is installed under app/node,
#    then hands off to launcher/launcher.mjs.
# =============================================================================

set -e

PORTABLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$PORTABLE_ROOT/app"
NODE_DIR="$APP_DIR/node"

NODE_VERSION="22.16.0"

case "$(uname -s)" in
    Linux*)
        case "$(uname -m)" in
            x86_64)
                NODE_ARCH="linux-x64"
                NODE_SHA256="f4cb75bb036f0d0eddf6b79d9596df1aaab9ddccd6a20bf489be5abe9467e84e"
                ;;
            aarch64)
                NODE_ARCH="linux-arm64"
                NODE_SHA256="" # TODO: pin when supported
                ;;
            *) echo "Unsupported Linux arch: $(uname -m)" >&2; exit 1 ;;
        esac
        NODE_EXT="tar.xz"
        EXTRACT="tar -xJf"
        ;;
    Darwin*)
        case "$(uname -m)" in
            arm64)
                NODE_ARCH="darwin-arm64"
                NODE_SHA256="1d7f34ec4c03e12d8b33481e5c4560432d7dc31a0ef3ff5a4d9a8ada7cf6ecc9"
                ;;
            x86_64)
                NODE_ARCH="darwin-x64"
                NODE_SHA256="838d400f7e66c804e5d11e2ecb61d6e9e878611146baff69d6a2def3cc23f4ac"
                ;;
            *) echo "Unsupported macOS arch: $(uname -m)" >&2; exit 1 ;;
        esac
        NODE_EXT="tar.gz"
        EXTRACT="tar -xzf"
        ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

NODE_SUBDIR="node-v${NODE_VERSION}-${NODE_ARCH}"
NODE_BIN="$NODE_DIR/$NODE_SUBDIR/bin"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_SUBDIR}.${NODE_EXT}"

mkdir -p "$NODE_DIR"

if [ ! -x "$NODE_BIN/node" ]; then
    echo "Bootstrapping Node.js ${NODE_VERSION} (first run only)..."
    TMP="$NODE_DIR/node.${NODE_EXT}"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$NODE_URL" -o "$TMP"
    else
        wget -q "$NODE_URL" -O "$TMP"
    fi
    if [ -n "$NODE_SHA256" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
            ACTUAL=$(sha256sum "$TMP" | awk '{print $1}')
        else
            ACTUAL=$(shasum -a 256 "$TMP" | awk '{print $1}')
        fi
        if [ "$ACTUAL" != "$NODE_SHA256" ]; then
            echo "ERROR: SHA256 mismatch for Node.js archive" >&2
            echo "  expected: $NODE_SHA256" >&2
            echo "  actual:   $ACTUAL" >&2
            rm -f "$TMP"
            exit 1
        fi
    else
        echo "WARN: no SHA256 pinned for $NODE_ARCH; skipping verification" >&2
    fi
    $EXTRACT "$TMP" -C "$NODE_DIR"
    rm -f "$TMP"
fi

export PATH="$NODE_BIN:$PATH"
exec node "$PORTABLE_ROOT/launcher/launcher.mjs" "$@"
