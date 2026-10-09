#!/usr/bin/env python3
"""Validate STeP TeamAI skill structure and catch likely committed secrets."""

from __future__ import annotations

import re
import os
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
    # Prune installed dependencies before traversal, including nested workspaces.
    # Generated desktop bundles contain copies of dependency fixtures as well, and the
    # bundled OCR Python (desktop/ocr-runtime, git-ignored) ships library test keys.
    for directory, children, filenames in os.walk(ROOT):
        relative_dir = Path(directory).relative_to(ROOT)
        children[:] = [name for name in children if name not in {".git", "node_modules", "graphify-out"}
                       and not (relative_dir == Path(".") and name == "tmp")
                       and not (relative_dir == Path("desktop") and name in {"dist", "release", "ocr-runtime"})]
        for filename in sorted(filenames):
            path = Path(directory) / filename
            if path.suffix.lower() not in {".md", ".yaml", ".yml", ".py", ".txt", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".sh", ".ps1", ".json", ".env", ".example", ".command", ".bat"}:
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


# The manifests are read by small line-based parsers (src/modules/role-resolver.js,
# src/modules/router/*.js, src/modules/playbooks, actions, provenance and this
# file), not by a YAML library. Valid YAML outside the subset they understand used
# to be dropped without an error: a block-style `consumers:` list silently removed
# a Skill from every workspace. This lint is an allowlist: every non-blank line has
# to be one of the shapes below, or validation fails with a file:line.
#
#   # comment                  (own line only)
#   key:                       (opens a block; children exactly two spaces deeper)
#   key: value                 (plain or fully quoted scalar, or [a, b] on one line)
#   - key: value               (list of mappings; only where MAPPING_LIST_FIRST_KEY allows)
#   - item                     (list of scalars)
#   body of a block scalar     (only for the (file, key) pairs in BLOCK_SCALAR_KEYS)
#
# Keys are unquoted. Values may not start with a YAML tag, anchor, alias or flow
# map (`!`, `&`, `*`, `{`) except the flow maps in FLOW_MAP_VALUES.
MANIFEST_KEY = r"[A-Za-z0-9_][A-Za-z0-9_.-]*"
MANIFEST_LINE_RE = re.compile(rf"^(?P<dash>- )?(?P<key>{MANIFEST_KEY}):(?: (?P<value>.*))?$")

# Keys the parsers only read as a one-line [a, b] list. A None parent means the
# key is a list wherever it appears in that file; otherwise only under that parent
# (`skills[]` = inside an entry of the `skills:` list).
INLINE_LIST_KEYS: dict[str, dict[str, str | None]] = {
    "actions.yaml": {"preferredTools": None},
    "authority.yaml": {key: None for key in ("triggers", "actions", "objects", "qualifiers")},
    "documents.yaml": {"coOwners": None},
    "organization.yaml": {key: None for key in ("officialChannels", "serviceLinesSourceRefs", "sharedOversight", "sourceRefs", "teams")},
    "playbooks.yaml": {key: None for key in ("consumers", "consumes", "parameters", "produces", "requiredSignals")},
    "processes.yaml": {"consumers": None},
    "roles.yaml": {"knowledge": None, "skills": None},
    "router-index.yaml": {
        **{key: None for key in ("consumers", "fileTypes", "paths", "primary", "requires", "triggers")},
        "intent": "skills[]",
    },
    "services.yaml": {key: None for key in ("aliases", "discoverySources", "highlightInstruments", "processes", "sourceRefs", "supportTeams")},
    "skills.yaml": {key: None for key in ("approvedBy", "domain", "mandatory", "optional", "reviewer", "service")},
    "teams.yaml": {"paths": None, "skills": None, "starterPrompts": None},
}
# Every child of these keys is read as an inline list (playbook signals).
INLINE_LIST_PARENTS = {("playbooks.yaml", "signals")}
# The parsers find list-of-mapping entries by their first key (`  - name:`,
# `  - id:`). An entry that starts with another key is dropped, so the first key
# is fixed, and a list of mappings anywhere else is not supported.
MAPPING_LIST_FIRST_KEY = {
    ("router-index.yaml", "skills"): "name",
    ("teams.yaml", "clusters"): "id",
    ("teams.yaml", "teams"): "id",
    ("roles.yaml", "roles"): "id",
    ("playbooks.yaml", "playbooks"): "id",
    ("playbooks.yaml", "steps"): "id",
    ("provenance.yaml", "types"): "id",
    ("organization.yaml", "executives"): "name",
}
# The JS parsers read a block scalar's body lines as if they were keys, so a
# `consumers: [...]` inside one would change access. Only these are allowed.
BLOCK_SCALAR_KEYS = {("documents.yaml", "summary")}
FLOW_MAP_VALUES = {
    ("router-index.yaml", "escalate"): re.compile(r"^\{\}$"),
    ("router-index.yaml", "human_only"): re.compile(r"^\{\}$"),
    ("skills.yaml", "reviewCycle"): re.compile(r"^\{ months: \d+ \}$"),
}
SKILL_PATH_RE = re.compile(r"^skills/[^\s\"']+/SKILL\.md$")
PLAIN_FORBIDDEN_START = set("!&*{}[]|>%@`#?,\"'")


