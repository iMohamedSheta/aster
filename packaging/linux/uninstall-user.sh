#!/bin/sh
# Removes the per-user Aster installation. Clinic data in the user's config
# directory is kept on purpose.
set -eu

prefix="${PREFIX:-$HOME/.local/opt/aster}"
bindir="${BINDIR:-$HOME/.local/bin}"
applications="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
icons="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

rm -f "$bindir/aster"
rm -rf "$prefix"
rm -f "$applications/aster.desktop"
rm -f "$icons/aster.png"

echo "Aster removed. Clinic data was left untouched."
