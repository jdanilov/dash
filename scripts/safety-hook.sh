#!/bin/bash
# Safety Hook for Claude Code "Safe Auto-Approve" Mode
# Blocks potentially destructive commands before execution
# Receives tool input as JSON on stdin

set -e

input=$(cat)
cmd=$(echo "$input" | jq -r '.command // empty')

# Exit early if no command
[[ -z "$cmd" ]] && exit 0

# Helper to block with message
block() {
  echo "🛑 BLOCKED: $1"
  echo "Command: $cmd"
  exit 1
}

# =============================================================================
# Git Destructive Operations
# =============================================================================

# Force push (anywhere - too risky)
echo "$cmd" | grep -qE 'git\s+push\s+.*(-f|--force)' && \
  block "git push --force - could overwrite remote history"

# Hard reset
echo "$cmd" | grep -qE 'git\s+reset\s+--hard' && \
  block "git reset --hard - would discard uncommitted changes"

# Clean with force (deletes untracked files)
echo "$cmd" | grep -qE 'git\s+clean\s+-[a-z]*f' && \
  block "git clean -f - would delete untracked files"

# Force delete branch
echo "$cmd" | grep -qE 'git\s+branch\s+-D' && \
  block "git branch -D - force deletes branch without merge check"

# =============================================================================
# File System Destructive Operations
# =============================================================================

# rm -rf on dangerous paths
echo "$cmd" | grep -qE 'rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(/|~|\.|\.\.|\$HOME|/Users|/home|/etc|/var|/usr|\*)\s*$' && \
  block "rm -rf on dangerous path"

# Recursive rm on root-level directories
echo "$cmd" | grep -qE 'rm\s+-r[f]?\s+/[a-z]+\s*$' && \
  block "rm -r on root-level directory"

# chmod 777 (world writable)
echo "$cmd" | grep -qE 'chmod\s+(-R\s+)?777' && \
  block "chmod 777 - makes files world-writable"

# Recursive chmod on dangerous paths
echo "$cmd" | grep -qE 'chmod\s+-R\s+[0-7]{3,4}\s+(/|~|\$HOME|/Users|/home)' && \
  block "chmod -R - recursive permission change on system directory"

# =============================================================================
# Process/System Operations
# =============================================================================

# sudo rm
echo "$cmd" | grep -qE 'sudo\s+rm\s' && \
  block "sudo rm - elevated privilege file deletion"

# pkill/killall without specific target (too broad)
echo "$cmd" | grep -qE '(pkill|killall)\s+-9' && \
  block "Force killing processes with -9"

# =============================================================================
# Database Operations (MongoDB, PostgreSQL, etc.)
# =============================================================================

# MongoDB: Drop database
echo "$cmd" | grep -qiE '\.dropDatabase\s*\(' && \
  block "dropDatabase() - would delete entire database"

# MongoDB: Drop collection
echo "$cmd" | grep -qiE '\.drop\s*\(\s*\)' && \
  block "drop() - would delete entire collection"

# MongoDB: Delete all documents (empty filter)
echo "$cmd" | grep -qiE 'deleteMany\s*\(\s*(\{\s*\})?\s*\)' && \
  block "deleteMany with empty filter - would delete all documents"

# MongoDB: Legacy remove all
echo "$cmd" | grep -qiE '\.remove\s*\(\s*\{\s*\}\s*\)' && \
  block "remove({}) - would delete all documents"

# Production connection strings
echo "$cmd" | grep -qiE '(mongodb|postgresql|mysql).*prod(uction)?[^a-z]' && \
  block "Production database connection detected"

# PostgreSQL: DROP DATABASE/TABLE
echo "$cmd" | grep -qiE 'DROP\s+(DATABASE|TABLE)' && \
  block "DROP DATABASE/TABLE - would delete database or table"

# =============================================================================
# All checks passed
# =============================================================================
exit 0
