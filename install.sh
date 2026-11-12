#!/usr/bin/env bash
set -euo pipefail

CLEANUP_FILES=()

register_temp_file() {
  CLEANUP_FILES+=("$1")
}

cleanup_temp_files() {
  local f
  if [ "${#CLEANUP_FILES[@]}" -gt 0 ]; then
    for f in "${CLEANUP_FILES[@]}"; do
      if [ -n "$f" ] && [ -f "$f" ] && [ ! -L "$f" ]; then
        rm -f "$f" 2>/dev/null || true
      fi
    done
  fi
}

trap cleanup_temp_files EXIT INT TERM

fail() {
  printf '[ultracode install.sh] ERROR: %s\n' "$1" >&2
  exit 1
}

trim_whitespace() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

strip_trailing_slashes() {
  local p="$1"
  if [ "$p" = "/" ] || [ "$p" = "//" ] || [[ "$p" =~ ^[A-Za-z]:/$ ]]; then
    printf '%s' "$p"
    return
  fi
  while [[ "$p" == */ ]] && [ "${#p}" -gt 1 ]; do
    p="${p%/}"
    if [ "$p" = "/" ] || [[ "$p" =~ ^[A-Za-z]:$ ]]; then
      break
    fi
  done
  printf '%s' "$p"
}

normalize_path() {
  local raw
  raw="$(trim_whitespace "$1")"
  if [ -z "$raw" ]; then
    printf ''
    return
  fi

  local converted="$raw"
  if command -v cygpath >/dev/null 2>&1 && [[ "$raw" == *\\* || "$raw" =~ ^[A-Za-z]: ]]; then
    converted="$(cygpath -u -- "$raw")"
  elif command -v wslpath >/dev/null 2>&1 && [[ "$raw" =~ ^[A-Za-z]: ]]; then
    converted="$(wslpath -u "$raw")"
  elif [[ "$raw" == *\\* ]]; then
    converted="${raw//\\//}"
  fi

  strip_trailing_slashes "$converted"
}

