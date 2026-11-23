#!/usr/bin/env bash
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
server_dir="$repo_root/server"
port="${CURBIE_CHECK_PORT:-3917}"
results=()
failed=0

run_step() {
  local name="$1"
  shift
  local log
  log="$(mktemp -t curbie-check)"
  if (cd "$server_dir" && "$@") >"$log" 2>&1; then
    results+=("PASS  $name")
  else
    results+=("FAIL  $name  (log: $log)")
    failed=1
    tail -n 40 "$log"
  fi
}

boot_smoke() {
  local data_dir server_pid status
  data_dir="$(mktemp -d -t curbie-check-data)"
  touch "$data_dir/.curbie-data-dir"
  CURBIE_DATA_DIR="$data_dir" CURBIE_HTTP_PORT="$port" node dist/main.js &
  server_pid=$!
  status=1
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:$port/manage" >/dev/null 2>&1 \
      && curl -fsS "http://127.0.0.1:$port/manage/recipes" >/dev/null 2>&1; then
      status=0
      break
    fi
    sleep 0.5
  done
  kill "$server_pid" 2>/dev/null
  wait "$server_pid" 2>/dev/null
  rm -rf "$data_dir"
  return $status
}

run_step "tests (npm test)" npm test --silent
run_step "typecheck" npm run typecheck --silent
run_step "build" npm run build --silent
if [ "$failed" -eq 0 ]; then
  run_step "boot smoke (/, /manage, /manage/recipes on :$port)" boot_smoke
else
  results+=("SKIP  boot smoke (an earlier step failed)")
fi

echo
echo "curbie-check summary"
printf '%s\n' "${results[@]}"
exit "$failed"
