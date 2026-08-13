from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SpaceWikiTests(unittest.TestCase):
    def test_wiki_view_is_registered_and_styled(self) -> None:
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")

        self.assertIn("import wikiView from './views/wiki.js?v=", app)
        self.assertIn("registerView(wikiView);", app)
        self.assertIn('href="css/wiki.css?v=', index)
        # The wiki has no top-level tab: it opens from the Setup header
        # button, and Setup's tab stays lit while it is open.
        wikijs = (
            ROOT / "space_ui" / "js" / "views" / "wiki.js"
        ).read_text(encoding="utf-8")
        self.assertIn("nav:false", wikijs)
        self.assertIn("parent:'secrets'", wikijs)
        secrets = (
            ROOT / "space_ui" / "js" / "views" / "secrets.js"
        ).read_text(encoding="utf-8")
        self.assertIn('id="setup-wiki"', secrets)
        self.assertIn("switchTo('wiki')", secrets)
        # The intro overlays are gone from Graph and Dashboard.
        self.assertNotIn('id="intro"', index)
        dashboard_builder = (
            ROOT / "services" / "cowork_agent" / "visualizer"
            / "categorized_graph.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("introTitle", dashboard_builder)
        self.assertNotIn("Every project has a purpose", dashboard_builder)

    def test_secrets_view_is_registered_and_never_reveals_saved_values(self) -> None:
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        secrets = (
            ROOT / "space_ui" / "js" / "views" / "secrets.js"
        ).read_text(encoding="utf-8")

        self.assertIn("import secretsView from './views/secrets.js?v=", app)
        self.assertIn("registerView(secretsView);", app)
        self.assertIn('href="css/secrets.css?v=', index)
        self.assertIn("id:'secrets',label:'Setup'", secrets)
        self.assertIn("type=\"password\"", secrets)
        self.assertIn("method:'PATCH'", secrets)
        self.assertIn("method:'DELETE'", secrets)
        self.assertIn("/api/runtime-config", secrets)
        self.assertIn("Apply &amp; restart", secrets)
        self.assertNotIn("/reveal", secrets)
        registry = (
            ROOT / "space_ui" / "js" / "core" / "registry.js"
        ).read_text(encoding="utf-8")
        self.assertIn("scrollIntoView", registry)

    def test_quirq_view_registered_and_six_degrees_removed(self) -> None:
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        quirq = (
            ROOT / "space_ui" / "js" / "views" / "quirq.js"
        ).read_text(encoding="utf-8")
        atlas = (
            ROOT / "space_ui" / "js" / "views" / "atlas.js"
        ).read_text(encoding="utf-8")

        self.assertIn("registerView(quirqView);", app)
        self.assertIn('href="css/quirq.css?v=', index)
        self.assertIn("id:'quirq'", quirq)
        self.assertIn("/api/quirq", quirq)
        # Six Degrees was removed: no child lens, no lens switch, no view.
        self.assertNotIn("data-atlas-lens", index)
        self.assertNotIn("view-six", index)
        self.assertNotIn("SIX DEGREES", atlas)
        self.assertNotIn("sixView", atlas)

    def test_wiki_documents_the_storage_boundary_and_flow_pages(self) -> None:
        wiki = (ROOT / "space_ui" / "js" / "views" / "wiki.js").read_text(
            encoding="utf-8"
        )

        self.assertIn("Storage & data map", wiki)
        self.assertIn("Install & run locally", wiki)
        self.assertIn("raw.githubusercontent.com", wiki)
        self.assertIn("no clone or checkout", wiki)
        self.assertIn("localhost:5003", wiki)
        self.assertIn("./cowork-api.sh dev", wiki)
        self.assertIn("127.0.0.1:5003", wiki)
        self.assertIn("How the watcher works", wiki)
        self.assertIn("Everything in .xo", wiki)
        self.assertIn("Everything in .quirq", wiki)
        self.assertIn("secrets.env", wiki)
        self.assertIn("Building useful flows", wiki)
        self.assertIn("Collaborative version history", wiki)
        self.assertIn(
            "watcher/activity/projects/&lt;id&gt;.json",
            wiki,
        )
        self.assertIn("GET /api/xo-projects/{id}/activity", wiki)
        self.assertIn("GET /api/xo-projects/{id}/timeline?limit=100", wiki)

    def test_wiki_documents_collaborative_version_control_design(self) -> None:
        wiki = (ROOT / "space_ui" / "js" / "views" / "wiki.js").read_text(
            encoding="utf-8"
        )

        self.assertIn("id:'collaboration'", wiki)
        self.assertIn("collaboration:collaborationArticle", wiki)
        self.assertIn("Do not version the directory", wiki)
        self.assertIn("Yjs + Hocuspocus + PostgreSQL", wiki)
        self.assertIn("Synchronization history", wiki)
        self.assertIn("User-visible version history", wiki)
        self.assertIn("Operational disaster recovery", wiki)
        self.assertIn("Restore as a new latest version", wiki)
        self.assertIn("watcher/activity/**", wiki)
        self.assertIn("secret reference IDs", wiki)
        self.assertIn("Automerge Repo", wiki)
        self.assertIn("Liveblocks + Yjs", wiki)
        self.assertIn("docs.yjs.dev/api/document-updates", wiki)
        self.assertIn("support.google.com/docs/answer/190843", wiki)
        index = (ROOT / "space_ui" / "index.html").read_text(encoding="utf-8")
        self.assertIn("css/wiki.css?v=20260725-collaboration1", index)
        self.assertIn("js/app.js?v=20260813-wikisetup1", index)

    def test_wiki_has_a_dedicated_guide_for_every_top_level_tab(self) -> None:
        wiki = (ROOT / "space_ui" / "js" / "views" / "wiki.js").read_text(
            encoding="utf-8"
        )

        for page_id in (
            "tab-dashboard",
            "tab-graph",
            "tab-timeline",
            "tab-sessions",
            "tab-projects",
            "tab-wiki",
            "tab-quirq",
            "tab-setup",
        ):
            self.assertIn(f"id:'{page_id}'", wiki)
            self.assertIn(f"'{page_id}':", wiki)
        # Chat is hidden from the tab bar, so it gets no tab guide.
        self.assertNotIn("id:'tab-chat'", wiki)
        app = (ROOT / "space_ui" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("registerView(chatView)", app)
        self.assertIn("newest at the top", wiki)
        self.assertNotIn("Six Degrees", wiki)
        self.assertIn("one page per tab", wiki)
        self.assertIn("space:wiki-page", wiki)

    def test_installation_guide_documents_one_command_setup(self) -> None:
        guide = (ROOT / "INSTALLATION.md").read_text(encoding="utf-8")

        self.assertIn("curl -fsSL", guide)
        self.assertIn("localhost:5003", guide)
        # Piping to `sh` fails: the installer uses BASH_SOURCE and pipefail.
        self.assertIn("| bash", guide)
        self.assertNotIn("| sh\n", guide)
        # git went from "you do not need it" to a hard prerequisite.
        self.assertNotIn("You do not need Git", guide)

    def test_installer_runs_natively_without_docker(self) -> None:
        """The installer's premise: no Docker, and no surprise installs.

        Comment lines are stripped first so these assert what the script
        *does*, not what its header *says* about the Docker it replaced.
        """

        lines = (ROOT / "install.sh").read_text(encoding="utf-8").splitlines()
        code = "\n".join(
            line for line in lines if not line.lstrip().startswith("#")
        )

        self.assertNotIn("docker", code.lower())
        self.assertIn("uv venv", code)
        self.assertIn("uv pip install", code)
        # venv/, not uv's default .venv/ — CLAUDE.md, DEVELOPING.md and
        # compose.local.yml all document venv/bin/python.
        self.assertNotIn(".venv", code)
        # Root resolution must stay identical to the retired Docker installer.
        self.assertIn("saved_root_from_file", code)
        self.assertIn("validate_separate_roots", code)
        self.assertIn("prepare_state_root", code)
        # Nothing may be installed beyond requirements.txt.
        self.assertIn("QUIRQ_SKIP_BOOT_INSTALL", code)

    def test_installer_claims_no_container_only_capabilities(self) -> None:
        """Setting either would make the Setup tab offer a restart control
        that cannot work: nothing supervises a foreground process."""

        lines = (ROOT / "install.sh").read_text(encoding="utf-8").splitlines()
        code = "\n".join(
            line for line in lines if not line.lstrip().startswith("#")
        )

        self.assertNotIn("QUIRQ_MANAGED_CONTAINER", code)
        self.assertNotIn("QUIRQ_ALLOW_SELF_RESTART", code)
        # Host-path translation only existed to bridge a container boundary.
        self.assertNotIn("QUIRQ_HOST_HOME", code)
        self.assertNotIn("QUIRQ_HOST_PROJECTS_ROOT", code)
        self.assertNotIn("QUIRQ_HOST_STATE_ROOT", code)

    def test_project_template_no_longer_scaffolds_activity_in_xo(self) -> None:
        legacy_activity = (
            ROOT / "services" / "cowork_agent" / "project_template"
            / ".xo" / "activity.json"
        )
        self.assertFalse(legacy_activity.exists())

    def test_managed_agent_bootstraps_refresh_setup_tab_credentials(self) -> None:
        for agent in ("claude_code", "hermes", "openclaw"):
            setup = (
                ROOT / "config" / "agents" / agent / "setup.sh"
            ).read_text(encoding="utf-8")
            self.assertIn('QUIRQ_MANAGED_CONTAINER:-false', setup)
            self.assertIn(
                "Refreshing .env from managed Quirq configuration",
                setup,
            )


if __name__ == "__main__":
    unittest.main()
