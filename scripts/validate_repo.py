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


def parse_frontmatter(path: Path) -> tuple[str, str, int | None]:
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

    extra = set(values) - {"name", "description", "standardVersion"}
    if extra:
        raise ValueError(f"unsupported frontmatter keys: {', '.join(sorted(extra))}")
    if not values.get("name") or not values.get("description"):
        raise ValueError("name and description are required")

    standard_version = None
    if values.get("standardVersion"):
        try:
            standard_version = int(values["standardVersion"])
        except ValueError as exc:
            raise ValueError("standardVersion must be an integer") from exc

    return values["name"], values["description"], standard_version


def validate_skills(errors: list[str]) -> int:
    paths = sorted(SKILL_ROOT.glob("*/*/SKILL.md"))
    if not paths:
        errors.append("No namespaced skills found")
        return 0

    seen: set[str] = set()
    for path in paths:
        try:
            name, _, standard_version = parse_frontmatter(path)
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

        if standard_version is not None and standard_version >= 2:
            text = path.read_text(encoding="utf-8", errors="replace")
            headings = [
                match.group(1).strip()
                for match in re.finditer(r"^##\s+(.+?)\s*$", text, flags=re.MULTILINE)
            ]
            required_headings = [
                "Purpose",
                "เมื่อควรใช้",
                "Inputs",
                "Source",
                "Workflow",
                "Output",
                "Authority",
                "Handoff",
                "Guardrails",
            ]
            missing = [heading for heading in required_headings if heading not in headings]
            if missing:
                errors.append(
                    f"{path.relative_to(ROOT)}: standardVersion {standard_version} "
                    f"missing required sections: {', '.join(missing)}"
                )
    return len(paths)



SKILL_LOCAL_RESOURCE_RE = re.compile(
    r"`((?:references|scripts|templates)/[A-Za-z0-9_.\-/]+)`"
)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def validate_skill_dependencies(errors: list[str]) -> None:
    """Ensure local files referenced by SKILL.md actually exist.

    This intentionally validates only repository-local dependencies. External
    URLs are runtime sources and are not fetched during repository validation.
    """
    for skill_path in sorted(SKILL_ROOT.glob("*/*/SKILL.md")):
        text = skill_path.read_text(encoding="utf-8", errors="replace")
        targets: set[str] = set()

        for match in MARKDOWN_LINK_RE.finditer(text):
            raw = match.group(1).strip().strip("<>")
            if raw:
                targets.add(raw)

        for match in SKILL_LOCAL_RESOURCE_RE.finditer(text):
            targets.add(match.group(1))

        for raw_target in sorted(targets):
            target = raw_target.split("#", 1)[0].split("?", 1)[0].strip()
            if not target:
                continue
            if re.match(r"^(?:https?://|mailto:|data:)", target, flags=re.IGNORECASE):
                continue

            candidate = (skill_path.parent / target).resolve()
            try:
                candidate.relative_to(ROOT.resolve())
            except ValueError:
                errors.append(
                    f"{skill_path.relative_to(ROOT)}: local dependency escapes repository: {raw_target}"
                )
                continue

            if not candidate.exists():
                errors.append(
                    f"{skill_path.relative_to(ROOT)}: missing local dependency: {raw_target}"
                )

def validate_router_registry(errors: list[str]) -> None:
    """Cross-check router-index.yaml against the team and role registries.

    A cluster or team value that no registry declares cannot match anything at
    scoring time, so the Skill quietly loses that routing signal instead of
    failing loudly. Catch it here rather than in production routing.
    """
    teams_path = ROOT / "manifest" / "teams.yaml"
    roles_path = ROOT / "manifest" / "roles.yaml"
    router_path = ROOT / "manifest" / "router-index.yaml"
    for path in (teams_path, roles_path, router_path):
        if not path.is_file():
            return

    teams_text = teams_path.read_text(encoding="utf-8", errors="replace")
    clusters = set(re.findall(r"^ {2}- id:\s*([a-z0-9_-]+)", teams_text, flags=re.MULTILINE))
    teams = set(re.findall(r"^ {6}- id:\s*([a-z0-9_-]+)", teams_text, flags=re.MULTILINE))

    roles_text = roles_path.read_text(encoding="utf-8", errors="replace")
    roles = set(re.findall(r"^ {2}- id:\s*([a-z0-9_-]+)", roles_text, flags=re.MULTILINE))

    # teams.primary / teams.consumers accept team ids, role ids and the "*" wildcard.
    valid_refs = teams | roles

    router_text = router_path.read_text(encoding="utf-8", errors="replace")
    current = ""
    for line in router_text.splitlines():
        name_match = re.match(r"^ {2}- name:\s*([a-z0-9_-]+)", line)
        if name_match:
            current = name_match.group(1)
            continue
        if not current:
            continue

        cluster_match = re.match(r"^ {4}cluster:\s*([a-z0-9_-]+)", line)
        if cluster_match and cluster_match.group(1) not in clusters:
            errors.append(
                f"manifest/router-index.yaml: Skill '{current}' references unknown "
                f"cluster '{cluster_match.group(1)}'"
            )
            continue

        refs_match = re.match(r"^ {6}(primary|consumers):\s*\[(.*)\]", line)
        if refs_match:
            field = refs_match.group(1)
            for raw in refs_match.group(2).split(","):
                ref = raw.strip().strip("'\"")
                if not ref or ref == "*":
                    continue
                if ref not in valid_refs:
                    errors.append(
                        f"manifest/router-index.yaml: Skill '{current}' references unknown "
                        f"team/role '{ref}' in {field}"
                    )


