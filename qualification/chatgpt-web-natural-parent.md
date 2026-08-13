This is the final natural ChatGPT-Web recursive-topology qualification. Work read-only in the
current repository. Do not modify files or start, stop, restart, or directly inspect runtime or
browser processes.

In one assistant tool-call message, call Goose's `delegate` tool twice with these exact arguments:

1. `delegate(source: "chatgpt-web-concurrency-child-a", async: true)`
2. `delegate(source: "chatgpt-web-concurrency-child-b", async: true)`

Do not include provider, model, instructions, extensions, or working_dir; the named recipes fix the
child provider/model/workload and omission of extensions preserves inherited normal tools. Verify
that both returned tool results say the tasks started in the background and contain distinct task
session IDs. If either call omits `async: true`, blocks synchronously, fails, or does not return a
task ID, stop and report the run INVALID without launching or retrying anything else.

While both background tasks remain active, perform independent parent work using at least three
separate Goose Native shell calls:

1. Run `pwd`, `git status --short`, and `git branch --show-current`.
2. Read `docs/architecture.md`, `docs/runtime-lifecycle.md`, and
   `docs/chatgpt-web-concurrency-qualification.md`.
3. Read the liveness monitor in `src/qualification/chatgpt-web-qualification.ts` and report five
   concise parent findings about evidence boundaries and three-way overlap.

Only after the independent parent work is complete, call `load(source: "<child-a-task-id>")` and
`load(source: "<child-b-task-id>")` to collect both results. Confirm that the returned results end
with `child-a-ok` and `child-b-ok` respectively.

End the parent response with exactly:

natural-parent-ok
