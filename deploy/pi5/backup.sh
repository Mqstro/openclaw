#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# backup.sh — Daily backup of OpenClaw state and workspace
# ──────────────────────────────────────────────────────────────────────
#
# Creates a timestamped tar.gz archive of /opt/openclaw/state/ and
# /opt/openclaw/workspace/, stores it locally, copies to VPS, and
# cleans up old backups.
#
# Usage:
#   ./backup.sh              # Run backup
#   ./backup.sh --dry-run    # Show what would be done without executing
#
# Cron (daily at 3:30 AM, after the existing Pi5 DB backups at 3:00):
#   30 3 * * * /opt/openclaw/deploy/backup.sh >> /var/log/openclaw-backup.log 2>&1
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────

STATE_DIR="/opt/openclaw/state"
WORKSPACE_DIR="/opt/openclaw/workspace"
LOCAL_BACKUP_DIR="/home/manu/backups/openclaw"
REMOTE_HOST="root@217.154.169.120"
REMOTE_DIR="/root/backups/pi5-daily"
RETENTION_DAYS=30

TIMESTAMP=$(date '+%Y-%m-%d_%H%M%S')
BACKUP_NAME="openclaw-backup-${TIMESTAMP}.tar.gz"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
fi

# ── Helpers ──────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

die() { log "ERROR: $*" >&2; exit 1; }

# ── Preflight checks ────────────────────────────────────────────────

[[ -d "$STATE_DIR" ]] || die "State directory not found: $STATE_DIR"
[[ -d "$WORKSPACE_DIR" ]] || die "Workspace directory not found: $WORKSPACE_DIR"

# ── Create local backup directory ────────────────────────────────────

if [[ "$DRY_RUN" == true ]]; then
    log "[DRY-RUN] Would create: $LOCAL_BACKUP_DIR"
else
    mkdir -p "$LOCAL_BACKUP_DIR"
fi

# ── Create backup archive ───────────────────────────────────────────

log "Starting OpenClaw backup..."
log "  State:     $STATE_DIR"
log "  Workspace: $WORKSPACE_DIR"
log "  Output:    $LOCAL_BACKUP_DIR/$BACKUP_NAME"

if [[ "$DRY_RUN" == true ]]; then
    log "[DRY-RUN] Would create tar.gz archive"
else
    tar -czf "$LOCAL_BACKUP_DIR/$BACKUP_NAME" \
        -C /opt/openclaw \
        state/ \
        workspace/ \
        2>/dev/null

    BACKUP_SIZE=$(du -sh "$LOCAL_BACKUP_DIR/$BACKUP_NAME" | cut -f1)
    log "  Archive created: $BACKUP_SIZE"
fi

# ── Copy to VPS (offsite backup) ────────────────────────────────────

log "Copying to VPS ($REMOTE_HOST:$REMOTE_DIR)..."

if [[ "$DRY_RUN" == true ]]; then
    log "[DRY-RUN] Would scp to $REMOTE_HOST:$REMOTE_DIR/"
else
    # Ensure remote directory exists
    ssh -o ConnectTimeout=10 "$REMOTE_HOST" "mkdir -p $REMOTE_DIR" 2>/dev/null || {
        log "WARNING: Could not create remote directory. VPS may be unreachable."
    }

    scp -o ConnectTimeout=30 \
        "$LOCAL_BACKUP_DIR/$BACKUP_NAME" \
        "$REMOTE_HOST:$REMOTE_DIR/" 2>/dev/null && {
        log "  Offsite copy complete."
    } || {
        log "WARNING: Failed to copy backup to VPS. Local copy retained."
    }
fi

# ── Cleanup old local backups ────────────────────────────────────────

log "Cleaning up local backups older than ${RETENTION_DAYS} days..."

if [[ "$DRY_RUN" == true ]]; then
    OLD_COUNT=$(find "$LOCAL_BACKUP_DIR" -name "openclaw-backup-*.tar.gz" -mtime +"$RETENTION_DAYS" 2>/dev/null | wc -l)
    log "[DRY-RUN] Would delete $OLD_COUNT old backup(s)"
else
    DELETED=0
    while IFS= read -r old_backup; do
        rm -f "$old_backup"
        DELETED=$((DELETED + 1))
        log "  Deleted: $(basename "$old_backup")"
    done < <(find "$LOCAL_BACKUP_DIR" -name "openclaw-backup-*.tar.gz" -mtime +"$RETENTION_DAYS" 2>/dev/null)
    log "  Cleaned up $DELETED old backup(s)."
fi

# ── Cleanup old remote backups ───────────────────────────────────────

log "Cleaning up remote backups older than ${RETENTION_DAYS} days..."

if [[ "$DRY_RUN" == true ]]; then
    log "[DRY-RUN] Would clean remote backups on VPS"
else
    ssh -o ConnectTimeout=10 "$REMOTE_HOST" \
        "find $REMOTE_DIR -name 'openclaw-backup-*.tar.gz' -mtime +$RETENTION_DAYS -delete" 2>/dev/null && {
        log "  Remote cleanup complete."
    } || {
        log "WARNING: Could not clean remote backups."
    }
fi

# ── Summary ──────────────────────────────────────────────────────────

log "Backup complete: $BACKUP_NAME"
