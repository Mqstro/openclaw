#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# iptables-whitelist.sh — Restrict OpenClaw container outbound traffic
# ──────────────────────────────────────────────────────────────────────
#
# This script creates iptables rules that limit the openclaw container's
# outbound network access to only approved destinations:
#   - api.anthropic.com (Claude API)
#   - WhatsApp servers (web.whatsapp.com, mmg.whatsapp.net, etc.)
#   - Localhost / loopback
#   - Tailscale CGNAT (100.64.0.0/10)
#   - Local network (192.168.0.0/16, 10.0.0.0/8)
#   - DNS (port 53) for name resolution
#
# Everything else is blocked (DROP).
#
# Usage:
#   sudo ./iptables-whitelist.sh          # Apply rules
#   sudo ./iptables-whitelist.sh --flush  # Remove all OpenClaw rules
#
# Run this AFTER docker compose up (the Docker network must exist).
# Re-run periodically via cron to refresh DNS-resolved IPs:
#   0 */6 * * * /opt/openclaw/deploy/iptables-whitelist.sh >> /var/log/openclaw-fw.log 2>&1
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

CHAIN_NAME="OPENCLAW_OUT"
DOCKER_NETWORK="pi5_openclaw-net"

# ── Helpers ──────────────────────────────────────────────────────────

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

resolve_ips() {
    local domain="$1"
    dig +short "$domain" A 2>/dev/null | grep -E '^[0-9]+\.' || true
}

get_docker_subnet() {
    docker network inspect "$DOCKER_NETWORK" \
        --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo ""
}

# ── Flush mode ───────────────────────────────────────────────────────

if [[ "${1:-}" == "--flush" ]]; then
    log "Flushing OpenClaw iptables rules..."
    iptables -D FORWARD -s "$(get_docker_subnet)" -j "$CHAIN_NAME" 2>/dev/null || true
    iptables -F "$CHAIN_NAME" 2>/dev/null || true
    iptables -X "$CHAIN_NAME" 2>/dev/null || true
    log "Done. All OpenClaw firewall rules removed."
    exit 0
fi

# ── Preflight checks ────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This script must be run as root (sudo)." >&2
    exit 1
fi

if ! command -v iptables &>/dev/null; then
    echo "ERROR: iptables not found. Install with: apt install iptables" >&2
    exit 1
fi

if ! command -v dig &>/dev/null; then
    echo "ERROR: dig not found. Install with: apt install dnsutils" >&2
    exit 1
fi

SUBNET=$(get_docker_subnet)
if [[ -z "$SUBNET" ]]; then
    echo "ERROR: Docker network '$DOCKER_NETWORK' not found. Is docker compose up?" >&2
    exit 1
fi

log "OpenClaw container subnet: $SUBNET"

# ── Resolve dynamic IPs ─────────────────────────────────────────────

log "Resolving allowed domains..."

ANTHROPIC_IPS=$(resolve_ips "api.anthropic.com")
WHATSAPP_WEB_IPS=$(resolve_ips "web.whatsapp.com")
WHATSAPP_MMG_IPS=$(resolve_ips "mmg.whatsapp.net")
WHATSAPP_MEDIA_IPS=$(resolve_ips "media.whatsapp.net")
WHATSAPP_STATIC_IPS=$(resolve_ips "static.whatsapp.net")
WHATSAPP_PPSM_IPS=$(resolve_ips "pps.whatsapp.net")
WHATSAPP_G_IPS=$(resolve_ips "g.whatsapp.net")

# Combine all resolved IPs
ALL_WHATSAPP_IPS="$WHATSAPP_WEB_IPS $WHATSAPP_MMG_IPS $WHATSAPP_MEDIA_IPS $WHATSAPP_STATIC_IPS $WHATSAPP_PPSM_IPS $WHATSAPP_G_IPS"

log "Anthropic IPs: $(echo "$ANTHROPIC_IPS" | tr '\n' ' ')"
log "WhatsApp IPs: $(echo "$ALL_WHATSAPP_IPS" | tr '\n' ' ')"

# ── Build iptables chain ────────────────────────────────────────────

log "Creating iptables chain $CHAIN_NAME..."

# Remove existing chain if present (idempotent)
iptables -D FORWARD -s "$SUBNET" -j "$CHAIN_NAME" 2>/dev/null || true
iptables -F "$CHAIN_NAME" 2>/dev/null || true
iptables -X "$CHAIN_NAME" 2>/dev/null || true

# Create fresh chain
iptables -N "$CHAIN_NAME"

# ── Rule 1: Allow established/related connections ────────────────────
iptables -A "$CHAIN_NAME" -m state --state ESTABLISHED,RELATED -j ACCEPT

# ── Rule 2: Allow DNS (UDP + TCP port 53) ───────────────────────────
iptables -A "$CHAIN_NAME" -p udp --dport 53 -j ACCEPT
iptables -A "$CHAIN_NAME" -p tcp --dport 53 -j ACCEPT

# ── Rule 3: Allow loopback ──────────────────────────────────────────
iptables -A "$CHAIN_NAME" -d 127.0.0.0/8 -j ACCEPT

# ── Rule 4: Allow Tailscale CGNAT range ─────────────────────────────
iptables -A "$CHAIN_NAME" -d 100.64.0.0/10 -j ACCEPT

# ── Rule 5: Allow local network ranges ──────────────────────────────
iptables -A "$CHAIN_NAME" -d 192.168.0.0/16 -j ACCEPT
iptables -A "$CHAIN_NAME" -d 10.0.0.0/8 -j ACCEPT
iptables -A "$CHAIN_NAME" -d 172.16.0.0/12 -j ACCEPT

# ── Rule 6: Allow Anthropic API (HTTPS) ─────────────────────────────
for ip in $ANTHROPIC_IPS; do
    iptables -A "$CHAIN_NAME" -d "$ip" -p tcp --dport 443 -j ACCEPT
    log "  Allowed: api.anthropic.com -> $ip:443"
done

# ── Rule 7: Allow WhatsApp servers (HTTPS + WSS) ────────────────────
for ip in $ALL_WHATSAPP_IPS; do
    iptables -A "$CHAIN_NAME" -d "$ip" -p tcp --dport 443 -j ACCEPT
    iptables -A "$CHAIN_NAME" -d "$ip" -p tcp --dport 5222 -j ACCEPT
    log "  Allowed: WhatsApp -> $ip:443,5222"
done

# WhatsApp also uses Meta/Facebook IP ranges for media CDN
# Allow the well-known Meta CIDR blocks for media delivery
META_CIDRS="157.240.0.0/16 31.13.24.0/21 31.13.64.0/18 179.60.192.0/22 185.60.216.0/22"
for cidr in $META_CIDRS; do
    iptables -A "$CHAIN_NAME" -d "$cidr" -p tcp --dport 443 -j ACCEPT
done
log "  Allowed: Meta/WhatsApp CDN CIDRs"

# ── Rule 8: Block everything else ───────────────────────────────────
iptables -A "$CHAIN_NAME" -j DROP

# ── Hook chain into FORWARD ─────────────────────────────────────────
iptables -I FORWARD -s "$SUBNET" -j "$CHAIN_NAME"

log "Firewall rules applied successfully."
log "Total rules in $CHAIN_NAME: $(iptables -L "$CHAIN_NAME" --line-numbers | tail -n +3 | wc -l)"
log ""
log "To verify:  iptables -L $CHAIN_NAME -n -v"
log "To remove:  $0 --flush"
