# Legacy Proposal → Current Harness Mapping

**As of:** 2026-09-20  
**Scope:** repository `main` after Skill authoring hardening  
**Purpose:** reconcile the 2026-09-14 proposal report with the current installed Harness.  
**Important:** names in `STeP-Context-and-Skills-Review.md` were proposals, not evidence that a standalone Skill must exist.

Status:
- **DIRECT** — current Skill exists with the same/near-equivalent responsibility.
- **COMPOSITE** — current capability is intentionally split across existing Skills/Registry/Playbook.
- **GAP-CANDIDATE** — distinct need may remain; create only after owner + real examples confirm reuse.

| Legacy proposal | Current implementation | Status | Note |
|---|---|---|---|
| service-intake / service-intake-and-triage | `customer-support-faq-triage` + `manifest/services.yaml` | COMPOSITE | Intake + service routing now use Service Registry. |
| procurement-readiness | `tor-review` + `receipt-audit` | COMPOSITE | Procurement readiness was split by evidence type. |
| partner-brief | `decision-memo` + `step-writing` | GAP-CANDIDATE | No partner-specific atomic Skill yet; confirm IASA examples first. |
| quality-evidence-review | `audit-evidence-matrix` + `evidence-before-approval` | COMPOSITE | Evidence matrix and completion verification are separate. |
| network-report-consolidation | `executive-status-update` + `team-weekly-review` | COMPOSITE | Choose based on executive vs operational cadence. |
| lesson-to-playbook | `sop-authoring` + `learning-designer` + `step-skill-authoring` | COMPOSITE | Knowledge capture, learning, and reusable Skill authoring are distinct. |
| role-onboarding | `learning-designer` | DIRECT | Use role/process evidence as inputs. |
| technology-opportunity-brief | `industry-problem-discovery` + `expert-resource-matching` + `decision-memo` | COMPOSITE | Discovery → resource fit → decision framing. |
| technology-offer | `expert-resource-matching` + `decision-memo` | GAP-CANDIDATE | Commercial offer claims/format need Tech owner evidence before a dedicated Skill. |
| industry-needs-discovery | `industry-problem-discovery` | DIRECT | Current Skill is the successor. |
| area-project-design | `project-plan` + `decision-memo` | GAP-CANDIDATE | Area-based methodology needs PUBSEC owner examples before specialization. |
| market-test-plan | `market-signal-radar` + `voice-of-customer` + `startup-discovery` | COMPOSITE | Market evidence and customer discovery intentionally separated. |
| prototype-validation-brief | `project-plan` + `lab-result-review` | GAP-CANDIDATE | Need Tech/Lab examples to define a reusable validation contract. |
| entrepreneur-workshop | `learning-designer` + `startup-discovery` | COMPOSITE | Workshop design uses learning outcome + startup discovery content. |
| mentor-action-plan | `meeting-to-action-plan` + `project-plan` | COMPOSITE | Mentoring-specific vocabulary does not require a Skill yet. |
| service-match-and-followup | `customer-support-faq-triage` + Service Registry | COMPOSITE | Service owner confirmation remains required. |
| verified-service-response | `customer-support-faq-triage` + Service Registry + `evidence-before-approval` | COMPOSITE | Verified response is a composition, not a separate truth source. |
| space-use-brief | `browser-form-assistant` + `facility-space` Service Registry entry | COMPOSITE | Draft/booking action remains gated. |
| facility-issue-brief | `customer-support-faq-triage` + Service Registry | GAP-CANDIDATE | Confirm IFU incident categories/SLA before specialization. |
| lab-request-readiness | `expert-resource-matching` + `lab-result-review` | COMPOSITE | Resource discovery and result review are separate phases. |
| lab-report-consistency | `lab-result-review` | DIRECT | Current successor. |
| pilot-production-brief | `project-plan` + FOODFABR Service Registry entry | COMPOSITE | Production-specific fields should come from owner source. |
| designer-brief | `designer-brief` | DIRECT | Installed directly. |
| production-handoff | `evidence-before-approval` + relevant Creative Skill | GAP-CANDIDATE | A true cross-production handoff contract still needs CC examples. |
| innovation-portfolio-brief | `executive-status-update` + `decision-memo` | COMPOSITE | Portfolio reporting + decision framing. |
| change-initiative-review | `project-pre-mortem` + `decision-memo` | COMPOSITE | Risk challenge then decision memo. |
| cross-team-handoff | no dedicated atomic Skill | GAP-CANDIDATE | Distinct need remains plausible; require sender/receiver examples and acceptance criteria before creating. |
| project-evidence-pack | `audit-evidence-matrix` + `document-record-control` + `evidence-before-approval` | COMPOSITE | Evidence collection/control/verification are intentionally separated. |
| lesson/playbook feedback flow | `step-skill-authoring` + `skill-to-pilot` | DIRECT | Current meta-flow handles reusable Skill improvements. |

## Pilot reconciliation

The old recommended order is **not an installation checklist**.

For current Pilot:
1. use current Skills/Playbooks where mapping is DIRECT/COMPOSITE;
2. do not create a duplicate Skill only to match a legacy name;
3. for GAP-CANDIDATE items, collect at least one real sender/receiver example, expected output, owner, and failure case;
4. run `step-skill-authoring` before adding any new Skill.

The first gap worth validating with real usage is `cross-team-handoff`, because it represents an organizational handoff contract rather than a renamed existing capability.