def _quoted_scalar_error(text: str, *, in_list: bool) -> str | None:
    # in_list: an item inside [a, b], which the parsers split on ',' and cut at ']'.
    """text starts with a quote; it must be exactly one complete quoted scalar."""
    quote = text[0]
    body = text[1:]
    if quote == "'":
        body_check = body[:-1].replace("''", "") if body.endswith("'") else None
    else:
        body_check = body[:-1] if body.endswith('"') else None
    if body_check is None or quote in body_check:
        return "quoted value must be one complete quoted string; nothing may follow the closing quote"
    if quote == '"' and "\\" in body_check:
        return "escape sequences in double-quoted values are not read by the manifest parsers"
    if in_list and any(char in body_check for char in ",[]{}"):
        return "a quoted list item may not contain , [ ] { } (the parsers split on ',' and stop at ']')"
    return None


def _plain_scalar_error(text: str, *, in_list: bool) -> str | None:
    if text[0] in PLAIN_FORBIDDEN_START or text == "-" or text.startswith("- "):
        return f"value may not start with {text[0]!r} (YAML tag, anchor, alias, flow collection, block or quote)"
    if " #" in text:
        return "trailing comment after a value; put comments on their own line"
    if ": " in text or text.endswith(":"):
        return "': ' inside an unquoted value; quote the value"
    if in_list and any(char in text for char in "[]{}"):
        return "unquoted list item may not contain [ ] { }"
    return None


def _scalar_error(text: str, *, in_list: bool = False) -> str | None:
    if not text:
        return "empty list item" if in_list else "empty value"
    if text[0] in "\"'":
        return _quoted_scalar_error(text, in_list=in_list)
    return _plain_scalar_error(text, in_list=in_list)


def _split_flow_items(inner: str) -> list[str] | None:
    """Split the inside of [a, b]; quotes open only at the start of an item."""
    items, current, quote, at_start = [], [], "", True
    for char in inner:
        if quote:
            current.append(char)
            if char == quote:
                quote = ""
            continue
        if char == ",":
            items.append("".join(current).strip())
            current, at_start = [], True
            continue
        if at_start and char in "\"'":
            quote = char
        if not char.isspace():
            at_start = False
        current.append(char)
    if quote:
        return None
    items.append("".join(current).strip())
    return items


def _inline_list_error(value: str) -> str | None:
    if not value.endswith("]"):
        if " #" in value:
            return "trailing comment after a value; put comments on their own line"
        return "inline list must open and close on one line, with nothing after ']'"
    inner = value[1:-1]
    if not inner.strip():
        return None
    items = _split_flow_items(inner)
    if items is None:
        return "unterminated quote in inline list"
    for item in items:
        problem = _scalar_error(item, in_list=True)
        if problem:
            return f"{problem}: {item!r}"
    return None


def _value_error(name: str, key: str, value: str) -> str | None:
    if value.startswith("["):
        return _inline_list_error(value)
    if value.startswith("{"):
        allowed = FLOW_MAP_VALUES.get((name, key))
        if allowed and allowed.match(value):
            return None
        return "flow mapping {...} is not read by the manifest parsers; use key: lines"
    return _scalar_error(value)


