import json
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from scripts.new_plugin import ROOT, main, scaffold

SHARED = ROOT / "shared"
SCHEMAS = [json.loads(path.read_text()) for path in SHARED.glob("*.schema.json")]
MANIFEST = Draft202012Validator(
    json.loads((SHARED / "manifest.schema.json").read_text()),
    registry=Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS
    ),
)


@pytest.mark.parametrize("kind", ["sense", "brain", "skill"])
def test_code_plugins_get_a_valid_manifest_code_and_a_harness_test(
    tmp_path: Path, kind: str
) -> None:
    folder = scaffold(kind, "big-wave", tmp_path)

    assert folder == tmp_path / kind / "big-wave"
    assert sorted(path.name for path in folder.iterdir()) == [
        "big-wave.test.ts",
        "index.ts",
        "manifest.json",
    ]
    manifest = json.loads((folder / "manifest.json").read_text())
    MANIFEST.validate(manifest)
    assert (manifest["kind"], manifest["id"], manifest["name"]) == (kind, "big-wave", "Big wave")
    assert "export const code: PluginCode" in (folder / "index.ts").read_text()
    assert "checkPlugin(() => ({ manifest, code }))" in (folder / "big-wave.test.ts").read_text()


def test_sense_events_use_the_id_as_an_event_name(tmp_path: Path) -> None:
    folder = scaffold("sense", "big-wave", tmp_path)

    assert json.loads((folder / "manifest.json").read_text())["emits"] == ["observation.big_wave"]


def test_content_plugins_are_data_with_a_harness_test(tmp_path: Path) -> None:
    folder = scaffold("content", "hat", tmp_path)

    assert sorted(path.name for path in folder.iterdir()) == ["hat.test.ts", "manifest.json"]
    manifest = json.loads((folder / "manifest.json").read_text())
    MANIFEST.validate(manifest)
    assert manifest["type"] == "prop"
    assert "checkPlugin(() => ({ manifest }))" in (folder / "hat.test.ts").read_text()


def test_refuses_to_overwrite_a_plugin(tmp_path: Path) -> None:
    scaffold("skill", "peck", tmp_path)
    (tmp_path / "skill" / "peck" / "index.ts").write_text("mine")

    with pytest.raises(FileExistsError):
        scaffold("skill", "peck", tmp_path)
    assert (tmp_path / "skill" / "peck" / "index.ts").read_text() == "mine"


def test_main_rejects_bad_ids_and_kinds(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["skill", "Big Wave", "--root", str(tmp_path)]) == 1
    assert "Big Wave" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        main(["gizmo", "x", "--root", str(tmp_path)])
    assert not any(tmp_path.iterdir())


def test_main_scaffolds_and_says_where(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["brain", "nosy", "--root", str(tmp_path)]) == 0
    assert str(tmp_path / "brain" / "nosy") in capsys.readouterr().out
    assert main(["brain", "nosy", "--root", str(tmp_path)]) == 1
    assert "already exists" in capsys.readouterr().err


def test_just_new_runs_the_scaffolder(tmp_path: Path) -> None:
    command = ["just", "--justfile", str(ROOT / "justfile"), "new", "skill", "hop"]
    subprocess.run([*command, "--root", str(tmp_path)], check=True)

    assert (tmp_path / "skill" / "hop" / "manifest.json").exists()


@pytest.mark.parametrize("kind", ["sense", "brain", "skill", "content"])
def test_a_new_plugin_passes_lint_and_the_harness_in_the_game(kind: str) -> None:
    plugins = ROOT / "game" / "src" / "plugins"
    created = not plugins.exists()
    folder = scaffold(kind, f"harness-check-{uuid4().hex}", plugins)
    try:
        files = [str(path.relative_to(ROOT / "game")) for path in folder.iterdir()]
        game = ["pnpm", "-C", str(ROOT / "game"), "exec"]
        subprocess.run([*game, "prettier", "--check", *files], check=True)
        lint = [file for file in files if file.endswith(".ts")]
        subprocess.run([*game, "eslint", "--max-warnings", "0", *lint], check=True)
        subprocess.run([*game, "vitest", "run", str(folder.relative_to(ROOT / "game"))], check=True)
    finally:
        shutil.rmtree(plugins if created else folder)
        if not created and not any(folder.parent.iterdir()):
            folder.parent.rmdir()
