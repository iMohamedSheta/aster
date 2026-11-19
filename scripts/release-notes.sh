#!/usr/bin/env bash
# Print the CHANGELOG section for a release version, without its heading.
# Used by the release workflow, which falls back to generated notes when the
# section is missing.
set -euo pipefail

version="${1:?usage: release-notes.sh <version> [changelog]}"
changelog="${2:-CHANGELOG.md}"

awk -v version="$version" '
  /^##[[:space:]]/ {
    if (found) exit
    if ($1 == "##" && $2 == version) {
      found = 1
      next
    }
  }
  found { print }
' "$changelog" | sed -e 's/[[:space:]]*$//' | cat -s
