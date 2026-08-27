"""The previewer's History pane: /file-history backend + floating window UI.

Backend tests drive services.cowork_agent.file_history against real git
repositories under a throwaway XO_PROJECTS_ROOT — the parsing is only worth
trusting against actual ``git log --follow --numstat`` output. UI tests pin
the source the same way test_space_wiki.py does: the previewer is a floating
window, and its header action is History, not Graph.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

GIT_ENV = {
    **os.environ,
    "GIT_AUTHOR_NAME": "Test Author",
    "GIT_AUTHOR_EMAIL": "test@example.com",
    "GIT_COMMITTER_NAME": "Test Author",
    "GIT_COMMITTER_EMAIL": "test@example.com",
}


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args], cwd=cwd, env=GIT_ENV, check=True, capture_output=True
    )


@unittest.skipIf(shutil.which("git") is None, "git is not installed")
class FileGitHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self._old_root = os.environ.get("XO_PROJECTS_ROOT")
        os.environ["XO_PROJECTS_ROOT"] = str(self.root)

    def tearDown(self) -> None:
        if self._old_root is None:
            os.environ.pop("XO_PROJECTS_ROOT", None)
        else:
            os.environ["XO_PROJECTS_ROOT"] = self._old_root
        self._tmp.cleanup()

    def make_project(self, name: str, *, repo: bool) -> Path:
        project = self.root / name
        project.mkdir()
        if repo:
            git(project, "init", "-q")
        return project

    def test_commits_come_back_newest_first_with_counts(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        project = self.make_project("demo", repo=True)
        target = project / "notes.md"
        target.write_text("one\n", encoding="utf-8")
        git(project, "add", "notes.md")
        git(project, "commit", "-q", "-m", "first: add notes")
        target.write_text("one\ntwo\nthree\n", encoding="utf-8")
        git(project, "commit", "-q", "-am", "second: grow notes")

        out = file_git_history("demo", "notes.md")
        self.assertIsNotNone(out)
        self.assertTrue(out["is_repo"])
        self.assertEqual(
            [c["subject"] for c in out["items"]],
            ["second: grow notes", "first: add notes"],
        )
        newest = out["items"][0]
        self.assertEqual(newest["author"], "Test Author")
        self.assertEqual(newest["additions"], 2)
        self.assertEqual(newest["deletions"], 0)
        self.assertEqual(newest["short_hash"], newest["hash"][:9])
        self.assertTrue(newest["date"])  # ISO author date

    def test_follow_survives_a_rename(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        project = self.make_project("demo", repo=True)
        (project / "old.md").write_text("body\n", encoding="utf-8")
        git(project, "add", "old.md")
        git(project, "commit", "-q", "-m", "add old")
        git(project, "mv", "old.md", "new.md")
        git(project, "commit", "-q", "-m", "rename to new")

        out = file_git_history("demo", "new.md")
        self.assertEqual(
            [c["subject"] for c in out["items"]],
            ["rename to new", "add old"],
        )

    def test_projects_without_a_repo_report_is_repo_false(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        project = self.make_project("plain", repo=False)
        (project / "readme.md").write_text("hello\n", encoding="utf-8")

        out = file_git_history("plain", "readme.md")
        self.assertIsNotNone(out)
        self.assertFalse(out["is_repo"])
        self.assertEqual(out["items"], [])

    def test_a_repo_enclosing_the_project_root_does_not_leak(self) -> None:
        # The projects root itself is a repo, the project is not: rev-parse
        # walks up and finds the outer repo, whose history was never part of
        # the project's address space. That must read as "no repository".
        from services.cowork_agent.file_history import file_git_history

        git(self.root, "init", "-q")
        project = self.make_project("inner", repo=False)
        (project / "file.md").write_text("x\n", encoding="utf-8")

        out = file_git_history("inner", "file.md")
        self.assertFalse(out["is_repo"])
        self.assertEqual(out["items"], [])

    def test_untracked_file_in_a_repo_has_no_commits(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        project = self.make_project("demo", repo=True)
        (project / "loose.md").write_text("x\n", encoding="utf-8")

        out = file_git_history("demo", "loose.md")
        self.assertTrue(out["is_repo"])
        self.assertEqual(out["items"], [])

    def test_missing_file_is_none_and_traversal_raises(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        self.make_project("demo", repo=True)
        self.assertIsNone(file_git_history("demo", "absent.md"))
        with self.assertRaises(ValueError):
            file_git_history("demo", "../demo/notes.md")

    def test_limit_caps_the_log(self) -> None:
        from services.cowork_agent.file_history import file_git_history

        project = self.make_project("demo", repo=True)
        target = project / "notes.md"
        for i in range(4):
            target.write_text(f"rev {i}\n", encoding="utf-8")
            git(project, "add", "notes.md")
            git(project, "commit", "-q", "-m", f"rev {i}")

        out = file_git_history("demo", "notes.md", limit=2)
        self.assertEqual(len(out["items"]), 2)
        self.assertEqual(out["items"][0]["subject"], "rev 3")


class FileHistoryRouteTests(unittest.TestCase):
    def test_route_is_registered_with_the_response_model(self) -> None:
        from routers.cowork_agent.bff.xo_projects import (
            FileHistoryResponse,
            router,
        )

        routes = {r.path: r for r in router.routes}
        self.assertIn("/api/xo-projects/{project_id}/file-history", routes)
        route = routes["/api/xo-projects/{project_id}/file-history"]
        self.assertIs(route.response_model, FileHistoryResponse)


class PreviewWindowUITests(unittest.TestCase):
    def test_previewer_floats_instead_of_docking(self) -> None:
        css = (ROOT / "space_ui" / "css" / "preview.css").read_text(encoding="utf-8")
        js = (ROOT / "space_ui" / "js" / "core" / "preview.js").read_text(encoding="utf-8")
        # A floating window has its own frame and can be moved and resized;
        # the drawer's edge-slide is gone.
        self.assertIn("resize:both", css)
        self.assertIn("box-shadow", css)
        self.assertNotIn("translateX(102%)", css)
        self.assertIn("setPointerCapture", js)
        self.assertIn("is-dragging", css)

    def test_history_replaces_graph_in_the_header(self) -> None:
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "space_ui" / "js" / "core" / "preview.js").read_text(encoding="utf-8")
        self.assertIn('id="preview-history"', index)
        self.assertNotIn('id="preview-graph"', index)
        self.assertIn("/file-history?relative_path=", js)
        self.assertNotIn("space:focus-project", js)

    def test_cache_stamps_were_bumped_for_this_change(self) -> None:
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("css/preview.css?v=20260816-preview1", index)
        self.assertNotIn("core/preview.js?v=20260825-rename1", app)


if __name__ == "__main__":
    unittest.main()
