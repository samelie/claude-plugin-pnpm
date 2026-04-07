# K8s Jobs Migration

Migrate subprocess-based Python execution (pleading-format in paradocx backend) to K8s Jobs using `@adddog/k8s`.

> **T1–T3 complete.** `@adddog/k8s` simplified to single `createK8s()` entry point, lint+types clean. See git history for details.

## Prerequisites

```
claude config set --global experiments.agentTeams true
```

## How to Execute

```
Read `${CLAUDE_PLUGIN_ROOT}/team-templates/k8s-jobs-migration.md`.
Create a team named "k8s-jobs-migration" using TeamCreate.
Spawn agents per template. You are lead — orchestrate and gate phases only. Do NOT implement.
```

## Architecture Overview

```
Frontend → tRPC jobs.create → DB (PENDING)
                                    ↓
Runner polls → format handler → uploads doc+template to GCS
                                    ↓
                              k8s.runJob() → K8s Job pod (mpa-cli image)
                                    ↓
                              pod: GCS download → pleading-format → GCS upload
                                    ↓
                              handler observes succeeded → downloads result from GCS → saves to job_results
```

## Team Structure

| Agent | subagent_type | model | Task |
|-------|---------------|-------|------|
| `lead` | general-purpose | `opus` | orchestrate, gate phases |
| `backend-wiring` | general-purpose | `opus` | T4a: deps, env, types, server plugin, runner |
| `format-handler` | general-purpose | `opus` | T4b: format.ts implementation |
| `mpa-cli` | general-purpose | `opus` | T4c: Dockerfile GCS wrapper |
| `pulumi-infra` | general-purpose | `opus` | T4d: GCS bucket, RBAC, SA, env injection |
| `lint-agent` | pnpm-lint | `sonnet` | T5a: lint |
| `types-agent` | pnpm-types | `sonnet` | T5b: types |

## Orchestration Flow

```
Phase 1  [backend-wiring]   ──── T4a: deps, env, types, server, runner  ─┐
         [format-handler]   ──── T4b: format handler implementation      ─┤ parallel
         [mpa-cli]       ──── T4c: Dockerfile GCS wrapper             ─┤
         [pulumi-infra]     ──── T4d: GCS bucket, RBAC, SA, Pulumi       ─┘
                                      │
Phase 2  [lint-agent]        ──── T5a: lint:fix @paradocx/backend + @paradocx/pulumi  ─┐ parallel
         [types-agent]       ──── T5b: typecheck @paradocx/backend + @paradocx/pulumi  ─┘
```

## Dependency Graph

```
T4a (backend wiring)  ─┐
T4b (format handler)  ─┤ parallel — no deps between them
T4c (mpa-cli GCS)  ─┤
T4d (pulumi infra)    ─┘
                        │
T5  (lint+types)      ─── blocked on all T4*
```

---

## Tasks

### T4a: Backend Wiring (deps, env, types, server, runner)

**Phase:** 1
**Agent:** backend-wiring
**blockedBy:** none

Wire up `@adddog/k8s` and `@google-cloud/storage` into the paradocx backend. Add env vars, update types, register fastify plugin, thread K8s through runner.

#### Reference files to read first

- `packages/k8s/src/k8s.ts` — `createK8s()` factory, `K8s` type
- `packages/k8s/src/fastify/index.ts` — fastify-k8s plugin (decorates `fastify.k8s`)
- `paradocx/apps/backend/package.json` — current deps
- `paradocx/apps/backend/src/env.ts` — env schema
- `paradocx/apps/backend/src/jobs/types.ts` — JobHandler interface
- `paradocx/apps/backend/src/server.ts` — fastify setup + plugin registration
- `paradocx/apps/backend/src/jobs/runner.ts` — job runner loop

#### Files to modify

##### 1. `paradocx/apps/backend/package.json` — add dependencies

```json
"@adddog/k8s": "workspace:*",
"@google-cloud/storage": "^7.19.0",
"rxjs": "^7.8.2"
```

##### 2. `paradocx/apps/backend/src/env.ts` — add to envSchema

```ts
GCS_BUCKET: z.string(),
MPA_CLI_IMAGE: z.string().default("us-central1-docker.pkg.dev/samrad-1337/paradocx/mpa-cli:latest"),
JOB_NAMESPACE: z.string().default("paradocx"),
JOB_TIMEOUT_SECONDS: z.coerce.number().default(120),
```

##### 3. `paradocx/apps/backend/src/jobs/types.ts` — add k8s to handler signature

```ts
import type { K8s } from "@adddog/k8s";
// add as 5th param to execute:
k8s: K8s,
```

