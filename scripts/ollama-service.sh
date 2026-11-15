#!/usr/bin/env bash
set -euo pipefail

readonly SERVICE_LABEL="com.curbie.ollama"
readonly SERVICE_DOMAIN="gui/$(id -u)"
readonly SERVICE_TARGET="$SERVICE_DOMAIN/$SERVICE_LABEL"
readonly SERVICE_PLIST="$HOME/Library/LaunchAgents/$SERVICE_LABEL.plist"
readonly MODELS_DIRECTORY="/Volumes/CURBIE_BRAIN/ollama-models"
readonly OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
readonly STARTUP_WAIT_SECONDS=15

print_usage() {
  cat <<USAGE
Usage: scripts/ollama-service.sh <start | stop | restart | status>

Controls the Ollama background service that keeps its models on the USB drive.

  start     Start Ollama. Run this after plugging the drive in or after a restart.
  stop      Stop Ollama. Run this before ejecting the drive.
  restart   Stop, then start.
  status    Show whether Ollama is running and which models are loaded.
USAGE
}

fail() {
  echo "Error: $1" >&2
  exit 1
}

is_service_loaded() {
  launchctl print "$SERVICE_TARGET" >/dev/null 2>&1
}

is_ollama_responding() {
  curl -fsS --max-time 2 "$OLLAMA_URL/api/version" >/dev/null 2>&1
}

wait_for_ollama() {
  for ((second = 0; second < STARTUP_WAIT_SECONDS; second++)); do
    if is_ollama_responding; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_service() {
  [[ -f "$SERVICE_PLIST" ]] || fail "No service file at $SERVICE_PLIST. Create the LaunchAgent first."
  [[ -d "$MODELS_DIRECTORY" ]] || fail "$MODELS_DIRECTORY not found. Is the USB drive mounted?"
  if is_service_loaded; then
    echo "Ollama is already started."
  else
    launchctl bootstrap "$SERVICE_DOMAIN" "$SERVICE_PLIST"
    echo "Started Ollama."
  fi
  wait_for_ollama || fail "Ollama didn't respond at $OLLAMA_URL within ${STARTUP_WAIT_SECONDS}s. Check ~/Library/Logs/ollama.log."
  echo "Ollama is responding at $OLLAMA_URL."
}

stop_service() {
  if ! is_service_loaded; then
    echo "Ollama is already stopped."
    return
  fi
  launchctl bootout "$SERVICE_TARGET"
  echo "Stopped Ollama. It's now safe to eject the drive."
}

show_status() {
  if ! is_service_loaded; then
    echo "Ollama service: stopped"
    return
  fi
  echo "Ollama service: started"
  if ! is_ollama_responding; then
    echo "Ollama server: not responding (is the USB drive mounted?)"
    return
  fi
  echo "Ollama server: responding at $OLLAMA_URL"
  ollama ps
}

main() {
  case "${1:-}" in
    start) start_service ;;
    stop) stop_service ;;
    restart)
      stop_service
      start_service
      ;;
    status) show_status ;;
    -h | --help) print_usage ;;
    *)
      print_usage >&2
      exit 1
      ;;
  esac
}

main "$@"
