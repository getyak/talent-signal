#!/usr/bin/env python3
"""Check structure and local-link integrity for the Talent Signal review panel."""

from __future__ import annotations

import re
import sys
from pathlib import Path


PANEL_SKILLS = (
    "performance-outcome-fit",
    "candidate-decision-motivation",
    "executive-potential-evidence",
    "candidate-experience-guardrail",
    "inclusive-sourcing-recall",
    "recruiting-trend-radar",
    "recruiter-workflow-reviewer",
    "evidence-safety-reviewer",
    "selection-science-auditor",
    "mobile-ux-reviewer",
    "product-adjudicator",
)
FRONTMATTER = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
NAME = re.compile(r"^name:\s*(.+?)\s*$", re.MULTILINE)
DESCRIPTION = re.compile(r"^description:\s*(.+?)\s*$", re.MULTILINE)
MARKDOWN_LINK = re.compile(r"\[[^\]]*]\(([^)]+)\)")


def main() -> int:
    script_path = Path(__file__).resolve()
    skills_root = script_path.parent.parent.parent
    errors: list[str] = []

    for skill_name in PANEL_SKILLS:
        skill_root = skills_root / skill_name
        skill_md = skill_root / "SKILL.md"
        agent_yaml = skill_root / "agents" / "openai.yaml"
        persona = skill_root / "references" / "persona-profile.md"

        for required in (skill_md, agent_yaml, persona):
            if not required.is_file():
                errors.append(f"{skill_name}: missing {required.relative_to(skills_root)}")

        if skill_name != "product-adjudicator":
            for filename in ("rubric.md", "sources.md"):
                required = skill_root / "references" / filename
                if not required.is_file():
                    errors.append(
                        f"{skill_name}: missing {required.relative_to(skills_root)}"
                    )

        if not skill_md.is_file():
            continue

        text = skill_md.read_text(encoding="utf-8")
        frontmatter = FRONTMATTER.search(text)
        if not frontmatter:
            errors.append(f"{skill_name}: malformed frontmatter")
            continue

        name_match = NAME.search(frontmatter.group(1))
        description_match = DESCRIPTION.search(frontmatter.group(1))
        if not name_match or name_match.group(1).strip() != skill_name:
            errors.append(f"{skill_name}: frontmatter name does not match directory")
        if not description_match or "Use " not in description_match.group(1):
            errors.append(f"{skill_name}: description needs concrete 'Use ...' triggers")
        if "TODO" in text:
            errors.append(f"{skill_name}: contains TODO placeholder")

        if agent_yaml.is_file():
            yaml_text = agent_yaml.read_text(encoding="utf-8")
            if f"${skill_name}" not in yaml_text:
                errors.append(f"{skill_name}: default prompt does not name ${skill_name}")

        for markdown in skill_root.rglob("*.md"):
            markdown_text = markdown.read_text(encoding="utf-8")
            for target in MARKDOWN_LINK.findall(markdown_text):
                target = target.strip()
                if (
                    not target
                    or target.startswith(("http://", "https://", "#", "mailto:"))
                    or "://" in target
                ):
                    continue
                target_path = (markdown.parent / target.split("#", 1)[0]).resolve()
                if not target_path.exists():
                    errors.append(
                        f"{skill_name}: broken local link in "
                        f"{markdown.relative_to(skill_root)} -> {target}"
                    )

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"panel skill suite: PASS ({len(PANEL_SKILLS)} skills)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
