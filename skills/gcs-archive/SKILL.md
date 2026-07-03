---
name: gcs-archive
description: "Manage cold storage archival of large files to Google Cloud Storage. Use when the user wants to: find large files consuming disk space, archive files to GCS and free local space, restore archived files from cloud, check archive status/savings, verify archived files still exist in GCS, or discuss disk space management strategy. Triggers: archive, cold storage, gcs archive, large files, free space, free disk, restore from cloud, archive to gcs, disk space, what's taking space, clean up drive, offload to cloud, nearline, archived files."
---

# gcs-archive

Cold storage manager — archive large local files to GCS, restore on demand.

## Location

```
packages/gcs-archive/
```

## Running Commands

Always run from the package directory:

```bash
cd /Volumes/DriveHard/samelie-monorepo/packages/gcs-archive
uv run gcs-archive <command>
```

## Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `scan` | Find large files eligible for archival | `uv run gcs-archive scan -t 500 -n 30` |
| `archive` | Upload to GCS → create stub → delete local | `uv run gcs-archive archive /path/to/file` |
| `restore` | Pull file back from GCS | `uv run gcs-archive restore /path/to/file` |
| `status` | Show archived files and total space saved | `uv run gcs-archive status` |
| `verify` | Confirm archived files still exist in GCS | `uv run gcs-archive verify` |
| `plan` | Preview what the archive-policy would additively push (read-only) | `uv run gcs-archive plan` |
| `push` | Additively copy policy folders → archive bucket (keeps local, no stub/delete) | `uv run gcs-archive push` |

## Scan Options

- `-t, --threshold` — Minimum file size in MB (default: 100)
- `-n, --limit` — Max results to display (default: 50)
- `--root` — Directory to scan (default: configured source)
- `-e, --ext` — Filter by extension (comma-separated: `.mp4,.wav`)

## Archive Options

- `-f, --force` — Skip checksum verification
- `--dry-run` — Show what would happen without acting

## How It Works

1. **Archive flow**: verify file exists in GCS (or upload) → compute MD5 → create `.gcs-archived` pointer stub → delete original → record in SQLite manifest
2. **Restore flow**: look up in manifest → download from GCS → remove stub
3. **Stubs**: JSON pointer files (`filename.ext.gcs-archived`) left in place of archived files

## Archive Push Policy (non-destructive, repeatable)

`plan` / `push` are separate from offload (`archive`). They **additively copy** configured folders to the archive bucket and **keep local files** — no stub, no delete. Idempotent: re-run to send only new/changed files.

- Committed config: `packages/gcs-archive/archive-policy.yaml` (schema: `archive-policy.schema.json`, editor-validated via `# yaml-language-server` header).
- Each rule: `include` globs (relative to `source_root`), optional `exclude`, `min_size_mb`.
- Implementation uses `rclone copy` ONLY — never `sync`/`move`/`delete`. The backup bucket (`mac-mini-drivehard-backup`) is rejected as a destination in `policy.py`.
- `plan` = read-only preview; `push --dry-run` = same; `push` = perform copy; `push -r <rule>` = one rule.

```yaml
version: 1
bucket: mac-mini-drivehard-archive
source_root: /Volumes/DriveHard
rules:
  - name: pictures
    enabled: true
    include: ["Pictures/**"]
    exclude: ["**/.DS_Store", "**/._*", "**/*.gcs-archived"]
    min_size_mb: 0
```

## Configuration

All via environment variables (prefix `GCS_ARCHIVE_`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `GCS_ARCHIVE_SOURCE` | `/Volumes/DriveHard/` | Root path to scan |
| `GCS_ARCHIVE_BUCKET` | `mac-mini-drivehard-archive` | GCS bucket for archived files |
| `GCS_ARCHIVE_RCLONE_REMOTE` | `gcs-drivehard` | rclone remote name |
| `GCS_ARCHIVE_SIZE_THRESHOLD_MB` | `100` | Default scan threshold |
| `GCS_ARCHIVE_STUB_FORMAT` | `pointer` | Stub type: pointer, symlink, xattr |
| `GCS_ARCHIVE_MANIFEST_DB` | `~/.local/share/gcs-archive/manifest.db` | SQLite manifest path |

## 1Password Integration

For credentials stored in 1Password:
- `GCS_ARCHIVE_OP_RCLONE_CONF=op://Vault/Item/field` — rclone.conf from 1Password
- `GCS_ARCHIVE_OP_SA_KEY=op://Vault/Item/field` — GCS service account key

## Important Notes

- The archive bucket (`mac-mini-drivehard-archive`) is SEPARATE from the backup bucket (`mac-mini-drivehard-backup`). This prevents `rclone sync` from deleting archived files.
- Auth uses Application Default Credentials via gcloud login.
- rclone.conf at `~/.config/rclone/rclone.conf` with `gcs-drivehard` remote configured.
- Before archiving critical files, suggest running `verify` to confirm GCS connectivity.

## Workflow Guidance

When user asks about disk space or large files:
1. Run `scan` first to show what's consuming space
2. Categorize: re-downloadable (just delete), unique media (archive), system cache (redirect)
3. For re-downloadable content (Steam games, npm packages): delete outright
4. For unique content (recordings, images, project artifacts): archive to GCS
5. After archiving, show `status` to confirm savings