assert_not_filesystem_root() {
  local raw_input="$1"
  local norm_path="$2"
  local label="$3"
  local raw_trimmed
  raw_trimmed="$(trim_whitespace "$raw_input")"

  if [ -z "$raw_trimmed" ] || [ -z "$norm_path" ]; then
    fail "$label cannot be empty or whitespace."
  fi

  if [[ "$raw_trimmed" =~ ^[/\\]+$ ]] || \
     [[ "$raw_trimmed" =~ ^[A-Za-z]:[/\\]*$ ]] || \
     [[ "$raw_trimmed" =~ ^/[A-Za-z]/*$ ]] || \
     [[ "$raw_trimmed" =~ ^/mnt/[A-Za-z]/*$ ]] || \
     [[ "$raw_trimmed" =~ ^(\\\\|//)[^/\\]+([/\\]+[^/\\]+)?[/\\]*$ ]]; then
    fail "$label refuses to operate directly on filesystem or share root: $raw_trimmed"
  fi

  local check_paths=("$norm_path")
  if [ -d "$norm_path" ]; then
    local phys_dir
    phys_dir="$(cd "$norm_path" 2>/dev/null && pwd || true)"
    if [ -n "$phys_dir" ]; then
      check_paths+=("$(strip_trailing_slashes "$phys_dir")")
    fi
  fi

  local cp
  for cp in "${check_paths[@]}"; do
    if [ "$cp" = "/" ] || [ "$cp" = "//" ] || \
       [[ "$cp" =~ ^[A-Za-z]:/*$ ]] || \
       [[ "$cp" =~ ^/[A-Za-z]/*$ ]] || \
       [[ "$cp" =~ ^/mnt/[A-Za-z]/*$ ]] || \
       [[ "$cp" =~ ^//[^/]+(/[^/]+)?/*$ ]]; then
      fail "$label refuses to operate directly on filesystem or share root: $raw_trimmed (resolved: $cp)"
    fi
  done
}

resolve_gemini_home() {
  local raw_override=""
  if [ -n "${ULTRACODE_GEMINI_HOME:-}" ]; then
    raw_override="$(trim_whitespace "$ULTRACODE_GEMINI_HOME")"
  fi
  if [ -n "$raw_override" ]; then
    local norm_override
    norm_override="$(normalize_path "$raw_override")"
    assert_not_filesystem_root "$raw_override" "$norm_override" "ULTRACODE_GEMINI_HOME"
    printf '%s' "$norm_override"
    return
  fi

  local raw_home=""
  if [ -n "${HOME:-}" ]; then
    raw_home="$(trim_whitespace "$HOME")"
  fi
  if [ -z "$raw_home" ]; then
    fail "Unable to resolve HOME; set ULTRACODE_GEMINI_HOME explicitly."
  fi

  local norm_home
  norm_home="$(normalize_path "$raw_home")"
  local candidate="${norm_home}/.gemini"
  candidate="$(strip_trailing_slashes "$candidate")"
  assert_not_filesystem_root "$candidate" "$candidate" "GEMINI_HOME"
  printf '%s' "$candidate"
}

extract_source_block() {
  local src_file="$1"
  local out_file="$2"
  [ -f "$src_file" ] || fail "Missing source global rule file: $src_file"

  register_temp_file "$out_file"
  if ! LC_ALL=C awk '
    NR == 1 { sub(/^\357\273\277/, "") }
    { sub(/\r$/, "") }
    /^[ \t]*<!--[ \t]*ultracode:begin([ \t]|-->|$)/ {
      if (in_block) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in %s (line %d): nested ultracode:begin.\n", FILENAME, NR > "/dev/stderr"
        err = 1; exit 1
      }
      if ($0 !~ /^[ \t]*<!--[ \t]*ultracode:begin([ \t][^>]*)?-->[ \t]*$/) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in %s (line %d): malformed ultracode:begin.\n", FILENAME, NR > "/dev/stderr"
        err = 1; exit 1
      }
      in_block = 1
      block_count++
      lines[++b_len] = $0
      next
    }
    /^[ \t]*<!--[ \t]*ultracode:end([ \t]|-->|$)/ {
      if (!in_block) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in %s (line %d): orphan ultracode:end.\n", FILENAME, NR > "/dev/stderr"
        err = 1; exit 1
      }
      if ($0 !~ /^[ \t]*<!--[ \t]*ultracode:end[ \t]*-->[ \t]*$/) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in %s (line %d): malformed ultracode:end.\n", FILENAME, NR > "/dev/stderr"
        err = 1; exit 1
      }
      lines[++b_len] = $0
      in_block = 0
      next
    }
    {
      if (in_block) {
        lines[++b_len] = $0
      }
    }
    END {
      if (err) exit 1
      if (in_block) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in %s: unclosed ultracode:begin.\n", FILENAME > "/dev/stderr"
        exit 1
      }
      if (block_count != 1) {
        printf "[ultracode install.sh] ERROR: Expected exactly 1 ultracode block in %s, found %d.\n", FILENAME, block_count > "/dev/stderr"
        exit 1
      }
      for (i = 1; i <= b_len; i++) {
        printf "%s\n", lines[i]
      }
    }
  ' "$src_file" > "$out_file"; then
    rm -f "$out_file"
    exit 1
  fi
}

upsert_ultracode_block() {
  local dest_file="$1"
  local block_file="$2"

  if [ -d "$dest_file" ]; then
    fail "Cannot update AGENTS.md because a directory exists at: $dest_file"
  fi

  local dest_dir
  dest_dir="$(dirname "$dest_file")"
  mkdir -p "$dest_dir"

  if [ ! -f "$dest_file" ]; then
    local tmp_new="${dest_file}.tmp.$$"
    register_temp_file "$tmp_new"
    cp -f "$block_file" "$tmp_new"
    mv -f "$tmp_new" "$dest_file"
    return
  fi

  local tmp_out="${dest_file}.tmp.$$"
  register_temp_file "$tmp_out"
  if ! ULTRACODE_BLOCK_FILE="$block_file" LC_ALL=C awk '
    BEGIN {
      block_file = ENVIRON["ULTRACODE_BLOCK_FILE"]
      b_len = 0
      while ((rc = (getline bline < block_file)) > 0) {
        sub(/\r$/, "", bline)
        block_lines[++b_len] = bline
      }
      if (rc < 0 || b_len == 0) {
        printf "[ultracode install.sh] ERROR: Failed to read extracted marker block from %s (rc=%d, lines=%d).\n", block_file, rc, b_len > "/dev/stderr"
        read_err = 1
        exit 1
      }
      close(block_file)
    }
    NR == 1 { sub(/^\357\273\277/, "") }
    {
      sub(/\r$/, "")
      lines[NR] = $0
      total = NR
    }
    END {
      if (read_err) exit 1
      in_block = 0
      block_count = 0
      first_begin = 0
      for (i = 1; i <= total; i++) {
        line = lines[i]
        if (line ~ /^[ \t]*<!--[ \t]*ultracode:begin([ \t]|-->|$)/) {
          if (in_block) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): nested ultracode:begin.\n", i > "/dev/stderr"
            exit 1
          }
          if (line !~ /^[ \t]*<!--[ \t]*ultracode:begin([ \t][^>]*)?-->[ \t]*$/) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): malformed ultracode:begin.\n", i > "/dev/stderr"
            exit 1
          }
          in_block = 1
          block_count++
          if (first_begin == 0) first_begin = i
          is_uc[i] = 1
        } else if (line ~ /^[ \t]*<!--[ \t]*ultracode:end([ \t]|-->|$)/) {
          if (!in_block) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): orphan ultracode:end.\n", i > "/dev/stderr"
            exit 1
          }
          if (line !~ /^[ \t]*<!--[ \t]*ultracode:end[ \t]*-->[ \t]*$/) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): malformed ultracode:end.\n", i > "/dev/stderr"
            exit 1
          }
          is_uc[i] = 1
          in_block = 0
        } else {
          is_uc[i] = in_block ? 1 : 0
        }
      }
      if (in_block) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md: found <!-- ultracode:begin ... --> without matching <!-- ultracode:end -->.\n" > "/dev/stderr"
        exit 1
      }

      if (block_count == 0) {
        last_nonempty = 0
        for (i = total; i >= 1; i--) {
          if (length(lines[i]) > 0) {
            last_nonempty = i
            break
          }
        }
        if (last_nonempty == 0) {
          for (j = 1; j <= b_len; j++) printf "%s\n", block_lines[j]
        } else {
          for (i = 1; i <= last_nonempty; i++) printf "%s\n", lines[i]
          printf "\n"
          for (j = 1; j <= b_len; j++) printf "%s\n", block_lines[j]
        }
        exit 0
      }

      out_len = 0
      for (i = 1; i < first_begin; i++) {
        out[++out_len] = lines[i]
      }
      for (j = 1; j <= b_len; j++) {
        out[++out_len] = block_lines[j]
      }
      for (i = first_begin; i <= total; i++) {
        if (!is_uc[i]) {
          out[++out_len] = lines[i]
        }
      }
      while (out_len > 0 && length(out[out_len]) == 0) {
        out_len--
      }
      for (i = 1; i <= out_len; i++) {
        printf "%s\n", out[i]
      }
    }
  ' "$dest_file" > "$tmp_out"; then
    rm -f "$tmp_out"
    exit 1
  fi

  mv -f "$tmp_out" "$dest_file"
}

remove_ultracode_block() {
  local dest_file="$1"
  if [ -d "$dest_file" ]; then
    fail "Cannot strip AGENTS.md because a directory exists at: $dest_file"
  fi
  [ -f "$dest_file" ] || return 0

  local tmp_out="${dest_file}.tmp.$$"
  register_temp_file "$tmp_out"
  set +e
  LC_ALL=C awk '
    NR == 1 { sub(/^\357\273\277/, "") }
    {
      sub(/\r$/, "")
      lines[NR] = $0
      total = NR
    }
    END {
      in_block = 0
      block_count = 0
      first_begin = 0
      for (i = 1; i <= total; i++) {
        line = lines[i]
        if (line ~ /^[ \t]*<!--[ \t]*ultracode:begin([ \t]|-->|$)/) {
          if (in_block) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): nested ultracode:begin.\n", i > "/dev/stderr"
            exit 1
          }
          if (line !~ /^[ \t]*<!--[ \t]*ultracode:begin([ \t][^>]*)?-->[ \t]*$/) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): malformed ultracode:begin.\n", i > "/dev/stderr"
            exit 1
          }
          in_block = 1
          block_count++
          if (first_begin == 0) first_begin = i
          is_uc[i] = 1
        } else if (line ~ /^[ \t]*<!--[ \t]*ultracode:end([ \t]|-->|$)/) {
          if (!in_block) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): orphan ultracode:end.\n", i > "/dev/stderr"
            exit 1
          }
          if (line !~ /^[ \t]*<!--[ \t]*ultracode:end[ \t]*-->[ \t]*$/) {
            printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md (line %d): malformed ultracode:end.\n", i > "/dev/stderr"
            exit 1
          }
          is_uc[i] = 1
          in_block = 0
        } else {
          is_uc[i] = in_block ? 1 : 0
        }
      }
      if (in_block) {
        printf "[ultracode install.sh] ERROR: Corrupt marker in target AGENTS.md: found <!-- ultracode:begin ... --> without matching <!-- ultracode:end -->.\n" > "/dev/stderr"
        exit 1
      }
      if (block_count == 0) {
        exit 2
      }

      b_cnt = 0
      for (i = 1; i < first_begin; i++) {
        before[++b_cnt] = lines[i]
      }
      while (b_cnt > 0 && length(before[b_cnt]) == 0) {
        b_cnt--
      }

      a_cnt = 0
      for (i = first_begin; i <= total; i++) {
        if (!is_uc[i]) {
          after_raw[++a_cnt] = lines[i]
        }
      }
      a_start = 1
      while (a_start <= a_cnt && length(after_raw[a_start]) == 0) {
        a_start++
      }
      a_end = a_cnt
      while (a_end >= a_start && length(after_raw[a_end]) == 0) {
        a_end--
      }

      has_after = (a_end >= a_start) ? 1 : 0
      if (b_cnt > 0 && has_after) {
        for (i = 1; i <= b_cnt; i++) printf "%s\n", before[i]
        printf "\n"
        for (i = a_start; i <= a_end; i++) printf "%s\n", after_raw[i]
      } else if (b_cnt > 0) {
        for (i = 1; i <= b_cnt; i++) printf "%s\n", before[i]
      } else if (has_after) {
        for (i = a_start; i <= a_end; i++) printf "%s\n", after_raw[i]
      }
    }
  ' "$dest_file" > "$tmp_out"
  local rc=$?
  set -e

  if [ "$rc" -eq 2 ]; then
    rm -f "$tmp_out"
    return 0
  elif [ "$rc" -ne 0 ]; then
    rm -f "$tmp_out"
    exit 1
  fi

  mv -f "$tmp_out" "$dest_file"
}

assert_skill_payload_exists() {
  local repo_root="$1"
  [ -f "$repo_root/skills/ultracode/SKILL.md" ] || fail "Missing required skill file: $repo_root/skills/ultracode/SKILL.md"
  [ -f "$repo_root/skills/ultracode/references/prompt-templates.md" ] || fail "Missing required reference file: $repo_root/skills/ultracode/references/prompt-templates.md"
  [ -f "$repo_root/skills/ultracode/references/quality-patterns-and-playbooks.md" ] || fail "Missing required reference file: $repo_root/skills/ultracode/references/quality-patterns-and-playbooks.md"
}

unlink_if_link_or_file() {
  local p="$1"
  if [ -L "$p" ] || { [ -e "$p" ] && [ ! -d "$p" ]; }; then
    rm -f "$p"
  fi
}

remove_tree_safe() {
  local p="$1"
  if [ -L "$p" ] || { [ -e "$p" ] && [ ! -d "$p" ]; }; then
    rm -f "$p"
  elif [ -d "$p" ]; then
    rm -rf "$p"
  fi
}

is_same_physical_dir() {
  local dir_a="$1"
  local dir_b="$2"
  [ -d "$dir_a" ] && [ ! -L "$dir_a" ] || return 1
  [ -d "$dir_b" ] && [ ! -L "$dir_b" ] || return 1
  local phys_a phys_b
  phys_a="$(cd "$dir_a" 2>/dev/null && pwd -P || true)"
  phys_b="$(cd "$dir_b" 2>/dev/null && pwd -P || true)"
  [ -n "$phys_a" ] && [ "$phys_a" = "$phys_b" ]
}

sync_skill_tree() {
  local repo_root="$1"
  local dest_skill_dir="$2"
  local src_skill_dir="$repo_root/skills/ultracode"

  unlink_if_link_or_file "$dest_skill_dir"

  if is_same_physical_dir "$src_skill_dir" "$dest_skill_dir"; then
    return 0
  fi

  if ! is_same_physical_dir "$repo_root" "$dest_skill_dir"; then
    remove_tree_safe "$dest_skill_dir"
  fi

  mkdir -p "$dest_skill_dir/references"
  cp -f "$src_skill_dir/SKILL.md" "$dest_skill_dir/SKILL.md"
  for ref_file in "$src_skill_dir/references/"*; do
    if [ -f "$ref_file" ]; then
      cp -f "$ref_file" "$dest_skill_dir/references/$(basename "$ref_file")"
    fi
  done
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

MODE=""
NO_GLOBAL_RULE=0
TARGET_DIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --global|-g)
      [ -z "$MODE" ] || fail "Modes --global, --skill-only, --target, and --uninstall are mutually exclusive."
      MODE="global"
      shift
      ;;
    --skill-only)
      [ -z "$MODE" ] || fail "Modes --global, --skill-only, --target, and --uninstall are mutually exclusive."
      MODE="skill-only"
      shift
      ;;
    --no-global-rule)
      NO_GLOBAL_RULE=1
      shift
      ;;
    --uninstall)
      [ -z "$MODE" ] || fail "Modes --global, --skill-only, --target, and --uninstall are mutually exclusive."
      MODE="uninstall"
      shift
      ;;
    --target)
      [ -z "$MODE" ] || fail "Modes --global, --skill-only, --target, and --uninstall are mutually exclusive."
      [ "$#" -ge 2 ] || fail "--target requires a non-empty workspace directory path."
      TARGET_DIR="$(trim_whitespace "$2")"
      [ -n "$TARGET_DIR" ] || fail "--target requires a non-empty workspace directory path."
      MODE="target"
      shift 2
      ;;
    --target=*)
      [ -z "$MODE" ] || fail "Modes --global, --skill-only, --target, and --uninstall are mutually exclusive."
      TARGET_DIR="$(trim_whitespace "${1#--target=}")"
      [ -n "$TARGET_DIR" ] || fail "--target requires a non-empty workspace directory path."
      MODE="target"
      shift
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      [ -z "$MODE" ] || fail "Unexpected extra argument: $1"
      TARGET_DIR="$(trim_whitespace "$1")"
      [ -n "$TARGET_DIR" ] || fail "Target workspace directory path cannot be empty or whitespace."
      MODE="target"
      shift
      ;;
  esac
done

[ -n "$MODE" ] || MODE="global"

GLOBAL_RULE_SRC="$REPO_ROOT/AGENTS.global.md"

case "$MODE" in
  uninstall)
    GEMINI_HOME="$(resolve_gemini_home)"
    remove_ultracode_block "$GEMINI_HOME/AGENTS.md"
    remove_tree_safe "$GEMINI_HOME/config/plugins/ultracode"
    remove_tree_safe "$GEMINI_HOME/config/skills/ultracode"
    printf '[ultracode] Uninstalled from %s\n' "$GEMINI_HOME"
    ;;

  target)
    NORM_TARGET="$(normalize_path "$TARGET_DIR")"
    assert_not_filesystem_root "$TARGET_DIR" "$NORM_TARGET" "--target"
    [ -d "$NORM_TARGET" ] || fail "Target workspace directory does not exist: $TARGET_DIR"
    RESOLVED_TARGET="$(strip_trailing_slashes "$(cd "$NORM_TARGET" && pwd -P)")"
    assert_not_filesystem_root "$TARGET_DIR" "$RESOLVED_TARGET" "--target"
    assert_skill_payload_exists "$REPO_ROOT"

    TMP_BLOCK="${RESOLVED_TARGET}/.ultracode-block.tmp.$$"
    extract_source_block "$GLOBAL_RULE_SRC" "$TMP_BLOCK"
    upsert_ultracode_block "$RESOLVED_TARGET/AGENTS.md" "$TMP_BLOCK"
    rm -f "$TMP_BLOCK"

    unlink_if_link_or_file "$RESOLVED_TARGET/.agents"
    unlink_if_link_or_file "$RESOLVED_TARGET/.agents/skills"
    sync_skill_tree "$REPO_ROOT" "$RESOLVED_TARGET/.agents/skills/ultracode"
    printf '[ultracode] Installed workspace bundle into %s\n' "$RESOLVED_TARGET"
    ;;

  skill-only)
    GEMINI_HOME="$(resolve_gemini_home)"
    assert_skill_payload_exists "$REPO_ROOT"

    if [ "$NO_GLOBAL_RULE" -eq 0 ]; then
      mkdir -p "$GEMINI_HOME"
      TMP_BLOCK="${GEMINI_HOME}/.ultracode-block.tmp.$$"
      extract_source_block "$GLOBAL_RULE_SRC" "$TMP_BLOCK"
      upsert_ultracode_block "$GEMINI_HOME/AGENTS.md" "$TMP_BLOCK"
      rm -f "$TMP_BLOCK"
    fi

    unlink_if_link_or_file "$GEMINI_HOME/config"
    unlink_if_link_or_file "$GEMINI_HOME/config/skills"
    sync_skill_tree "$REPO_ROOT" "$GEMINI_HOME/config/skills/ultracode"

    PLUGIN_DIR="$GEMINI_HOME/config/plugins/ultracode"
    unlink_if_link_or_file "$PLUGIN_DIR"
    if ! is_same_physical_dir "$REPO_ROOT" "$PLUGIN_DIR"; then
      remove_tree_safe "$PLUGIN_DIR"
    fi
    printf '[ultracode] Installed skill-only bundle into %s/config/skills/ultracode\n' "$GEMINI_HOME"
    ;;

  global)
    GEMINI_HOME="$(resolve_gemini_home)"
    assert_skill_payload_exists "$REPO_ROOT"
    [ -f "$REPO_ROOT/plugin.json" ] || fail "Missing required plugin manifest: $REPO_ROOT/plugin.json"
    [ -f "$REPO_ROOT/assets/logo.svg" ] || fail "Missing required plugin logo: $REPO_ROOT/assets/logo.svg"

    if [ "$NO_GLOBAL_RULE" -eq 0 ]; then
      mkdir -p "$GEMINI_HOME"
      TMP_BLOCK="${GEMINI_HOME}/.ultracode-block.tmp.$$"
      extract_source_block "$GLOBAL_RULE_SRC" "$TMP_BLOCK"
      upsert_ultracode_block "$GEMINI_HOME/AGENTS.md" "$TMP_BLOCK"
      rm -f "$TMP_BLOCK"
    fi

    unlink_if_link_or_file "$GEMINI_HOME/config"
    unlink_if_link_or_file "$GEMINI_HOME/config/plugins"
    PLUGIN_DIR="$GEMINI_HOME/config/plugins/ultracode"
    unlink_if_link_or_file "$PLUGIN_DIR"

    if ! is_same_physical_dir "$REPO_ROOT" "$PLUGIN_DIR"; then
      unlink_if_link_or_file "$PLUGIN_DIR/assets"
      unlink_if_link_or_file "$PLUGIN_DIR/skills"
      mkdir -p "$PLUGIN_DIR/assets"
      cp -f "$REPO_ROOT/plugin.json" "$PLUGIN_DIR/plugin.json"
      cp -f "$REPO_ROOT/assets/logo.svg" "$PLUGIN_DIR/assets/logo.svg"

      if [ -f "$REPO_ROOT/README.md" ]; then
        cp -f "$REPO_ROOT/README.md" "$PLUGIN_DIR/README.md"
      else
        remove_tree_safe "$PLUGIN_DIR/README.md"
      fi

      sync_skill_tree "$REPO_ROOT" "$PLUGIN_DIR/skills/ultracode"
    fi

    remove_tree_safe "$PLUGIN_DIR/rules"
    LEGACY_SKILL_DIR="$GEMINI_HOME/config/skills/ultracode"
    unlink_if_link_or_file "$LEGACY_SKILL_DIR"
    if ! is_same_physical_dir "$REPO_ROOT" "$LEGACY_SKILL_DIR"; then
      remove_tree_safe "$LEGACY_SKILL_DIR"
    fi
    printf '[ultracode] Installed global plugin bundle into %s\n' "$PLUGIN_DIR"
    ;;
esac
