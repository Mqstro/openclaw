# OpenClaw Pi5 Hardened Deployment

Hardened Docker deployment of OpenClaw for Raspberry Pi 5 (ARM64, 16GB RAM).

## What This Deployment Does

- Runs OpenClaw in a locked-down Docker container (non-root, no capabilities, resource-limited)
- Exposes **zero ports** to the network; access only via Tailscale Serve
- Restricts outbound traffic to only Anthropic API and WhatsApp servers
- WhatsApp channel with allowlist-only DM policy (no groups)
- Sandboxed agent execution with read-only workspace
- Daily offsite backups to VPS

## Prerequisites

- Docker and Docker Compose v2
- Tailscale installed and connected (`tailscale status`)
- SSH key access to VPS (root@217.154.169.120) for offsite backups
- The `mqstro/openclaw:hardened` Docker image (built from repo root)

## Quick Start

```bash
# Clone and navigate to deployment directory
cd /path/to/openclaw/deploy/pi5

# Run the automated setup (creates dirs, generates token, starts container)
sudo ./setup.sh
```

The setup script handles everything: directory creation, token generation, config deployment, and container startup.

## Connecting WhatsApp

1. After setup, watch container logs for the QR code:
   ```bash
   docker logs -f openclaw
   ```
2. Scan the QR code with WhatsApp on your phone
3. Edit `/opt/openclaw/state/openclaw.json` to set your actual phone number in the allowlist
4. Restart: `docker compose restart`

## Tailscale Serve

The container binds to loopback only. To access it remotely via Tailscale:

```bash
# Expose the gateway on your Tailscale hostname
tailscale serve --bg https+insecure://localhost:18789

# Verify
tailscale serve status
```

Access via: `https://pi5.tail-net-name.ts.net/`

## Backups

Daily backups archive `/opt/openclaw/state/` and `/opt/openclaw/workspace/` as timestamped tar.gz files.

**Manual run:**

```bash
/opt/openclaw/deploy/backup.sh
```

**Cron (add to root crontab):**

```
30 3 * * * /opt/openclaw/deploy/backup.sh >> /var/log/openclaw-backup.log 2>&1
```

- Local storage: `/home/manu/backups/openclaw/`
- Offsite copy: VPS at `/root/backups/pi5-daily/`
- Retention: 30 days (local and remote)

## Firewall

The `iptables-whitelist.sh` script restricts outbound container traffic to:

| Destination                     | Purpose                              |
| ------------------------------- | ------------------------------------ |
| api.anthropic.com               | Claude API                           |
| _.whatsapp.com / _.whatsapp.net | WhatsApp messaging                   |
| Meta CDN CIDRs                  | WhatsApp media delivery              |
| 127.0.0.0/8                     | Loopback                             |
| 100.64.0.0/10                   | Tailscale CGNAT                      |
| 192.168.0.0/16, 10.0.0.0/8      | Local network (Home Assistant, etc.) |
| Port 53                         | DNS resolution                       |

Everything else is dropped.

```bash
# Apply rules (after docker compose up)
sudo /opt/openclaw/deploy/iptables-whitelist.sh

# Remove rules
sudo /opt/openclaw/deploy/iptables-whitelist.sh --flush

# Refresh DNS-resolved IPs via cron (every 6 hours)
0 */6 * * * /opt/openclaw/deploy/iptables-whitelist.sh >> /var/log/openclaw-fw.log 2>&1
```

## Security Features

| Feature                  | Implementation                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| Non-root container       | `user: "1000:1000"`                                                  |
| No privilege escalation  | `no-new-privileges:true`                                             |
| All capabilities dropped | `cap_drop: ALL`                                                      |
| No exposed ports         | Access via Tailscale Serve only                                      |
| Resource limits          | 2GB RAM, 2 CPUs max                                                  |
| Outbound firewall        | iptables whitelist (Anthropic + WhatsApp only)                       |
| Gateway auth             | Token-based + Tailscale identity                                     |
| WhatsApp allowlist       | Only specified phone numbers can interact                            |
| Agent sandboxing         | Docker sandbox with no network, read-only root, PID limits           |
| Disabled features        | No browser, web search, web fetch, canvas, mDNS, wide-area discovery |
| State directory          | `chmod 700`, restricted to container UID                             |
| Backup encryption        | tar.gz with restricted permissions                                   |

## File Overview

| File                     | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `docker-compose.yml`     | Hardened container definition           |
| `.env.example`           | Environment variable template           |
| `openclaw-hardened.json` | OpenClaw configuration (security-first) |
| `setup.sh`               | Automated deployment script             |
| `iptables-whitelist.sh`  | Outbound traffic firewall rules         |
| `backup.sh`              | Daily backup with offsite copy          |

## Troubleshooting

```bash
# Check container status
docker ps -a --filter name=openclaw

# View logs
docker logs openclaw
docker logs -f openclaw  # follow

# Restart
cd /path/to/openclaw/deploy/pi5 && docker compose restart

# Check firewall rules
sudo iptables -L OPENCLAW_OUT -n -v

# Check Tailscale
tailscale status
tailscale serve status
```