def lint_manifest_text(name: str, text: str) -> list[str]:
    errors: list[str] = []
    # Open containers: dicts with indent, kind ('map' | 'seq'), label and keys seen.
    stack: list[dict] = [{"indent": 0, "kind": "map", "label": "", "keys": set()}]
    pending: dict | None = None  # a `key:` with no value, waiting for its children
    skip_deeper_than: int | None = None  # children of a rejected or block-scalar key

    def container(indent: int, kind: str, label: str) -> dict:
        frame = {"indent": indent, "kind": kind, "label": label, "keys": set()}
        stack.append(frame)
        return frame

    lines = text.split("\n")
    for index, raw in enumerate(lines):
        number = index + 1
        where = f"manifest/{name}:{number}"
        if raw.endswith("\r") and index == len(lines) - 1:
            errors.append(f"{where}: lone carriage return is not supported; use LF or CRLF line endings")
            continue
        line = raw[:-1] if raw.endswith("\r") else raw
        if "\r" in line:
            errors.append(f"{where}: lone carriage return is not supported; use LF or CRLF line endings")
            continue
        if not line.strip():
            continue
        body = line.lstrip(" ")
        indent = len(line) - len(body)
        if skip_deeper_than is not None:
            if indent > skip_deeper_than:
                continue
            skip_deeper_than = None
        if "\t" in line:
            place = "indentation" if body.startswith("\t") else "line"
            errors.append(f"{where}: tab in {place}; use spaces")
            continue
        if body.startswith("#"):
            continue
        if indent % 2:
            errors.append(f"{where}: indentation of {indent} spaces; use multiples of 2")
            continue

        if pending is not None:
            opener, pending = pending, None
            if indent != opener["indent"] + 2:
                if indent <= opener["indent"]:
                    errors.append(f"manifest/{name}:{opener['number']}: '{opener['key']}' has no value; write it on the same line")
                else:
                    errors.append(f"{where}: indentation of {indent} spaces under '{opener['key']}'; children go exactly 2 deeper ({opener['indent'] + 2})")
                    skip_deeper_than = opener["indent"]
                    continue
            else:
                kind = "seq" if body == "-" or body.startswith("- ") else "map"
                container(indent, kind, opener["key"])

        while len(stack) > 1 and stack[-1]["indent"] > indent:
            stack.pop()
        frame = stack[-1]
        if frame["indent"] != indent:
            errors.append(f"{where}: indentation of {indent} spaces does not line up with the enclosing block ({frame['indent']})")
            skip_deeper_than = frame["indent"]
            continue

        match = MANIFEST_LINE_RE.match(body)
        is_dash = body == "-" or body.startswith("- ")
        if is_dash != (frame["kind"] == "seq"):
            expected = "a '- ' list item" if frame["kind"] == "seq" else "a 'key: value' line"
            errors.append(f"{where}: expected {expected} here")
            continue

        if is_dash and not match:
            item = body[2:] if body.startswith("- ") else ""
            if (name, frame["label"]) in MAPPING_LIST_FIRST_KEY:
                errors.append(f"{where}: entries of '{frame['label']}' must start with '- {MAPPING_LIST_FIRST_KEY[(name, frame['label'])]}:'")
                continue
            problem = _scalar_error(item) if item else "empty list item"
            if problem:
                errors.append(f"{where}: {problem}")
            continue

        if not match:
            errors.append(f"{where}: not a supported manifest line (unquoted 'key: value', '- item' or '# comment' only)")
            continue

        key, value = match.group("key"), match.group("value")
        value = "" if value is None else value
        if value != value.strip() or (match.group("value") is not None and not value):
            errors.append(f"{where}: '{key}' has stray whitespace around its value")
            continue
        key_indent = indent
        if match.group("dash"):
            first = MAPPING_LIST_FIRST_KEY.get((name, frame["label"]))
            if first is None:
                errors.append(f"{where}: a list of mappings under '{frame['label']}' is not read by the manifest parsers")
                skip_deeper_than = indent
                continue
            if key != first:
                errors.append(f"{where}: entries of '{frame['label']}' must start with '- {first}:'; the parsers drop this entry")
                skip_deeper_than = indent
                continue
            key_indent = indent + 2
            frame = container(key_indent, "map", f"{frame['label']}[]")

        if name == "authority.yaml" and frame["label"] == "authorities" \
                and not re.fullmatch(r"[a-z0-9-]+", key):
            errors.append(f"{where}: authority identifier '{key}' is not read by the JS parser; use lowercase letters, digits and hyphens")
        if key in frame["keys"]:
            errors.append(f"{where}: duplicate key '{key}'")
        frame["keys"].add(key)

        list_keys = INLINE_LIST_KEYS.get(name, {})
        must_be_list = (key in list_keys and list_keys[key] in (None, frame["label"])) \
            or (name, frame["label"]) in INLINE_LIST_PARENTS
        if must_be_list and not value.startswith("["):
            errors.append(f"{where}: '{key}' must be an inline list [a, b] on the same line; block lists and other values are not read by the manifest parsers")
            skip_deeper_than = key_indent
            continue

        if not value:
            pending = {"indent": key_indent, "key": key, "number": number}
            continue
        if value[0] in ">|":
            if (name, key) in BLOCK_SCALAR_KEYS and value in (">", ">-", "|", "|-"):
                skip_deeper_than = key_indent
                continue
            errors.append(f"{where}: block scalar ('{value}') on '{key}' is not read by the manifest parsers; write the value on one line")
            skip_deeper_than = key_indent
            continue
        if name == "skills.yaml" and key == "path":
            if value[:1] in "\"'":
                errors.append(f"{where}: 'path' must be unquoted")
                continue
            if not SKILL_PATH_RE.match(value):
                errors.append(f"{where}: 'path' must be skills/<...>/SKILL.md on one line")
                continue
        problem = _value_error(name, key, value)
        if problem:
            label = f"'{key}' " if value.startswith("[") else ""
            errors.append(f"{where}: {label}{problem}")
    if pending is not None:
        errors.append(f"manifest/{name}:{pending['number']}: '{pending['key']}' has no value; write it on the same line")
    return errors


def validate_manifest_subset(errors: list[str]) -> None:
    for path in sorted((ROOT / "manifest").glob("*.yaml")):
        # Path.read_text() uses universal newlines and conceals lone CR bytes.
        # The JS loaders split only on LF/CRLF, so lint the exact decoded bytes.
        errors.extend(lint_manifest_text(path.name, path.read_bytes().decode("utf-8")))


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
        "docs/knowledge/step-public-profile.md", "docs/knowledge/project-code-scheme.md",
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
    validate_manifest_subset(errors)
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

