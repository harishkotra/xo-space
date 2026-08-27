from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from services.cowork_agent.visualizer.dashboard_regions import (
    REGIONS,
    build_dashboard_regions,
)


def _fake_source() -> dict:
    return {
        "meta": {"workspace": "~/xo-projects"},
        "hubs": [{"id": "p_alpha", "cat": "p_alpha", "label": "alpha"}],
        "groups": [{"id": "grp_alpha", "cat": "p_alpha", "label": "alpha"}],
        "leaves": [
            {
                "id": "leaf1",
                "group": "grp_alpha",
                "path": "alpha/app.py",
                "label": "app.py",
                "date": "2026-08-01",
            },
            {
                "id": "leaf2",
                "group": "grp_alpha",
                "path": "alpha/main.py",
                "label": "main.py",
                "date": "2026-08-02",
            },
        ],
        "ties": [],
        "gitHistory": {
            "p_alpha": [{"d": "2026-08-02", "n": 3, "s": ["ship it"]}]
        },
    }


class DashboardRegionsTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = Path(self._tmp.name)

        self.root = base / "xo-projects"
        alpha = self.root / "alpha"
        (alpha / ".git").mkdir(parents=True)  # a real checkout
        (alpha / ".env").write_text("SECRET=value-that-must-not-leak")
        (alpha / "install.sh").write_text("#!/bin/sh\n")
        (alpha / "config").mkdir()
        (alpha / "config" / "app.yml").write_text("a: 1\n")
        (alpha / ".xo").mkdir()
        (alpha / ".xo" / "project.json").write_text("{}")
        (alpha / ".xo" / "todos.json").write_text("{}")
        (alpha / ".xo" / "sessions").mkdir()

        worktree = self.root / "alpha-wt"
        worktree.mkdir()
        (worktree / ".git").write_text("gitdir: /somewhere/else\n")

        (self.root / ".xo").mkdir()
        (self.root / ".xo" / "sessions.json").write_text(
            json.dumps(
                {
                    "daily_tools": [
                        {"day": "2026-08-05", "agent": "claude_code", "name": "Bash", "calls": 4, "errors": 1},
                        {"day": "2026-08-06", "agent": "claude_code", "name": "Bash", "calls": 2, "errors": 0},
                    ]
                }
            )
        )

        self.home = base / "home"
        (self.home / ".quirq" / "watcher").mkdir(parents=True)
        (self.home / ".quirq" / "state.json").write_text("{}")
        (self.home / ".quirq" / "watcher" / "offsets.json").write_text("{}")
        (self.home / ".claude" / "projects" / "-home-x").mkdir(parents=True)
        (self.home / ".claude" / "tasks" / "task-1").mkdir(parents=True)
        (self.home / ".argus").mkdir()
        (self.home / ".argus" / "argusd.log").write_text("log line\n")

        # classify_project resolves the project dir through the env root
        patcher = mock.patch.dict(
            os.environ, {"XO_PROJECTS_ROOT": str(self.root)}
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.payload = build_dashboard_regions(
            _fake_source(), projects_root=self.root, home=self.home
        )
        self.regions = {r["id"]: r for r in self.payload["regions"]}

    def test_schema_and_region_order(self) -> None:
        self.assertEqual(2, self.payload["schema"])
        self.assertEqual(
            list(REGIONS), [r["id"] for r in self.payload["regions"]]
        )
        for region in self.payload["regions"]:
            for key in ("kind", "label", "color", "blurb", "stat", "data"):
                self.assertIn(key, region)

    def test_vault_lists_secret_names_but_never_contents(self) -> None:
        vault = self.regions["q1"]
        self.assertEqual("vault", vault["kind"])
        alpha = next(
            p for p in vault["data"]["projects"] if p["name"] == "alpha"
        )
        kinds = {tile["name"]: tile["kind"] for tile in alpha["tiles"]}
        self.assertEqual("secret", kinds[".env"])
        self.assertEqual("setup", kinds["install.sh"])
        self.assertEqual("config", kinds["app.yml"])
        self.assertNotIn("value-that-must-not-leak", json.dumps(self.payload))

    def test_orbits_have_one_ring_per_runtime(self) -> None:
        rings = {r["id"]: r for r in self.regions["q2"]["data"]["rings"]}
        self.assertEqual({"claude", "cursor", "projects"}, set(rings))
        self.assertEqual(
            ["-home-x"], [i["name"] for i in rings["claude"]["items"]]
        )
        self.assertEqual(
            ["alpha"], [i["name"] for i in rings["projects"]["items"]]
        )

    def test_pulsar_aggregates_tool_calls_across_days(self) -> None:
        pulsar = self.regions["q3"]["data"]
        bash = next(t for t in pulsar["tools"] if t["name"] == "Bash")
        self.assertEqual(6, bash["calls"])
        self.assertEqual(1, bash["errors"])
        self.assertEqual("2026-08-06", bash["day"])
        self.assertIn("argusd.log", {l["name"] for l in pulsar["logs"]})

    def test_heatlanes_hold_checkouts_and_exclude_worktrees(self) -> None:
        lanes = self.regions["q4"]["data"]
        names = [repo["name"] for repo in lanes["repos"]]
        self.assertIn("alpha", names)
        self.assertNotIn("alpha-wt", names)
        alpha = next(r for r in lanes["repos"] if r["name"] == "alpha")
        self.assertEqual(3, alpha["total"])
        self.assertLess(lanes["start"], lanes["end"])

    def test_watcher_groups_state_and_watcher_files(self) -> None:
        files = {f["name"]: f for f in self.regions["q5"]["data"]["files"]}
        self.assertEqual("state", files["state.json"]["group"])
        self.assertEqual("watcher", files["offsets.json"]["group"])

    def test_forks_attach_worktrees_and_list_tasks(self) -> None:
        forks = self.regions["q6"]["data"]
        alpha = next(r for r in forks["repos"] if r["name"] == "alpha")
        self.assertEqual(
            ["alpha-wt"], [w["name"] for w in alpha["worktrees"]]
        )
        self.assertEqual(["task-1"], [t["name"] for t in forks["tasks"]])

    def test_galaxy_distills_the_classic_projection(self) -> None:
        galaxy = self.regions["q7"]["data"]
        self.assertEqual(5, len(galaxy["environments"]))
        self.assertEqual(["alpha"], [p["id"] for p in galaxy["projects"]])
        project = galaxy["projects"][0]
        self.assertTrue(project["memberships"])
        environment_ids = {e["id"] for e in galaxy["environments"]}
        self.assertTrue(set(project["memberships"]) <= environment_ids)

    def test_treemap_covers_workspace_and_project_xo(self) -> None:
        groups = {g["label"]: g for g in self.regions["q8"]["data"]["groups"]}
        self.assertIn("workspace", groups)
        self.assertIn("alpha", groups)
        self.assertIn(
            "sessions.json", {f["name"] for f in groups["workspace"]["files"]}
        )
        self.assertIn(
            "project.json", {f["name"] for f in groups["alpha"]["files"]}
        )


if __name__ == "__main__":
    unittest.main()
