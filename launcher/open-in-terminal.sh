#!/usr/bin/env bash
# Opens a terminal emulator in DIR, then runs CMD [ARGS...].
# Usage: open-in-terminal.sh DIR CMD [ARGS...]
DIR="${1:?open-in-terminal.sh: DIR required}"; shift
has() { command -v "$1" &>/dev/null; }

# macOS: delegate to Terminal.app via osascript
if [[ "$(uname -s)" == Darwin ]]; then
    CMD_STR=$(printf '%q ' "$@")
    osascript \
        -e 'on run argv' \
        -e 'tell application "Terminal"' \
        -e '  do script "cd " & quoted form of (item 1 of argv) & " && " & item 2 of argv' \
        -e '  activate' \
        -e 'end tell' \
        -e 'end run' \
        -- "$DIR" "$CMD_STR"
    exit
fi

# Linux: probe common terminal emulators in preference order
if   has konsole;           then exec konsole          --workdir          "$DIR" -e "$@"
elif has gnome-terminal;    then exec gnome-terminal   --working-directory="$DIR" -- "$@"
elif has alacritty;         then exec alacritty        --working-directory "$DIR" -e "$@"
elif has kitty;             then exec kitty            --directory         "$DIR" "$@"
elif has wezterm;           then exec wezterm start    --cwd               "$DIR" -- "$@"
elif has xfce4-terminal;    then exec xfce4-terminal   --working-directory="$DIR" -x "$@"
elif has mate-terminal;     then exec mate-terminal    --working-directory="$DIR" -x "$@"
elif has lxterminal;        then exec lxterminal       --working-directory="$DIR" -e "$(printf '%q ' "$@")"
elif has xdg-terminal-exec; then exec xdg-terminal-exec sh -c "cd $(printf '%q' "$DIR") && exec $(printf '%q ' "$@")"
elif has xterm;             then exec xterm            -e "cd $(printf '%q' "$DIR") && exec $(printf '%q ' "$@")"
else
    printf 'Claude Code: no terminal emulator found.\nRun manually: cd %q && %s\n' "$DIR" "$(printf '%q ' "$@")" >&2
    has notify-send && notify-send "Claude Code" "No terminal emulator found. Please launch manually."
    exit 1
fi
