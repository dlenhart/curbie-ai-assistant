#!/usr/bin/env bash
set -euo pipefail

readonly MINIMUM_NODE_VERSION="20.19.0"
readonly RECOMMENDED_NODE_FORMULA="node@24"
readonly OLLAMA_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
readonly GENERAL_MODEL="${CURBIE_MODEL:-qwen3:4b}"
readonly BASELINE_MODEL="qwen3:8b"
readonly CODING_MODEL="qwen2.5-coder:7b"
readonly DATA_DIRECTORY_MARKER=".curbie-data-dir"

is_check_only=false
is_dry_run=false
declare -a summary_lines=()

if [[ -t 1 ]]; then
  readonly COLOR_CYAN=$'\033[36m'
  readonly COLOR_GREEN=$'\033[32m'
  readonly COLOR_YELLOW=$'\033[33m'
  readonly COLOR_RED=$'\033[31m'
  readonly COLOR_RESET=$'\033[0m'
else
  readonly COLOR_CYAN="" COLOR_GREEN="" COLOR_YELLOW="" COLOR_RED="" COLOR_RESET=""
fi

print_usage() {
  cat <<USAGE
Usage: scripts/install.sh [--check | --dry-run]

Checks this Mac for everything Curbie needs and walks you through installing
anything missing. Nothing is installed without asking first.

  --check     Report status only. Never prompts, never installs.
  --dry-run   Ask every question a real run would ask, but print the exact
              command each "yes" would run instead of running it.
USAGE
}

print_heading() {
  printf '\n%s== %s ==%s\n' "$COLOR_CYAN" "$1" "$COLOR_RESET"
}

print_ok() {
  printf '  %s✓%s %s\n' "$COLOR_GREEN" "$COLOR_RESET" "$1"
}

print_warning() {
  printf '  %s!%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"
}

print_missing() {
  printf '  %s✗%s %s\n' "$COLOR_RED" "$COLOR_RESET" "$1"
}

print_info() {
  printf '    %s\n' "$1"
}

record_result() {
  summary_lines+=("$(printf '%-28s %s' "$1" "$2")")
}

