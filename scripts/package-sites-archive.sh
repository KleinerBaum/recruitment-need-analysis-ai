#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Refusing to package an uncommitted source tree." >&2
  exit 1
fi

npm run build

entrypoint="dist/standalone/dist/server/index.js"
if [[ ! -f "$entrypoint" ]]; then
  echo "Missing vinext server entrypoint: $entrypoint" >&2
  exit 1
fi

commit_sha="$(git rev-parse HEAD)"
source_date_epoch="$(git show -s --format=%ct "$commit_sha")"
mkdir -p dist
archive="dist/sites-vinext-${commit_sha}.tar"
tar --create --file "$archive" --format=posix --sort=name \
  --mtime="@${source_date_epoch}" --owner=0 --group=0 --numeric-owner \
  --exclude='*.map' \
  -C "$repo_root" .openai/hosting.json \
  -C "$repo_root/dist/standalone" package.json server.js public dist node_modules
echo "$archive"