def validate_organization_clusters(errors: list[str]) -> None:
    """Keep organization.yaml's cluster description in step with teams.yaml.

    Nothing loads organization.yaml at runtime, so a cluster renamed in only one
    of the two files drifts silently and the docs start describing a grouping
    the router does not use.
    """
    teams_path = ROOT / "manifest" / "teams.yaml"
    org_path = ROOT / "manifest" / "organization.yaml"
    if not teams_path.is_file() or not org_path.is_file():
        return

    team_clusters: dict[str, list[str]] = {}
    current = ""
    for line in teams_path.read_text(encoding="utf-8", errors="replace").splitlines():
        cluster_match = re.match(r"^ {2}- id:\s*([a-z0-9_-]+)", line)
        if cluster_match:
            current = cluster_match.group(1)
            team_clusters[current] = []
            continue
        team_match = re.match(r"^ {6}- id:\s*([a-z0-9_-]+)", line)
        if team_match and current:
            team_clusters[current].append(team_match.group(1))

    org_clusters: dict[str, list[str]] = {}
    in_clusters = False
    current = ""
    for line in org_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        # organization.yaml has other top-level sections with the same key shape,
        # so only read the clusters block.
        if re.match(r"^[A-Za-z0-9_-]+:", line):
            in_clusters = re.match(r"^clusters:\s*$", line) is not None
            current = ""
            continue
        if not in_clusters:
            continue
        cluster_match = re.match(r"^ {2}([a-z0-9_-]+):\s*$", line)
        if cluster_match:
            current = cluster_match.group(1)
            org_clusters[current] = []
            continue
        if not current:
            continue
        members_match = re.match(r"^ {4}teams:\s*\[(.*)\]", line)
        if members_match:
            org_clusters[current] = [
                member.strip().strip("'\"")
                for member in members_match.group(1).split(",")
                if member.strip()
            ]

    if not org_clusters or not team_clusters:
        return

    for cluster in sorted(set(org_clusters) - set(team_clusters)):
        errors.append(
            f"manifest/organization.yaml: cluster '{cluster}' is not declared in teams.yaml"
        )
    for cluster in sorted(set(team_clusters) - set(org_clusters)):
        errors.append(
            f"manifest/organization.yaml: cluster '{cluster}' from teams.yaml is missing"
        )
    for cluster in sorted(set(org_clusters) & set(team_clusters)):
        if sorted(org_clusters[cluster]) != sorted(team_clusters[cluster]):
            errors.append(
                f"manifest/organization.yaml: cluster '{cluster}' members "
                f"{sorted(org_clusters[cluster])} do not match teams.yaml "
                f"{sorted(team_clusters[cluster])}"
            )