##### 4. `paradocx/apps/backend/src/server.ts` — register fastify-k8s plugin

```ts
import k8sPlugin from "@adddog/k8s/fastify";
// after dbPlugin registration:
await app.register(k8sPlugin);
// pass to runner:
startJobRunner(app.db, app.log, app.k8s);
```

Remove any manual `k8s: K8s` from FastifyInstance declare — the plugin already declares it.

##### 5. `paradocx/apps/backend/src/jobs/runner.ts` — thread k8s through

```ts
import type { K8s } from "@adddog/k8s";
// tick(db, log, k8s) + handler.execute(..., k8s)
// startJobRunner(db, log, k8s) + setInterval tick(db, log, k8s)
```

#### Important details

- Read existing code before modifying — match patterns already in use
- Don't add `@adddog/k8s` to `devDependencies` — it's a runtime dep
- The fastify-k8s plugin auto-detects in-cluster vs local — no config needed
- `pnpm -F "<pkg>"` for all commands

#### Verify

```bash
pnpm -F "@paradocx/backend" build
```

---

### T4b: Format Handler Implementation

**Phase:** 1
**Agent:** format-handler
**blockedBy:** none

Implement the format job handler that uploads docs to GCS, launches a K8s Job via `@adddog/k8s`, observes lifecycle, downloads result.

#### Reference files to read first

- `packages/k8s/src/k8s.ts` — K8s type, runJob signature
- `packages/k8s/src/job-runner/types.ts` — RunJobOptions, JobEvent, JobStatus
- `packages/k8s/src/job-runner/run-job.ts` — Observable behavior (never errors, always completes)
- `paradocx/apps/backend/src/env.ts` — env vars (after T4a adds them)
- `paradocx/apps/backend/src/jobs/types.ts` — JobHandler interface (after T4a updates it)

#### File to create/modify

`paradocx/apps/backend/src/jobs/handlers/format.ts`

#### Implementation

```ts
import { Storage } from "@google-cloud/storage";
import { lastValueFrom, toArray } from "rxjs";
import type { K8s, JobStatusEvent } from "@adddog/k8s";
import { env } from "../../env.js";

const storage = new Storage();
const bucket = () => storage.bucket(env.GCS_BUCKET);

export const formatHandler: JobHandler = {
    async execute(job, reportProgress, db, log, k8s) {
        // 1. Validate
        if (!job.documentId) throw new Error("format job requires documentId");

        // 2. Fetch doc + optional template from DB
        const doc = await db.selectFrom("documents")...
        const prefix = `jobs/${job.id}`;

        // 3. Upload to GCS
        await bucket().file(`${prefix}/input.docx`).save(doc.fileData as Buffer);
        if (job.templateId) {
            const tmpl = await db.selectFrom("templates")...
            await bucket().file(`${prefix}/template.docx`).save(tmpl.fileData as Buffer);
        }
        await reportProgress(10);

        // 4. Run K8s Job
        const { events$ } = k8s.runJob({
            namespace: env.JOB_NAMESPACE,
            image: env.MPA_CLI_IMAGE,
            command: ["sh", "/opt/run-job.sh"],
            env: { GCS_BUCKET: env.GCS_BUCKET, JOB_ID: job.id },
            activeDeadlineSeconds: env.JOB_TIMEOUT_SECONDS,
            backoffLimit: 0,
            autoCleanup: true,
            labels: { "paradocx/job-id": job.id },
        });

        // 5. Observe events — collect all, check final status
        const events = await lastValueFrom(
            events$.pipe(toArray()),
        );

        const lastStatus = events
            .filter((e): e is JobStatusEvent => e.type === "status")
            .at(-1);

        if (!lastStatus || lastStatus.status === "failed") {
            const logs = events
                .filter(e => e.type === "log")
                .map(e => e.line)
                .join("\n");
            throw new Error(`format job failed: ${logs.slice(-500)}`);
        }

        await reportProgress(80);

        // 6. Download result from GCS
        const [outputData] = await bucket().file(`${prefix}/output.docx`).download();
        await reportProgress(100);

        // 7. Cleanup GCS
        const [files] = await bucket().getFiles({ prefix });
        await Promise.all(files.map(f => f.delete()));

        return {
            filename: `formatted_${doc.filename}`,
            size: outputData.byteLength,
            data: outputData.toString("base64"),
        };
    },
};
```

#### Key points

- `lastValueFrom(events$.pipe(toArray()))` — collects all events since Observable always completes, never errors
- Check final `JobStatusEvent.status` for failed — don't rely on Observable error
- Progress: coarse numerical (0→10→80→100)
- GCS cleanup after download
- Read the actual DB schema + JobHandler interface before writing — the `db.selectFrom(...)` calls above are sketches, adapt to real schema

