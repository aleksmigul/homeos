# Repository workflow

- Unless the user instructs otherwise, finish requested code changes by committing the verified source and pushing it to GitHub. Do not wait for a separate request to commit or push.
- Keep commits coherent and run checks appropriate to the changes. The current branch and upstream are `main` and `origin/main` in `aleksmigul/homeos`.
- At a minimum, every deployment must use committed and pushed source. Before activation, commit all intended release changes, push them, and verify that the release commit is on GitHub. If committing or pushing fails, stop the deployment and report the blocker. Deployment authorization remains separate from permission to commit and push.
- Verify that the push succeeded. If a commit or push is blocked, report the reason and the local commit IDs rather than treating the task as finished.
- Keep secrets, local environment files, runtime data, uploads, compiler caches, and release/build artifacts out of Git. The `data/` and `.release/` directories are local only.