def validate_executive_oversight(errors: list[str]) -> None:
    """Every team named in organization.yaml -> executiveOversight must exist.

    The oversight map is how a request finds the executive above a team, so a
    renamed or dropped team id turns into a dead routing hint.
    """
    teams_path = ROOT / "manifest" / "teams.yaml"
    org_path = ROOT / "manifest" / "organization.yaml"
    if not teams_path.is_file() or not org_path.is_file():
        return

    teams = set(
        re.findall(
            r"^ {6}- id:\s*([a-z0-9_-]+)",
            teams_path.read_text(encoding="utf-8", errors="replace"),
            flags=re.MULTILINE,
        )
    )
    if not teams:
        return

    org_text = org_path.read_text(encoding="utf-8", errors="replace")
    in_oversight = False
    current = ""
    supervised: dict[str, list[str]] = {}
    declared_shared: set[str] = set()
    for line in org_text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if re.match(r"^[A-Za-z0-9_-]+:", line):
            in_oversight = re.match(r"^executiveOversight:\s*$", line) is not None
            current = ""
            continue
        if not in_oversight:
            continue

        shared_match = re.match(r"^ {2}sharedOversight:\s*\[(.*)\]", line)
        if shared_match:
            declared_shared = {
                team.strip().strip("'\"")
                for team in shared_match.group(1).split(",")
                if team.strip()
            }
            continue

        name_match = re.match(r"^ {4}- name:\s*\"?(.+?)\"?\s*$", line)
        if name_match:
            current = name_match.group(1)
            continue

        teams_match = re.match(r"^ {6}teams:\s*\[(.*)\]", line)
        if teams_match:
            for raw in teams_match.group(1).split(","):
                team = raw.strip().strip("'\"")
                if not team:
                    continue
                if team not in teams:
                    errors.append(
                        f"manifest/organization.yaml: executiveOversight entry '{current}' "
                        f"references unknown team '{team}'"
                    )
                    continue
                supervised.setdefault(team, []).append(current)

    # Co-oversight is a deliberate arrangement, so it must be declared. That way a
    # newly duplicated team shows up as an error instead of passing as intentional.
    actual_shared = {team for team, owners in supervised.items() if len(owners) > 1}
    for team in sorted(actual_shared - declared_shared):
        errors.append(
            f"manifest/organization.yaml: team '{team}' is supervised by "
            f"{len(supervised[team])} executives but is not listed in sharedOversight"
        )
    for team in sorted(declared_shared - actual_shared):
        errors.append(
            f"manifest/organization.yaml: sharedOversight lists '{team}' but only "
            f"{len(supervised.get(team, []))} executive supervises it"
        )

    # A team with no executive above it has no escalation path.
    for team in sorted(teams - set(supervised)):
        errors.append(
            f"manifest/organization.yaml: team '{team}' has no executive in executiveOversight"
        )


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
    import shutil
    import os

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

    # A source-tree check alone misses broken references in npm installations.
    required_package_files = {
        "SUPPORT.md", "START-HERE.md", "START-PROMPT.txt",
        "Feedback-STeP-AI.bat", "Feedback-STeP-AI.command",
        "Check-Privacy-STeP-AI.bat", "Check-Privacy-STeP-AI.command",
        "install/privacy-windows.ps1", "install/privacy-macos.sh", "docs/privacy-preflight.md",
        "src/modules/privacy/document.js", "src/modules/privacy/document-worker.js",
        "src/vendor/privacy/manifest.json", "src/vendor/privacy/pdf.mjs", "src/vendor/privacy/pdf.worker.mjs",
        "src/vendor/privacy/fxp.cjs", "src/vendor/privacy/fflate.mjs",
        "docs/step-public-profile.md", "docs/project-code-scheme.md",
        "docs/pilot-runbook.md",
    }
    documents_text = (ROOT / "manifest/documents.yaml").read_text(encoding="utf-8")
    required_package_files.update(re.findall(r"^\s+index:\s*(docs/[^\s]+)\s*$", documents_text, re.MULTILINE))
    for required_file in sorted(required_package_files):
        if not any(required_file == entry or required_file.startswith(entry.rstrip("/") + "/") for entry in files):
            errors.append(f"package.json files omits required local reference: {required_file}")

    # Test npm pack dry-run if npm is available
    npm_command = shutil.which("npm")
    if not npm_command:
        return
    try:
        command = [npm_command, "pack", "--dry-run", "--json", "--cache", str(ROOT / "tmp/npm-validation-cache")]
        res = subprocess.run(
            subprocess.list2cmdline(command) if os.name == "nt" else command,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            shell=os.name == "nt",
            check=False,
        )
        if res.returncode == 0:
            pack_data = json.loads(res.stdout)
            if isinstance(pack_data, list) and pack_data:
                packed_files = [item["path"] for item in pack_data[0].get("files", [])]
                for required_file in sorted(required_package_files - set(packed_files)):
                    errors.append(f"npm pack omits required local reference: {required_file}")
                for pf in packed_files:
                    if pf == "docs/staff-abbreviations.md" or pf.startswith(("artifacts/", "output/", "tmp/")):
                        errors.append(f"npm pack dry-run leaked restricted file: {pf}")
        else:
            errors.append(f"npm pack dry-run failed with exit code {res.returncode}")
    except Exception as exc:
        errors.append(f"Could not verify npm package contents: {exc}")


def main() -> int:
    errors: list[str] = []
    count = validate_skills(errors)
    validate_skill_dependencies(errors)
    validate_router_registry(errors)
    validate_organization_clusters(errors)
    validate_executive_oversight(errors)
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
        "manifest/skill-evals.json",
        "SUPPORT.md",
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

    print(f"Validation passed: {count} skills; local Skill dependencies resolved; router clusters, team/role references organization cluster map and executive oversight valid; no likely secrets detected; package whitelist verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

