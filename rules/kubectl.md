# kubectl Rules

Rules for all kubectl usage by team agents.

## Cluster mutation goes through Pulumi

- Desired cluster state lives in the Pulumi program under `kubernetes/` (see `k8s` skill). Never `kubectl apply`, `create`, `delete`, `edit`, `patch`, `replace`, `scale`, `cordon`, `drain`, `taint`, `label`, `annotate`, `set`, `autoscale`, `rollout restart`, `rollout undo`, or `cp` a file into a pod.
- If a project needs a change and has no Pulumi stack yet, that's a signal to create one — not a reason to reach for kubectl directly.
- A kubectl mutation that isn't mirrored in the Pulumi program is drift: the next `pulumi up` either fights it or silently reverts it, and the next engineer has no record of why the cluster looks the way it does.
- Deploys and secret syncs run through the `/pulumi-deploy` and `/sync-secrets` skills — never freehand `pulumi up` or `kubectl apply`.
- Found a live object that doesn't match the Pulumi program? Fix the program and redeploy. Don't hand-patch the object to make things look fine.

## Permitted direct kubectl uses

Read-only / non-mutating, for verifying Pulumi's work or diagnosing a running cluster:

- `get`, `describe`, `logs`, `top`, `events` — inspect state, resource usage, recent history
- `rollout status` — confirm a deploy converged (not `rollout restart`/`rollout undo` — those mutate)
- `port-forward` — local tunnel for manual verification; doesn't touch cluster state
- `exec` — read-only introspection inside a pod (check an env var, confirm a file exists, curl a local port). Don't use it to install packages or hand-edit config in a running container — that state isn't in Pulumi and dies with the pod anyway
- `cp` FROM a pod (pulling a file out to inspect) is fine; `cp` INTO a pod is a mutation, treat it like `apply`
- `config current-context`, `config get-contexts`, `auth can-i`, `explain`, `api-resources` — figure out where you're pointed and what's allowed before running anything else

## Verification workflow

- After `pulumi up`, verify with `kubectl get` / `describe` / `rollout status` / `logs` against the resources the stack just created.
- A verification step that finds a problem reports it and fixes the Pulumi program — it does not reach for a mutating kubectl command to paper over the gap.
