#!/usr/bin/env bash

set -euo pipefail

repository_root="$(git rev-parse --show-toplevel)"
cd "$repository_root"
git config core.hooksPath .githooks
echo "Installed Talent Signal Git hooks from .githooks/"
