#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p docs scripts src tests assets
echo "Simplify complete: ensured standard folders (docs/ scripts/ src/ tests/ assets/)."