ask_yes_no() {
  local question="$1"
  if [[ "$is_check_only" == true ]]; then
    return 1
  fi
  local answer
  read -r -p "    ${question} [y/N] " answer
  [[ "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

would_only_preview() {
  if [[ "$is_dry_run" != true ]]; then
    return 1
  fi
  printf '    %s[dry run] would run:%s %s\n' "$COLOR_YELLOW" "$COLOR_RESET" "$1"
}

wait_for_user() {
  read -r -p "    $1 Press Enter to continue. " _
}

is_version_at_least() {
  local actual="$1"
  local minimum="$2"
  [[ "$(printf '%s\n%s\n' "$minimum" "$actual" | sort -V | head -n 1)" == "$minimum" ]]
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

check_platform() {
  print_heading "Platform"
  if [[ "$(uname -s)" != "Darwin" ]]; then
    print_missing "This script supports macOS only. Detected: $(uname -s)."
    exit 1
  fi
  print_ok "macOS $(sw_vers -productVersion)"
  if [[ "$(uname -m)" == "arm64" ]]; then
    print_ok "Apple Silicon ($(uname -m))"
    record_result "Platform" "ok"
  else
    print_warning "Not Apple Silicon ($(uname -m)). Curbie is designed for an M-series Mac."
    record_result "Platform" "warning: not Apple Silicon"
  fi
}

check_command_line_tools() {
  print_heading "Xcode Command Line Tools"
  if xcode-select -p >/dev/null 2>&1; then
    print_ok "Installed at $(xcode-select -p)"
    has_command git && print_ok "git $(git --version | awk '{print $3}')"
    has_command swiftc && print_ok "swiftc available (needed later for the OCR helper)"
    record_result "Command Line Tools" "ok"
    return
  fi
  print_missing "Not installed. Provides git, a compiler, and swiftc."
  if ask_yes_no "Open Apple's installer now?"; then
    if would_only_preview "xcode-select --install"; then
      record_result "Command Line Tools" "would install"
      return
    fi
    xcode-select --install || true
    wait_for_user "Finish the installer window that just opened."
    if xcode-select -p >/dev/null 2>&1; then
      print_ok "Installed"
      record_result "Command Line Tools" "installed"
      return
    fi
    print_missing "Still not detected. Re-run this script after the installer finishes."
  fi
  record_result "Command Line Tools" "MISSING"
}

load_homebrew_into_session() {
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

check_homebrew() {
  print_heading "Homebrew"
  load_homebrew_into_session
  if has_command brew; then
    print_ok "$(brew --version | head -n 1)"
    record_result "Homebrew" "ok"
    return
  fi
  print_missing "Not installed. Used to install Node and Ollama."
  print_info "Installer: https://brew.sh"
  if ask_yes_no "Run the official Homebrew installer now?"; then
    if would_only_preview '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'; then
      record_result "Homebrew" "would install"
      return
    fi
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    load_homebrew_into_session
    if has_command brew; then
      print_ok "Installed"
      print_info "Follow the installer's \"Next steps\" to add brew to your shell profile."
      record_result "Homebrew" "installed"
      return
    fi
  fi
  record_result "Homebrew" "MISSING"
}

load_recommended_node_into_session() {
  if has_command brew && brew list --versions "$RECOMMENDED_NODE_FORMULA" >/dev/null 2>&1; then
    export PATH="$(brew --prefix "$RECOMMENDED_NODE_FORMULA")/bin:$PATH"
  fi
}

offer_node_path_in_shell_profile() {
  local node_bin
  node_bin="$(brew --prefix "$RECOMMENDED_NODE_FORMULA")/bin"
  local profile="$HOME/.zshrc"
  if [[ -f "$profile" ]] && grep -qF "$node_bin" "$profile"; then
    return
  fi
  print_info "$RECOMMENDED_NODE_FORMULA is keg-only, so it is not on your PATH by default."
  if ask_yes_no "Add it to $profile?"; then
    printf '\nexport PATH="%s:$PATH"\n' "$node_bin" >>"$profile"
    print_ok "Added. Open a new terminal for it to take effect."
  else
    print_info "To add it yourself: export PATH=\"$node_bin:\$PATH\""
  fi
}

check_node() {
  print_heading "Node.js"
  load_recommended_node_into_session
  if has_command node; then
    local version
    version="$(node --version | sed 's/^v//')"
    if is_version_at_least "$version" "$MINIMUM_NODE_VERSION"; then
      print_ok "Node $version, npm $(npm --version)"
      if [[ "${version%%.*}" -lt 24 ]]; then
        print_warning "Works, but the M1 host targets Node 24."
      fi
      record_result "Node.js" "ok ($version)"
      return
    fi
    print_missing "Node $version is too old. Need $MINIMUM_NODE_VERSION or newer (24 recommended)."
  else
    print_missing "Not installed."
  fi
  if ! has_command brew; then
    print_info "Install Homebrew first, then re-run this script."
    record_result "Node.js" "MISSING"
    return
  fi
  if ask_yes_no "Install $RECOMMENDED_NODE_FORMULA with Homebrew?"; then
    if would_only_preview "brew install $RECOMMENDED_NODE_FORMULA"; then
      print_info "A real run would then offer to add it to your PATH in ~/.zshrc."
      record_result "Node.js" "would install"
      return
    fi
    brew install "$RECOMMENDED_NODE_FORMULA"
    load_recommended_node_into_session
    offer_node_path_in_shell_profile
    print_ok "Node $(node --version | sed 's/^v//') installed"
    record_result "Node.js" "installed"
    return
  fi
  record_result "Node.js" "MISSING"
}

is_ollama_server_responding() {
  curl -fsS --max-time 3 "$OLLAMA_URL/api/version" >/dev/null 2>&1
}

check_ollama() {
  print_heading "Ollama"
  if ! has_command ollama; then
    print_missing "Not installed."
    if has_command brew && ask_yes_no "Install Ollama with Homebrew?"; then
      if would_only_preview "brew install ollama"; then
        print_info "A real run would then check the server and offer to start it, then offer the models."
        record_result "Ollama" "would install"
        return
      fi
      brew install ollama
    else
      print_info "Install with: brew install ollama, or the Mac app from https://ollama.com. Then re-run this script."
      record_result "Ollama" "MISSING"
      return
    fi
  fi
  print_ok "$(ollama --version 2>/dev/null | tail -n 1)"

  if is_ollama_server_responding; then
    print_ok "Server responding at $OLLAMA_URL"
    record_result "Ollama" "ok"
    return
  fi
  print_missing "Server not responding at $OLLAMA_URL."
  if has_command brew && brew list --versions ollama >/dev/null 2>&1; then
    if ask_yes_no "Start Ollama as a background service (brew services, starts at login)?"; then
      if would_only_preview "brew services start ollama"; then
        record_result "Ollama" "would start"
        return
      fi
      brew services start ollama
      sleep 3
    fi
  else
    print_info "Open the Ollama app, then re-run this script."
  fi
  if is_ollama_server_responding; then
    print_ok "Server responding"
    record_result "Ollama" "ok (started)"
    return
  fi
  record_result "Ollama" "NOT RUNNING"
}

is_model_present() {
  ollama list 2>/dev/null | awk 'NR > 1 {print $1}' | grep -qx "$1"
}

check_model() {
  local model="$1"
  local purpose="$2"
  local is_required="$3"
  local approximate_size="$4"
  print_heading "Model: $model"
  print_info "$purpose"
  if ! has_command ollama || ! is_ollama_server_responding; then
    print_warning "Skipped: Ollama isn't installed and running."
    record_result "Model $model" "skipped"
    return
  fi
  if is_model_present "$model"; then
    print_ok "Present"
    record_result "Model $model" "ok"
    return
  fi
  if [[ "$is_required" == true ]]; then
    print_missing "Not downloaded (about $approximate_size)."
  else
    print_warning "Not downloaded (about $approximate_size). Optional for now."
  fi
  if ask_yes_no "Download $model now?"; then
    if would_only_preview "ollama pull $model"; then
      record_result "Model $model" "would download"
      return
    fi
    ollama pull "$model"
    record_result "Model $model" "downloaded"
    return
  fi
  if [[ "$is_required" == true ]]; then
    record_result "Model $model" "MISSING"
  else
    record_result "Model $model" "later"
  fi
}

check_data_directory() {
  print_heading "Data directory"
  print_info "Curbie keeps its databases, facts, and scans here, normally on an external USB drive."
  local data_directory="${CURBIE_DATA_DIR:-}"
  if [[ -z "$data_directory" ]]; then
    if [[ "$is_check_only" == true ]]; then
      print_warning "CURBIE_DATA_DIR is not set, so there is nothing to check."
      record_result "Data directory" "not set"
      return
    fi
    read -r -p "    Path to the data directory (e.g. /Volumes/<usb-drive>/curbie), or Enter to skip: " data_directory
    if [[ -z "$data_directory" ]]; then
      print_warning "Skipped."
      record_result "Data directory" "skipped"
      return
    fi
  fi

  if [[ "$data_directory" != /* ]]; then
    print_missing "\"$data_directory\" is not an absolute path."
    record_result "Data directory" "INVALID"
    return
  fi
  if [[ "$data_directory" != /Volumes/* ]]; then
    print_warning "$data_directory is not under /Volumes, so it is probably on the internal disk, not the USB drive."
  fi

  if [[ ! -d "$data_directory" ]]; then
    print_missing "$data_directory does not exist."
    local volume_root
    volume_root="$(printf '%s' "$data_directory" | cut -d/ -f1-3)"
    if [[ "$data_directory" == /Volumes/* && ! -d "$volume_root" ]]; then
      print_info "$volume_root isn't mounted. Plug in the drive and re-run this script."
      record_result "Data directory" "DRIVE NOT MOUNTED"
      return
    fi
    if ask_yes_no "Create it?"; then
      if would_only_preview "mkdir -p $data_directory && touch $data_directory/$DATA_DIRECTORY_MARKER"; then
        record_result "Data directory" "would create"
        return
      fi
      mkdir -p "$data_directory"
    else
      record_result "Data directory" "MISSING"
      return
    fi
  fi

  if [[ ! -w "$data_directory" ]]; then
    print_missing "$data_directory is not writable by $(whoami)."
    record_result "Data directory" "NOT WRITABLE"
    return
  fi
  print_ok "$data_directory exists and is writable"

  if [[ -f "$data_directory/$DATA_DIRECTORY_MARKER" ]]; then
    print_ok "Marker file $DATA_DIRECTORY_MARKER present"
  elif ask_yes_no "Create the marker file $DATA_DIRECTORY_MARKER (Curbie refuses to start without it)?"; then
    if would_only_preview "touch $data_directory/$DATA_DIRECTORY_MARKER"; then
      record_result "Data directory" "would create marker"
      return
    fi
    touch "$data_directory/$DATA_DIRECTORY_MARKER"
    print_ok "Marker file created"
  else
    print_missing "Marker file $DATA_DIRECTORY_MARKER missing. Curbie will refuse to start."
    record_result "Data directory" "NO MARKER"
    return
  fi

  local free_space
  free_space="$(df -h "$data_directory" | awk 'NR == 2 {print $4}')"
  print_ok "Free space: $free_space (planned knowledge downloads need about 91 GB, plus indexes)"
  print_info "Start Curbie with: CURBIE_DATA_DIR=$data_directory npm start"
  record_result "Data directory" "ok ($free_space free)"
}

check_sleep_setting() {
  print_heading "Sleep (always-on host only)"
  local sleep_minutes
  sleep_minutes="$(pmset -g | awk '$1 == "sleep" {print $2}')"
  if [[ "$sleep_minutes" == "0" ]]; then
    print_ok "System sleep is disabled, so timers will fire on time."
    record_result "Sleep disabled" "ok"
    return
  fi
  print_warning "System sleeps after ${sleep_minutes:-unknown} minutes. Fine for a dev machine; the M1 host must stay awake."
  if ask_yes_no "Is this the always-on Curbie host, and should system sleep be disabled (sudo pmset -a sleep 0)?"; then
    if would_only_preview "sudo pmset -a sleep 0"; then
      record_result "Sleep disabled" "would change"
      return
    fi
    sudo pmset -a sleep 0
    print_ok "System sleep disabled"
    record_result "Sleep disabled" "changed"
    return
  fi
  record_result "Sleep disabled" "not changed"
}

report_later_phase_tools() {
  print_heading "Later phases (report only)"
  if has_command mkcert; then
    print_ok "mkcert installed (local HTTPS, Phase 2)"
    record_result "mkcert" "ok"
  else
    print_warning "mkcert not installed. Needed in Phase 2 for local HTTPS: brew install mkcert"
    record_result "mkcert" "later"
  fi
  print_info "Embedding model: not chosen yet (design §8)."
  print_info "Knowledge downloads (Wikipedia, Gutenberg): see docs/installation.md §4."
  print_info "Accounts and keys (SMTP, weather, web search): see docs/installation.md §1.6."
}

print_summary() {
  print_heading "Summary"
  local line
  for line in "${summary_lines[@]}"; do
    if [[ "$line" =~ (MISSING|NOT|INVALID) ]]; then
      printf '  %s%s%s\n' "$COLOR_RED" "$line" "$COLOR_RESET"
    elif [[ "$line" =~ (warning|later|skipped|would|not\ set|not\ changed) ]]; then
      printf '  %s%s%s\n' "$COLOR_YELLOW" "$line" "$COLOR_RESET"
    else
      printf '  %s%s%s\n' "$COLOR_GREEN" "$line" "$COLOR_RESET"
    fi
  done
  printf '\nDetails and manual steps: docs/installation.md\n'
}

main() {
  case "${1:-}" in
    "") ;;
    --check) is_check_only=true ;;
    --dry-run) is_dry_run=true ;;
    -h | --help) print_usage; exit 0 ;;
    *) print_usage; exit 2 ;;
  esac

  local mode_label=""
  [[ "$is_check_only" == true ]] && mode_label=" (check only)"
  [[ "$is_dry_run" == true ]] && mode_label=" (dry run: nothing will be installed or changed)"
  printf '%sCURBIE%s system setup%s\n' "$COLOR_CYAN" "$COLOR_RESET" "$mode_label"

  check_platform
  check_command_line_tools
  check_homebrew
  check_node
  check_ollama
  check_model "$GENERAL_MODEL" "Curbie's main model (Phase 1)." true "2.5 GB"
  check_model "$BASELINE_MODEL" "Baseline for the Phase 1 live comparison against 4B (design §7.1)." false "5 GB"
  check_model "$CODING_MODEL" "Coding model, loaded on demand (later phase)." false "5 GB"
  check_data_directory
  check_sleep_setting
  report_later_phase_tools
  print_summary
}

main "$@"
