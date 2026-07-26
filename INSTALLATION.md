# Install and run Quirq

Start Docker, then run:

```bash
curl -fsSL https://raw.githubusercontent.com/sharmasuraj0123/xo-cowork-api/main/install.sh | bash
```

Open <http://localhost:5003/space/>.

That is the complete installation. You do not need Git, Python, a repository
clone, or a project checkout. The command:

1. downloads the published Quirq container image;
2. starts it in the background on `localhost:5003`;
3. mounts persistent projects and machine state from your home directory;
4. asks the image which agent-native state directories it supports and mounts
   only those directories, rather than your entire home directory;
5. waits until the API is healthy; and
6. prints the URL.

Run the same command again to update Quirq.

## Local data

| Host path | Container path | Purpose |
|---|---|---|
| `~/xo-projects` | `/workspace/xo-projects` | XO projects and their `.xo` project metadata |
| `~/.quirq` | `/root/.quirq` | Runtime configuration, saved credentials, watcher activity, cursors, locks, and other machine-local state |
| Agent-native directories discovered from the image manifests | Their matching paths below `/root` | Existing native configuration and session records used by the Setup tab and watcher |

Open the **Setup** tab after installation. It shows the exact host and
container paths, whether each runtime is mounted, CLI readiness, native session
file counts, the active chat backend, watcher source mode and tick interval.
It also lets you configure a different XO projects root and `.quirq` state
root. Root changes are saved privately, then applied by running the same
installer command again because Docker bind mounts cannot change in place.
Changes that are read at startup are explicitly marked pending; the tab can
restart an installer-managed container and reconnect automatically.

For a custom projects directory, keep it to one command:

```bash
curl -fsSL https://raw.githubusercontent.com/sharmasuraj0123/xo-cowork-api/main/install.sh | XO_PROJECTS_ROOT=/absolute/path bash
```

To set both roots on first install:

```bash
curl -fsSL https://raw.githubusercontent.com/sharmasuraj0123/xo-cowork-api/main/install.sh | XO_PROJECTS_ROOT=/absolute/projects QUIRQ_STATE_ROOT=/absolute/state bash
```

Updates automatically preserve the directories mounted by the previous Quirq
container. When Setup points `.quirq` at an empty directory, the installer
copies the existing machine state into it. It never copies or moves project
files, merges a non-empty state directory, or puts watcher state inside a
project.

To stop Quirq:

```bash
docker stop quirq
```