#### Verify

```bash
pnpm -F "@paradocx/backend" build
```

---

### T4c: Python CLI Dockerfile — GCS Wrapper

**Phase:** 1
**Agent:** mpa-cli
**blockedBy:** none

Add GCS download/upload wrapper to the mpa-cli Docker image so K8s Jobs can fetch input from GCS, run `pleading-format`, and upload output back to GCS.

#### Reference files to read first

- `paradocx/dockerfiles/mpa-cli.Dockerfile` — current Dockerfile
- `paradocx/mpa-cli/` — the Python CLI source (installed via pip)

#### Files to modify/create

##### 1. `paradocx/dockerfiles/mpa-cli.Dockerfile` — add `google-cloud-storage` pip dep + wrapper script

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends pandoc \
    && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY mpa-cli /tmp/mpa-cli
RUN pip install --no-cache-dir /tmp/mpa-cli google-cloud-storage && rm -rf /tmp/mpa-cli
COPY dockerfiles/run-job.sh /opt/run-job.sh
WORKDIR /data
ENTRYPOINT ["pleading-format"]
```

##### 2. `paradocx/dockerfiles/run-job.sh` — new file

```sh
#!/bin/sh
set -e
python -c "
from google.cloud.storage import Client
c = Client()
b = c.bucket('$GCS_BUCKET')
b.blob('jobs/$JOB_ID/input.docx').download_to_filename('/data/input.docx')
t = b.blob('jobs/$JOB_ID/template.docx')
if t.exists():
    t.download_to_filename('/data/template.docx')
