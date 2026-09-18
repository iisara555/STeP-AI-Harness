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
        if path.suffix.lower() not in {".md", ".yaml", ".yml", ".py", ".txt", ".js", ".mjs", ".cjs", ".ts", ".sh", ".ps1", ".json", ".env", ".example", ".command", ".bat"}:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{path.relative_to(ROOT)}: possible {label}")



def validate_browser_env_safety(errors: list[str]) -> None:
    gitignore_path = ROOT / ".gitignore"
    if not gitignore_path.is_file():
        errors.append("Missing required file: .gitignore")
        return

    gitignore = gitignore_path.read_text(encoding="utf-8", errors="replace")
    for required_entry in (".env", ".env.*", ".step-ai/"):
        if required_entry not in gitignore:
            errors.append(f".gitignore must protect local browser/private state: {required_entry}")

    env_example = ROOT / ".env.example"
    if not env_example.is_file():
        errors.append("Missing required file: .env.example")
        return

    env_text = env_example.read_text(encoding="utf-8", errors="replace")
    if "STEP_BROWSER_CREDENTIAL_REF=" not in env_text:
        errors.append(".env.example must define STEP_BROWSER_CREDENTIAL_REF")

    forbidden_assignments = re.compile(
        r"(?im)^\s*(?:PASSWORD|PASSWD|PWD|TOKEN|API_KEY|APIKEY|SECRET|COOKIE|MFA_CODE)\s*=\s*\S+"
    )
    if forbidden_assignments.search(env_text):
        errors.append(".env.example must not contain or encourage plaintext password/token/cookie fields")

    # Repository policy: .env may hold references/config only, never credentials.
    if re.search(r"(?im)^\s*STEP_BROWSER_(?:PASSWORD|TOKEN|COOKIE|MFA)\s*=", env_text):
        errors.append(".env.example contains prohibited browser secret variable")


def validate_package_config(errors: list[str]) -> None:
    pkg_path = ROOT / "package.json"
    if not pkg_path.is_file():
        errors.append("Missing required file: package.json")
        return

    import json
    import subprocess

    try:
        data = json.loads(pkg_path.read_text(encoding="utf-8"))
    except Exception as exc:
        errors.append(f"Invalid package.json: {exc}")
        return

    if data.get("name") != "@step-cmu/ai-harness":
        errors.append(f"package.json name must be '@step-cmu/ai-harness', got {data.get('name')!r}")

    files = data.get("files", [])
    if not isinstance(files, list) or not files:
        errors.append("package.json must specify non-empty 'files' whitelist")

    # Ensure restricted files are never in package files whitelist
    banned_prefixes = ("artifacts", "output", "tmp", "docs/staff-abbreviations.md")
    for f in files:
        if any(f.startswith(p) for p in banned_prefixes):
            errors.append(f"package.json files contains restricted entry: {f}")

    # Test npm pack dry-run if npm is available
    try:
        res = subprocess.run(
            ["npm", "pack", "--dry-run", "--json"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            shell=True,
            check=False,
        )
        if res.returncode == 0:
            pack_data = json.loads(res.stdout)
            if isinstance(pack_data, list) and pack_data:
                packed_files = [item["path"] for item in pack_data[0].get("files", [])]
                for pf in packed_files:
                    if pf == "docs/staff-abbreviations.md" or pf.startswith(("artifacts/", "output/", "tmp/")):
                        errors.append(f"npm pack dry-run leaked restricted file: {pf}")
    except Exception:
        # npm may not be in all environments, whitelist check above is primary
        pass


def main() -> int:
    errors: list[str] = []
    count = validate_skills(errors)
    scan_secrets(errors)
    validate_browser_env_safety(errors)
    validate_package_config(errors)

    required = [
        "teamai.yaml",
        "culture.md",
        "manifest/roles.yaml",
        "manifest/teams.yaml",
        "manifest/skills.yaml",
        "manifest/processes.yaml",
        "manifest/documents.yaml",
        "manifest/services.yaml",
        "manifest/authority.yaml",
        "manifest/organization.yaml",
        "manifest/router-index.yaml",
        "manifest/playbooks.yaml",
        "manifest/actions.yaml",
        "manifest/provenance.yaml",
        "mcp/mcp.yaml",
        "package.json",
    ]
    for relative in required:
        if not (ROOT / relative).is_file():
            errors.append(f"Missing required file: {relative}")

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Validation passed: {count} skills; no likely secrets detected; package whitelist verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

