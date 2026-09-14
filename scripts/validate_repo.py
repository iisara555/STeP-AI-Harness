#!/usr/bin/env python3
"""Validate STeP TeamAI skill structure and catch likely committed secrets."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills"
NAME_RE = re.compile(r"^[a-z0-9-]{1,63}$")
SECRET_PATTERNS = {
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
    "OpenAI key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "Private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "Likely bearer token": re.compile(r"Bearer\s+(?!\$\{)[A-Za-z0-9._-]{24,}"),
}


def parse_frontmatter(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("missing YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError("unclosed YAML frontmatter") from exc

    values: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip():
            continue
        if ":" not in line:
            raise ValueError(f"invalid frontmatter line: {line}")
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip().strip('"\'')

    extra = set(values) - {"name", "description"}
    if extra:
        raise ValueError(f"unsupported frontmatter keys: {', '.join(sorted(extra))}")
    if not values.get("name") or not values.get("description"):
        raise ValueError("name and description are required")
    return values["name"], values["description"]


def validate_skills(errors: list[str]) -> int:
    paths = sorted(SKILL_ROOT.glob("*/*/SKILL.md"))
    if not paths:
        errors.append("No namespaced skills found")
        return 0

    seen: set[str] = set()
    for path in paths:
        try:
            name, _ = parse_frontmatter(path)
        except ValueError as exc:
            errors.append(f"{path.relative_to(ROOT)}: {exc}")
            continue
        if not NAME_RE.fullmatch(name):
            errors.append(f"{path.relative_to(ROOT)}: invalid skill name {name!r}")
        if path.parent.name != name:
            errors.append(f"{path.relative_to(ROOT)}: folder must match name {name!r}")
        if name in seen:
            errors.append(f"Duplicate skill name: {name}")
        seen.add(name)
    return len(paths)


def scan_secrets(errors: list[str]) -> None:
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.suffix.lower() not in {".md", ".yaml", ".yml", ".py", ".txt"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{path.relative_to(ROOT)}: possible {label}")


def main() -> int:
    errors: list[str] = []
    count = validate_skills(errors)
    scan_secrets(errors)

    required = [
        "teamai.yaml",
        "culture.md",
        "manifest/roles.yaml",
        "mcp/mcp.yaml",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            errors.append(f"Missing required file: {relative}")

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Validation passed: {count} skills; no likely secrets detected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

