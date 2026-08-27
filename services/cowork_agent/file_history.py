"""Git history of one file inside a project, for the previewer.

The previewer's History pane answers "who edited this file, and when" —
a question only the project's own git repository can. This helper shells
out to ``git log --follow`` and shapes the output; it never writes to
the repository.

Path validation is delegated to ``project_layout.read_project_file``
(called with ``max_bytes=0``), so the address space stays exactly the
one every other project endpoint enforces: project id plus a
project-relative path, resolved inside the project root. On top of
that, the *repository* the history is read from must itself live inside
the project: a project folder that is not a repo, sitting inside some
larger checkout, must not leak the outer repository's history into the
UI — that history was never part of the project's address space.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from services.cowork_agent.project_layout import project_dir, read_project_file

GIT_TIMEOUT_SECONDS = 10
# Fields split by unit separators, records by a record separator: none of
# the four can appear in a hash, a name, an ISO date, or a one-line subject
# the way a subject could contain any printable delimiter.
_LOG_FORMAT = "%x1e%H%x1f%an%x1f%aI%x1f%s"


def _git(args: list[str], cwd: Path) -> subprocess.CompletedProcess | None:
    """Run git, or return ``None`` when git itself is unavailable."""
    try:
        return subprocess.run(
            ["git", *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


def _repo_toplevel(file_dir: Path, project_root: Path) -> Path | None:
    """The repo root owning ``file_dir``, iff it is inside the project."""
    proc = _git(["rev-parse", "--show-toplevel"], cwd=file_dir)
    if proc is None or proc.returncode != 0:
        return None
    toplevel = Path(proc.stdout.strip())
    try:
        toplevel.resolve().relative_to(project_root)
    except ValueError:
        return None
    return toplevel


def _parse_stat(value: str) -> int | None:
    """A numstat count: an int, or ``None`` for binary's ``-``."""
    try:
        return int(value)
    except ValueError:
        return None


def _parse_log(stdout: str) -> list[dict]:
    """Split ``--format=_LOG_FORMAT --numstat`` output into commit dicts.

    Each \\x1e record is a header line (hash, author, ISO date, subject)
    followed by numstat lines; ``--follow`` limits the log to one path,
    so the first numstat line is the file's own +/- for that commit. A
    commit that only renames the file has no numstat counts — its entry
    keeps ``None`` there, which the UI reads as "nothing to show".
    """
    items: list[dict] = []
    for record in stdout.split("\x1e"):
        record = record.strip("\n")
        if not record:
            continue
        head, _, stats = record.partition("\n")
        fields = head.split("\x1f")
        if len(fields) != 4:
            continue
        commit_hash, author, date, subject = fields
        additions = deletions = None
        for line in stats.splitlines():
            parts = line.split("\t")
            if len(parts) >= 3:
                additions = _parse_stat(parts[0])
                deletions = _parse_stat(parts[1])
                break
        items.append(
            {
                "hash": commit_hash,
                "short_hash": commit_hash[:9],
                "author": author,
                "date": date,
                "subject": subject,
                "additions": additions,
                "deletions": deletions,
            }
        )
    return items


def file_git_history(name: str, relative_path: str, *, limit: int = 50) -> dict | None:
    """Commits that touched one project file, newest first.

    Returns ``None`` when the project or the file does not exist, and
    raises ``ValueError`` for an unsafe ``relative_path`` — the same
    contract as :func:`project_layout.read_project_file`, which performs
    the validation. A project with no git repository (or with git
    missing from the host) reports ``is_repo: False`` rather than
    erroring: for the previewer that is a state, not a failure.
    """
    meta = read_project_file(name, relative_path, max_bytes=0)
    if meta is None:
        return None
    project_id = meta["project_id"]
    rel = meta["relative_path"]
    root = project_dir(project_id).resolve()
    target = root / rel

    result = {
        "project_id": project_id,
        "relative_path": rel,
        "is_repo": False,
        "items": [],
    }
    toplevel = _repo_toplevel(target.parent, root)
    if toplevel is None:
        return result
    result["is_repo"] = True

    in_repo = target.resolve().relative_to(toplevel.resolve()).as_posix()
    proc = _git(
        [
            "log",
            "--follow",
            "--numstat",
            "-n",
            str(limit),
            f"--format={_LOG_FORMAT}",
            "--",
            in_repo,
        ],
        cwd=toplevel,
    )
    # An empty repo (no HEAD yet) makes git log fail; an untracked file
    # makes it succeed with no output. Both are honestly "no commits".
    if proc is not None and proc.returncode == 0:
        result["items"] = _parse_log(proc.stdout)
    return result
