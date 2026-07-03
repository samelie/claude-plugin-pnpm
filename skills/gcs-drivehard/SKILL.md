---
name: gcs-drivehard
description: "Interact with the Mac mini DriveHard GCS storage system — the two-bucket rclone setup. Use when the user wants to: mount/unmount the archive vault read-only at ~/GCS and copy files back out, push/back up folders to the archive bucket (additive, keeps local), offload large files to cold storage and free disk, restore archived files, edit the archive push policy, or manage/inspect the backup schedule and health (whether the nightly mirror is actually running). Covers the gcs-drivehard remote: archive (cold vault — additive policy push + optional offload, browsed read-only at ~/GCS) and backup (managed nightly mirror — schedule via sync-install.sh, writes only through the guarded sync.sh). Triggers: gcs drive, ~/GCS, drivehard, rclone mount, mount gcs, unmount gcs, push folder to gcs, back up folder to archive, archive policy, archive-policy.yaml, gcs-archive push, plan push, additive copy to gcs, archive to cold storage, free disk space, offload to gcs, restore file, gcs storage, mac mini backup, backup bucket status, is the backup running, backup not running, backup schedule, install backup agent, sync-install, sync-config, backup cron, launchd backup, drivehard buckets."
---

# gcs-drivehard

Unified control surface for the Mac mini **DriveHard → GCS** storage system. One rclone remote (`gcs-drivehard`, project `488119829206`, us-west1), two buckets, two distinct roles. This skill is the single entry point that captures **intent**: pick the right bucket for the job, run the right CLI, and never touch the automated backup.

## The two buckets — pick by intent

| Bucket | Class | Role | How it changes | This skill |
|---|---|---|---|---|
| `mac-mini-drivehard-archive` | Nearline | Cold vault. **Push folders up additively (keeps local)**; **browse read-only at `~/GCS`** and copy files back out. | `gcs-archive push` (additive); `mount.sh` (read-only view) | plan / push / mount(RO) / restore / scan / status |
| `mac-mini-drivehard-backup` | Coldline | Nightly mirror of `/Volumes/DriveHard/`. | guarded `sync.sh` via launchd, 04:00 (managed by `sync-install.sh`) | manage schedule + status + guarded run; **no freeform writes** |

Decision guide:
- **Want to browse everything in the vault and pull copies back to local?** → the read-only archive mount at `~/GCS` (`./mount.sh start -d`). Streamed on demand; copy files OUT onto the drive. Never write into it.
- **Want to repeatedly copy folders up to cold storage, keeping the local copy?** → archive **push** (`gcs-archive push`). Non-destructive, idempotent, driven by `archive-policy.yaml`. This is the default "back it up to archive" path.
- **Want a big file OFF local disk (freed) but kept safe, retrieve later?** → archive **offload** (`gcs-archive archive`). ⚠️ deletes the local original, leaves a stub.
- **Want a disaster-recovery copy of the whole drive?** → that's the backup — it runs itself. Don't drive it from here.

## Paths

```
RCLONE_DIR=/Volumes/DriveHard/samelie-monorepo/mac_config/rclone
RCLONE_CONF=$RCLONE_DIR/rclone.conf
ARCHIVE_PKG=/Volumes/DriveHard/samelie-monorepo/packages/gcs-archive
```

---

## MOUNT — `~/GCS` = read-only view of the archive vault

`~/GCS` mounts **`mac-mini-drivehard-archive`** via `rclone nfsmount` (NFS-based; **no macFUSE/app required**), **read-only** — an explorer/viewer over everything pushed to cold storage. Browse in Finder, copy files back OUT onto the drive on demand. VFS cache on DriveHard at `/Volumes/DriveHard/_Cache/rclone-vfs`.

Defaults are set in `mount-config.sh` (`MOUNT_BUCKET=mac-mini-drivehard-archive`, `READ_ONLY=true`), so plain `start` mounts the vault read-only.

