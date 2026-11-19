#!/bin/sh
# Installs Aster for the current user under ~/.local. Updates replace the
# binary in place, which is why the launcher in ~/.local/bin is a symlink.
set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prefix="${PREFIX:-$HOME/.local/opt/aster}"
bindir="${BINDIR:-$HOME/.local/bin}"
applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

mkdir -p "$prefix" "$bindir" "$applications" "$icons"
install -m 0755 "$here/aster" "$prefix/aster"
ln -sfn "$prefix/aster" "$bindir/aster"
install -m 0644 "$here/aster.desktop" "$applications/aster.desktop"
install -m 0644 "$here/aster.png" "$icons/aster.png"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$applications" >/dev/null 2>&1 || true
fi

echo "Aster installed at $prefix/aster"
echo "Run it from your application menu or with: $bindir/aster"
