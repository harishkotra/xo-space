from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from services.cowork_agent import git_snapshot


ROOT = Path(__file__).resolve().parents[1]


def _git(pdir: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(pdir), "-c", "user.email=t@t", "-c", "user.name=t",
         *args],
        check=True, capture_output=True,
    )


class GitSnapshotServiceTests(unittest.TestCase):
    """The service against a real throwaway repository."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.repo = Path(cls._tmp.name) / "proj"
        cls.repo.mkdir()
        r = cls.repo
        _git(r, "init", "-q")
        (r / "a.py").write_text("one\n")
        (r / "docs").mkdir()
        (r / "docs" / "guide.md").write_text("# guide\n")
        _git(r, "add", "-A")
        _git(r, "commit", "-q", "-m", "first")
        (r / "a.py").write_text("one\ntwo\n")
        (r / "b.txt").write_text("new file\n")
        (r / "docs" / "guide.md").unlink()
        _git(r, "add", "-A")
        _git(r, "commit", "-q", "-m", "second: modify a, add b, drop guide")

    @classmethod
    def tearDownClass(cls) -> None:
        cls._tmp.cleanup()

    def _shas(self) -> list[dict]:
        commits = git_snapshot.list_commits(self.repo)
        self.assertEqual(len(commits), 2)
        return commits

    def test_list_commits_newest_first_with_counts(self) -> None:
        newest, oldest = self._shas()
        self.assertEqual(newest["subject"], "second: modify a, add b, drop guide")
        self.assertEqual(oldest["subject"], "first")
        self.assertEqual(newest["files_changed"], 3)
        self.assertEqual(oldest["files_changed"], 2)
        self.assertTrue(newest["date"])  # iso-strict

    def test_snapshot_tree_and_touched(self) -> None:
        newest, oldest = self._shas()

        snap = git_snapshot.commit_snapshot(self.repo, newest["sha"])
        self.assertEqual(
            sorted(e["path"] for e in snap["tree"]), ["a.py", "b.txt"]
        )
        self.assertEqual(snap["touched"], {"a.py": "M", "b.txt": "A"})
        self.assertEqual(snap["deleted"], ["docs/guide.md"])
        self.assertFalse(snap["truncated"])
        self.assertEqual(snap["total_files"], 2)
        # sizes come from ls-tree, so they match the committed blobs
        by = {e["path"]: e["size"] for e in snap["tree"]}
        self.assertEqual(by["a.py"], len("one\ntwo\n"))

        # the FIRST commit still works: --root diffs against the empty tree
        first = git_snapshot.commit_snapshot(self.repo, oldest["sha"])
        self.assertEqual(
            sorted(first["touched"]), ["a.py", "docs/guide.md"]
        )
        self.assertEqual(set(first["touched"].values()), {"A"})
        self.assertEqual(
            sorted(e["path"] for e in first["tree"]), ["a.py", "docs/guide.md"]
        )

    def test_file_at_commit_is_commit_pinned(self) -> None:
        newest, oldest = self._shas()
        old = git_snapshot.file_at_commit(
            self.repo, oldest["sha"], "a.py", max_bytes=1024
        )
        new = git_snapshot.file_at_commit(
            self.repo, newest["sha"], "a.py", max_bytes=1024
        )
        self.assertEqual(old["content"], "one\n")
        self.assertEqual(new["content"], "one\ntwo\n")
        # deleted at newest, present at oldest
        self.assertIsNone(git_snapshot.file_at_commit(
            self.repo, newest["sha"], "docs/guide.md", max_bytes=64
        ))
        self.assertIsNotNone(git_snapshot.file_at_commit(
            self.repo, oldest["sha"], "docs/guide.md", max_bytes=64
        ))

    def test_hostile_input_never_reaches_git(self) -> None:
        self.assertIsNone(git_snapshot.normalize_sha("HEAD"))
        self.assertIsNone(git_snapshot.normalize_sha("--exec=x"))
        self.assertIsNone(git_snapshot.normalize_sha(""))
        newest = self._shas()[0]["sha"]
        for bad in ("../../etc/passwd", "/abs", "a/../b", ""):
            with self.assertRaises(ValueError):
                git_snapshot.file_at_commit(self.repo, newest, bad, max_bytes=8)

    def test_non_repo_directory_is_none_not_parent_history(self) -> None:
        plain = Path(self._tmp.name) / "plain"
        plain.mkdir(exist_ok=True)
        self.assertIsNone(git_snapshot.list_commits(plain))
        self.assertIsNone(git_snapshot.commit_snapshot(plain, "a" * 40))


class SnapshotWiringTests(unittest.TestCase):
    """The UI and router are wired the way the feature needs."""

    def test_snapshot_view_registered_hidden_from_nav(self) -> None:
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        self.assertIn("import snapshotView from './views/snapshot.js?v=", app)
        self.assertIn("registerView(snapshotView);", app)
        self.assertIn('href="css/snapshot.css?v=', index)
        src = (ROOT / "space_ui" / "js" / "views" / "snapshot.js").read_text(
            encoding="utf-8"
        )
        head = src.split("export default", 1)[1]
        contract = head[: head.index("mount(")]
        self.assertIn("nav:false", contract)
        self.assertIn("parent:'projects'", contract)

    def test_graph_panel_lists_commits_and_opens_snapshot(self) -> None:
        atlas = (ROOT / "space_ui" / "js" / "views" / "atlas.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("commitSectionHTML(n)", atlas)
        self.assertIn("/commits?limit=", atlas)
        self.assertIn("space:show-commit", atlas)
        self.assertIn("go('snapshot')", atlas)
        snapshot = (ROOT / "space_ui" / "js" / "views" / "snapshot.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("space:show-commit", snapshot)
        self.assertIn("/snapshot'", snapshot)
        # a clicked file opens the shared previewer pinned to the commit
        self.assertIn("space:preview-file", snapshot)
        self.assertIn("ref:cur.sha", snapshot)

    def test_previewer_forwards_the_ref(self) -> None:
        preview = (ROOT / "space_ui" / "js" / "core" / "preview.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("'&ref='+encodeURIComponent(current.ref)", preview)

    def test_routes_are_registered(self) -> None:
        from routers.cowork_agent.bff import bff_routers

        paths = {r.path for router in bff_routers for r in router.routes}
        self.assertIn("/api/xo-projects/{project_id}/commits", paths)
        self.assertIn(
            "/api/xo-projects/{project_id}/commits/{sha}/snapshot", paths
        )


if __name__ == "__main__":
    unittest.main()