```bash
cd /Volumes/DriveHard/samelie-monorepo/mac_config/rclone

./mount.sh start -d          # mount the vault read-only at ~/GCS (daemonized)
./mount.sh status            # mount state + cache size + bucket size
./mount.sh logs              # tail mount.log
./mount.sh stop              # unmount
```

**Copy files OUT of the vault** (the only write direction — onto local disk):
```bash
cp -Rv ~/GCS/Pictures/Paris2025/  /Volumes/DriveHard/restored/   # Finder drag-out works too
```
To restore a specific archived file by path, prefer `gcs-archive restore` (manifest-aware).

Auto-mount on login (launchd) — plist passes `--read-only --bucket mac-mini-drivehard-archive`:
```bash
cp com.selie.rclone-drivehard-mount.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.selie.rclone-drivehard-mount.plist
launchctl print   gui/$(id -u)/com.selie.rclone-drivehard-mount   # status
```

The mount is **read-only** — you cannot delete or alter vault objects through `~/GCS`. The vault is written only by `gcs-archive push`.

---

## ARCHIVE — `mac-mini-drivehard-archive`

Cold vault (Nearline). Deep-dive lives in the **`gcs-archive`** skill. Two modes:

### 1. Policy push — additive, non-destructive, repeatable (DEFAULT)

Copies configured folders/globs to the archive bucket and **keeps the local files** (no stub, no delete, remote never pruned). Idempotent — re-run to send only new/changed files. Driven by committed config `packages/gcs-archive/archive-policy.yaml` (schema `archive-policy.schema.json`).

```bash
cd /Volumes/DriveHard/samelie-monorepo/packages/gcs-archive

uv run gcs-archive plan               # read-only: what the policy would upload
uv run gcs-archive push --dry-run     # same preview via push
uv run gcs-archive push               # additive rclone copy → archive bucket (local untouched)
uv run gcs-archive push -r pictures   # only the named rule
```

Uses `rclone copy` only — additive, never `sync`/`move`/`delete`; the backup bucket is rejected as a destination (guarded in `policy.py`). **Configured out of the box:** rule `pictures` → `/Volumes/DriveHard/Pictures` (~233 GiB). Add folders by editing `archive-policy.yaml` (`include` globs relative to `source_root`, optional `exclude`, `min_size_mb`).

### 2. Offload — frees local disk ⚠️ deletes local original

```bash
uv run gcs-archive scan -t 500 -n 30       # find files ≥500MB eligible to offload
uv run gcs-archive archive /path/to/file   # upload → stub → DELETE local → manifest
uv run gcs-archive archive /path --dry-run # preview
uv run gcs-archive restore /path/to/file   # pull back from GCS
uv run gcs-archive status                   # archived files + space saved
uv run gcs-archive verify                   # confirm archived objects still in GCS
```

Offload semantics: upload (if absent) → verify checksum → replace local file with a `.gcs-archived` JSON stub → **delete original** → record in SQLite manifest. Use only when the goal is reclaiming disk. **Never deletes remote objects** — deleting a local stub does not touch GCS.

---

## BACKUP — `mac-mini-drivehard-backup` — managed nightly mirror

`rclone sync` **mirror** of the whole drive, run by a launchd agent. Fully encoded as committed infra in `mac_config/rclone/` — single source of truth, reproducible:

| File | Role |
|---|---|
| `sync-config.sh` | **Source of truth** — source, bucket, schedule (04:00), `MAX_DELETE`, tuning, log retention |
| `sync.sh` | Runs the mirror; **guarded** — aborts if source unmounted/empty, caps deletes at `MAX_DELETE`, refuses non-backup buckets |
| `sync-install.sh` | Renders the launchd agent from config + bootstraps (`install` / `uninstall` / `status`) |
| `filter-rules.txt` | Exclude globs |
| `com.selie.rclone-drivehard-sync.plist` | Reference copy (live agent is generated by `sync-install.sh`) |