"
ARGS="/data/input.docx -o /data/output.docx --validate"
[ -f /data/template.docx ] && ARGS="$ARGS -t /data/template.docx"
pleading-format $ARGS
python -c "
from google.cloud.storage import Client
c = Client()
b = c.bucket('$GCS_BUCKET')
b.blob('jobs/$JOB_ID/output.docx').upload_from_filename('/data/output.docx')
"
```

#### Key points

- Default ENTRYPOINT stays `pleading-format` for standalone use
- K8s Job overrides with `command: ["sh", "/opt/run-job.sh"]`
- `$GCS_BUCKET` and `$JOB_ID` are env vars injected by K8s Job spec (from format handler)
- Workload Identity provides GCS auth automatically — no credentials file needed
- Read the existing Dockerfile first and adapt — the above is a sketch

#### Verify

```bash
docker buildx build -f paradocx/dockerfiles/mpa-cli.Dockerfile paradocx/ --no-cache
```

---

### T4d: Pulumi Infrastructure (GCS Bucket + RBAC + SA)

**Phase:** 1
**Agent:** pulumi-infra
**blockedBy:** none

Add GCS bucket (1-day TTL), Kubernetes ServiceAccount with Workload Identity, and RBAC (Role/RoleBinding) for the paradocx backend to create/watch/delete K8s Jobs. Wire env vars into backend Deployment.

#### Reference files to read first

- `paradocx/pulumi/src/index.ts` — current Pulumi stack
- `paradocx/pulumi/Pulumi.dev.yaml` — config values
- `paradocx/pulumi/package.json` — deps (verify `@pulumi/gcp` exists)
- `kubernetes/lib-pkg/src/factories/applications/createNZBApp.ts` — NZB pattern for GCS + Workload Identity
- `kubernetes/setup-workload-identity.mts` — existing Workload Identity SA: `workload-identity-sa@samrad-1337.iam.gserviceaccount.com`

#### File to modify

`paradocx/pulumi/src/index.ts`

#### Add to ParadocxApp constructor

##### 1. ServiceAccount for backend pod

```ts
const backendSA = new k8s.core.v1.ServiceAccount("paradocx-backend-sa", {
    metadata: {
        name: "paradocx-backend",
        namespace: ns,
        annotations: {
            "iam.gke.io/gcp-service-account": "workload-identity-sa@samrad-1337.iam.gserviceaccount.com",
        },
    },
}, { provider, parent: this });
```

##### 2. RBAC Role — create/watch/delete Jobs + get pods/logs

```ts
const jobRunnerRole = new k8s.rbac.v1.Role("paradocx-job-runner-role", {
    metadata: { name: "paradocx-job-runner", namespace: ns },
    rules: [
        { apiGroups: ["batch"], resources: ["jobs"], verbs: ["create", "get", "list", "watch", "delete"] },
        { apiGroups: [""], resources: ["pods"], verbs: ["get", "list", "watch"] },
        { apiGroups: [""], resources: ["pods/log"], verbs: ["get"] },
    ],
}, { provider, parent: this });
```

##### 3. RoleBinding

```ts
new k8s.rbac.v1.RoleBinding("paradocx-job-runner-binding", {
    metadata: { name: "paradocx-job-runner", namespace: ns },
    roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: "paradocx-job-runner" },
    subjects: [{ kind: "ServiceAccount", name: "paradocx-backend", namespace: ns }],
}, { provider, parent: this });
```

##### 4. GCS Bucket — 1-day TTL safety net

```ts
import * as gcp from "@pulumi/gcp";
const jobsBucket = new gcp.storage.Bucket("paradocx-jobs-bucket", {
    name: "paradocx-jobs",
    location: "US-CENTRAL1",
    uniformBucketLevelAccess: true,
    forceDestroy: true,
    lifecycleRules: [{ action: { type: "Delete" }, condition: { age: 1 } }],
});
```

##### 5. IAM note

Workload Identity SA (`workload-identity-sa@samrad-1337.iam.gserviceaccount.com`) already has `roles/storage.admin` from `setup-workload-identity.mts`. No additional IAM binding needed.

##### 6. Backend Deployment — add serviceAccountName + env

```ts
spec.template.spec.serviceAccountName = "paradocx-backend";
// add env vars:
{ name: "GCS_BUCKET", value: "paradocx-jobs" },
{ name: "JOB_NAMESPACE", value: ns },
{ name: "MPA_CLI_IMAGE", value: mpaCliImage },
```

##### 7. Pulumi config — add mpaCliImage

```ts
const mpaCliImage = config.get("mpaCliImage") || "us-central1-docker.pkg.dev/samrad-1337/paradocx/mpa-cli:latest";
```

##### 8. `paradocx/pulumi/Pulumi.dev.yaml` — add config entry

```yaml
paradocx:mpaCliImage: us-central1-docker.pkg.dev/samrad-1337/paradocx/mpa-cli:latest
```

#### Key points

- Read existing `index.ts` first — match patterns already in use (provider, parent, namespace handling)
- Workload Identity SA already exists — just annotate the K8s ServiceAccount
- GCS lifecycle rule = 1 day — safety net for cleanup failures
- Local dev: manually create `GCS_BUCKET` in `.config/.env`

#### Verify

```bash
pnpm -F "@paradocx/pulumi" build
pnpm -F "@paradocx/pulumi" types
```

---

### T5: Lint + Types

**Phase:** 2
**Agent:** lint-agent + types-agent
**blockedBy:** T4a, T4b, T4c, T4d

After all T4 agents complete, run lint and type checks across affected packages.

#### lint-agent (T5a)

```bash
pnpm -F "@paradocx/backend" lint:fix
pnpm -F "@paradocx/pulumi" lint:fix
```

#### types-agent (T5b)

```bash
pnpm -F "@paradocx/backend" types
pnpm -F "@paradocx/pulumi" types
```

Fix all errors. Iterate until clean.

---

## Critical Rules

1. `pnpm -F "<pkg>"` for all commands
2. Don't modify tsconfig (auto-generated)
3. No `console.log` in library code
4. Core export (`"."`) must work without fastify installed (peer dep is optional)
5. Fastify plugin decorates `fastify.k8s` as `K8s` instance (not raw `K8sClient`)
6. **No park-app changes** — packages stay independent
7. Check `@kubernetes/client-node` v1.x method signatures before writing any new client code
8. Branch prefix: `sam/`
9. Internal modules stay as files but are NOT re-exported from index.ts
10. `loadFromDefault()` handles both in-cluster and local — don't add manual detection logic
11. Read existing code before modifying — match patterns already in use
12. Code snippets in tasks are sketches — adapt to real types/signatures

## Key Reuse

- `@adddog/k8s` — `createK8s()`, `runJob()`, fastify plugin (T1 complete)
- `@google-cloud/storage` — same pattern as park-app
- Workload Identity SA — already has `roles/storage.admin`
- `@pulumi/gcp` — already a dep of `@paradocx/pulumi`

## Verification

After all tasks complete, lead runs:

```bash
# Backend
pnpm -F "@paradocx/backend" build
pnpm -F "@paradocx/backend" types
pnpm -F "@paradocx/backend" lint

# Pulumi
pnpm -F "@paradocx/pulumi" build
pnpm -F "@paradocx/pulumi" types

# Docker
docker buildx build -f paradocx/dockerfiles/mpa-cli.Dockerfile paradocx/

# Pulumi preview
pnpm -F "@paradocx/pulumi" pulumi:preview
```

All commands exit 0. Pulumi preview shows new resources: SA, Role, RoleBinding, Bucket.
