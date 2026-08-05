#!/usr/bin/env python3
"""Validate the repository-local plugin boundary without external dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


ALLOWED_CAPABILITIES = {
    "Read supplied content",
    "Create proposal-only artifacts",
}
FORBIDDEN_COMPONENTS = {".mcp.json", ".app.json", "hooks.json"}


def _check(
    checks: list[dict[str, Any]],
    name: str,
    condition: bool,
    evidence: str,
) -> None:
    checks.append(
        {
            "name": name,
            "status": "pass" if condition else "fail",
            "evidence": evidence,
        }
    )


def _parse_frontmatter(skill_text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", skill_text, flags=re.DOTALL)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()
    return fields


def validate(plugin_root: Path) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    manifest_path = plugin_root / ".codex-plugin" / "plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    _check(
        checks,
        "manifest_name_matches_folder",
        manifest.get("name") == plugin_root.name == "talent-signal",
        f"manifest={manifest.get('name')!r}; folder={plugin_root.name!r}",
    )
    _check(
        checks,
        "strict_semver",
        bool(re.fullmatch(r"\d+\.\d+\.\d+", str(manifest.get("version", "")))),
        f"version={manifest.get('version')!r}",
    )
    _check(
        checks,
        "skill_path_declared",
        manifest.get("skills") == "./skills/",
        f"skills={manifest.get('skills')!r}",
    )
    _check(
        checks,
        "no_write_component_declared",
        all(key not in manifest for key in ("mcpServers", "apps", "hooks")),
        "manifest omits mcpServers, apps, and hooks",
    )
    capabilities = set(manifest.get("interface", {}).get("capabilities", []))
    _check(
        checks,
        "capabilities_are_read_propose_only",
        capabilities == ALLOWED_CAPABILITIES,
        f"capabilities={sorted(capabilities)!r}",
    )

    present_forbidden = sorted(
        str(path.relative_to(plugin_root))
        for path in plugin_root.rglob("*")
        if path.is_file() and path.name in FORBIDDEN_COMPONENTS
    )
    _check(
        checks,
        "no_connector_or_hook_files",
        not present_forbidden,
        f"forbidden_files={present_forbidden!r}",
    )

    skill_root = plugin_root / "skills" / "analyze-candidate-signal"
    skill_path = skill_root / "SKILL.md"
    skill_text = skill_path.read_text(encoding="utf-8")
    frontmatter = _parse_frontmatter(skill_text)
    _check(
        checks,
        "one_bundled_skill",
        sorted(
            path.name
            for path in (plugin_root / "skills").iterdir()
            if path.is_dir()
        )
        == ["analyze-candidate-signal"],
        "skills/analyze-candidate-signal is the sole bundled Skill",
    )
    _check(
        checks,
        "skill_frontmatter",
        set(frontmatter) == {"name", "description"}
        and frontmatter.get("name") == "analyze-candidate-signal"
        and bool(frontmatter.get("description")),
        f"frontmatter_keys={sorted(frontmatter)!r}",
    )
    _check(
        checks,
        "no_scaffold_placeholders",
        "[TODO:" not in skill_text and "[TODO:" not in json.dumps(manifest),
        "manifest and Skill contain no scaffold placeholders",
    )
    _check(
        checks,
        "deterministic_analyzer_present",
        (skill_root / "scripts" / "analyze_conversation.py").is_file(),
        "Skill analyzer exists",
    )
    _check(
        checks,
        "output_contract_present",
        (skill_root / "references" / "output-contract.md").is_file(),
        "proposal-only contract exists",
    )

    failed = [check["name"] for check in checks if check["status"] == "fail"]
    return {
        "validator": "talent-signal-plugin-local-v1",
        "plugin": str(plugin_root),
        "status": "pass" if not failed else "fail",
        "failed_checks": failed,
        "checks": checks,
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "plugin_root",
        type=Path,
        nargs="?",
        default=Path(__file__).resolve().parents[1],
    )
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    result = validate(args.plugin_root.resolve())
    rendered = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