**Manage the schedule (sanctioned):**
```bash
cd /Volumes/DriveHard/samelie-monorepo/mac_config/rclone

./sync-install.sh status      # config + launchd runs/last-exit + newest log + bucket size
./sync-install.sh install     # (re)install agent from sync-config.sh — edit schedule there first
./sync-install.sh uninstall
```

**Run / refresh (sanctioned — mutates the mirror; do when the user asks):**
```bash
./sync.sh --dry-run                 # preview drift (read-only)
./sync.sh                           # perform the mirror now (cap from sync-config.sh)
./sync.sh --max-delete 50000        # one-off higher cap
./sync.sh --max-delete off          # one-time catch-up: no delete cap (use after a long gap)
```
Safe by construction: `sync.sh` aborts if `/Volumes/DriveHard` isn't mounted or is empty, and `--max-delete` caps catastrophic deletion. If a run exits **7** with `--max-delete threshold reached`, the mirror wants to prune more than the cap (normal after a long gap) — inspect the log's `Skipped delete` lines, then do one catch-up with a raised/`off` cap; nightly runs stay capped.

**🛑 STILL FORBIDDEN — no freeform rclone against this bucket:**
- ❌ `rclone sync|copy|move|delete|rmdirs|bisync` targeting `mac-mini-drivehard-backup` directly — all writes go through the guarded `sync.sh` only.
- ❌ Repointing the mirror at the archive/mount buckets (`sync.sh` refuses this anyway).
- ❌ Mounting the backup bucket read-write.

Why: `sync` is a mirror — a stray freeform command can **delete** objects to match some other state. The guardrail is now *the script*, not a total ban.

### External-drive resilience (scheduled runs)

`/Volumes/DriveHard` is a **USB external disk** that spins down when idle (`disksleep`). Originally launchd ran `sync.sh` directly off that drive, so at 02:00 with the disk asleep it couldn't exec the script or open its logs → **exit 78 (`EX_CONFIG`)**, no log. (The Mac not sleeping doesn't help — the disk sleeps independently.)

Fixed by decoupling launchd from the external drive:
- launchd runs a small **wrapper on the internal disk** — `~/Library/Application Support/<label>/run.sh`, generated by `sync-install.sh`. It polls up to ~60s for `/Volumes/DriveHard` (which **wakes** a spun-down disk), then execs the repo's `sync.sh`. If the drive is truly absent (ejected), it exits 0 (graceful skip, not a failure).
- launchd's own logs live on the **internal** disk (`~/Library/Logs/<label>.{out,err}.log`), so diagnostics survive a spun-down drive. Per-run rclone logs remain `sync-*.log` on the drive.
- `disksleep` no longer needs changing (`status` reports it as informational). Optional: `sudo pmset -c disksleep 0` just avoids a few seconds of spin-up latency at 02:00.

Source of truth stays in the repo (`sync-config.sh` + `sync.sh`); the wrapper is a generated bootstrap.

---

## Health check (both, read-only)

```bash
cd /Volumes/DriveHard/samelie-monorepo/mac_config/rclone
for b in archive backup; do
  echo "== mac-mini-drivehard-$b =="
  rclone --config ./rclone.conf size "gcs-drivehard:mac-mini-drivehard-$b"
done
mount | grep -q " on $HOME/GCS " && echo "mount: MOUNTED" || echo "mount: not mounted"
```

## Notes

- Auth: Application Default Credentials via `gcloud` login; rclone remote `gcs-drivehard` in `mac_config/rclone/rclone.conf` (and `~/.config/rclone/rclone.conf`). 1Password refs supported by the archive tool (`GCS_ARCHIVE_OP_*`).
- The archive vault is **standalone** — not covered by the nightly backup unless the same bytes also live on `/Volumes/DriveHard/`. Flag single-copy risk to the user when relevant (e.g. deleting local originals after a push leaves the archive as the only copy once the mirror prunes).
- Historical: a third bucket, `mac-mini-drivehard-mount` (Standard, the old read-write `~/GCS` mount), was deleted 2026-07-02 after MD5-verifying all 864 non-empty objects existed in the archive vault.
