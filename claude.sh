#!/usr/bin/env bash
# =============================================================================
#  ClaudeCodePortable bootstrap (Linux/macOS)
#    Ensures a SHA256-verified portable Node is installed under app/node,
#    then hands off to launcher/launcher.mjs.
# =============================================================================

set -e

PORTABLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$PORTABLE_ROOT/app"
NODE_DIR="$APP_DIR/node"

NODE_VERSION="22.23.3"

case "$(uname -s)" in
    Linux*)
        case "$(uname -m)" in
            x86_64)
                NODE_ARCH="linux-x64"
                NODE_SHA256="df450af89261115ef9f9e3830c3eeb2cc9213b63c720b1af623cb5dcbe2e02de"
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
                NODE_SHA256="23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53"
                ;;
            x86_64)
                NODE_ARCH="darwin-x64"
                NODE_SHA256="8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8"
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
