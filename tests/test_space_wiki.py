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

    def test_quirq_view_and_timeline_child_are_registered(self) -> None:
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
        self.assertIn("data-atlas-lens=\"six\"", index)
        self.assertIn("nav:false", atlas)
        self.assertIn("parent:'time'", atlas)

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
        self.assertIn("js/app.js?v=20260726-environments1", index)

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
            "tab-chat",
            "tab-wiki",
            "tab-quirq",
            "tab-setup",
        ):
            self.assertIn(f"id:'{page_id}'", wiki)
            self.assertIn(f"'{page_id}':", wiki)
        self.assertIn("Six Degrees now lives inside this tab", wiki)
        self.assertIn("one page per tab", wiki)
        self.assertIn("space:wiki-page", wiki)

    def test_installation_guide_documents_one_command_setup(self) -> None:
        guide = (ROOT / "INSTALLATION.md").read_text(encoding="utf-8")
        installer = (ROOT / "install.sh").read_text(encoding="utf-8")
        workflow = (
            ROOT / ".github" / "workflows" / "publish-container.yml"
        ).read_text(encoding="utf-8")

        self.assertIn("curl -fsSL", guide)
        self.assertIn("You do not need Git", guide)
        self.assertIn("localhost:5003", guide)
        self.assertNotIn("git clone", guide)
        self.assertIn("ghcr.io/sharmasuraj0123/xo-cowork-api:latest", installer)
        self.assertIn("docker run", installer)
        self.assertIn(".State.Health", installer)
        self.assertIn("127.0.0.1:5003:5002", installer)
        self.assertIn('io.quirq.managed', installer)
        self.assertIn("mounted_host_path", installer)
        self.assertIn("saved_root_from_file", installer)
        self.assertIn("prepare_state_root", installer)
        self.assertIn("scripts.list_runtime_mounts", installer)
        self.assertIn('${host_path}:${container_path}:ro', installer)
        self.assertIn("QUIRQ_WATCHER_SOURCE_MODE=all", installer)
        self.assertIn("QUIRQ_ALLOW_SELF_RESTART=true", installer)
        self.assertIn("AI_WORKSPACE_ROOT=/workspace/xo-projects", installer)
        self.assertIn("platforms: linux/amd64,linux/arm64", workflow)

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
