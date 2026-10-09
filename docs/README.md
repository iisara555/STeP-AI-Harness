# แผนที่เอกสาร STeP AI

เอกสารในโฟลเดอร์ `docs/` แบ่งเป็น 3 กลุ่ม ซึ่งเก็บแยกกันและอ่านต่างกัน

| กลุ่ม | ใครอ่าน | อยู่ที่ |
| --- | --- | --- |
| **1. ความรู้ขององค์กร** | AI ใช้ตอบคำถามเรื่อง STeP และพนักงานใช้ตรวจที่มา | [`docs/knowledge/`](knowledge/README.md) |
| **2. คู่มือผู้ใช้และผู้ดูแล** | พนักงาน และผู้ดูแลที่ติดตั้งหรือตั้งค่าให้ทีม | รายการด้านล่าง |
| **3. เอกสารพัฒนา harness** | นักพัฒนาที่แก้ STeP Desktop, Router, Skills หรือการทดสอบ | รายการด้านล่าง |

กลุ่ม 1 เป็น **ข้อมูลขององค์กร** (ระเบียบ สวัสดิการ ทีม ผู้บริหาร ISO งาน AFP) กลุ่ม 2 และ 3 เป็น **เอกสารเกี่ยวกับตัวโปรแกรม** ไม่ใช่ความรู้ขององค์กร และไม่ควรใช้ตอบคำถามเรื่องงานของ STeP

## 1. ความรู้ขององค์กร

ดูรายการทั้งหมดและกติกาการเพิ่มเอกสารใน [docs/knowledge/README.md](knowledge/README.md)

## 2. คู่มือผู้ใช้และผู้ดูแล

| เอกสาร | ใช้เมื่อ |
| --- | --- |
| [คู่มือ STeP Desktop](../desktop/README.md) | ติดตั้ง เชื่อมต่อ AI ทำงาน อัปเดต และถอนการติดตั้ง |
| [คู่มือการใช้งาน STeP AI สำหรับพนักงาน](employee-guide.md) | ใช้ STeP Skills ผ่านโปรแกรม AI ที่มีอยู่ |
| [ติดตั้งโปรแกรม AI](ai-app-setup.md) | เครื่องยังไม่มีโปรแกรม AI สำหรับเปิดโฟลเดอร์ STeP AI |
| [เชื่อม Gemini ผ่าน Antigravity](antigravity-connect-th.md) | เชื่อมบัญชี Google ใน STeP Desktop |
| [แพ็กเกจ Claude ผ่าน Claude Code](claude-subscription.md) | ผู้ดูแลเปิดให้นักพัฒนาใช้แพ็กเกจ Claude ของตัวเอง |
| [Usage ของบัญชี AI](desktop-provider-usage.md) | อ่านหน้าการใช้งาน AI โควตา และเครดิต |
| [กล่องบทเรียน (Learning Inbox)](desktop-learning.md) | ตรวจและอนุมัติบทเรียนที่ AI เสนอจากงานจริง |
| [ตรวจไฟล์ก่อนแนบให้ AI](privacy-preflight.md) | ตรวจข้อมูลอ่อนไหวก่อนแนบเอกสาร |
| [STeP Desktop managed policy](desktop-policy.md) | ผู้ดูแลกำหนดบริการ AI ฟังก์ชัน และการตรวจข้อมูลให้ทั้งเครื่อง |
| [Google Workspace connector](google-workspace-connector.md) | เชื่อม Google Workspace (เลือกใช้ แยกจากแอป) |
| [Pilot 22 กันยายน 2569](pilot-runbook.md), [Pilot Operations](pilot-operations.md) | ดำเนินการทดลองใช้กับพนักงาน |
| [เริ่ม Demo AFP](afp-demo-start.md), [คู่มือเดิน Demo](afp-demo-run-sheet.md), [แนวคิดสาธิต](afp-demo-concepts.md), [ทะเบียนแหล่งอ้างอิงสาธิต](afp-demo-source-register.md) | สาธิตงาน AFP ด้วยข้อมูลตัวอย่าง |

## 3. เอกสารพัฒนา harness

เริ่มที่ [คู่มือผู้ดูแลและนักพัฒนา](developer-guide.md) และ [STeP Desktop development reference](desktop-development.md)

**สถาปัตยกรรมและกติกาของ harness**

- [Architecture Reference](architecture.md), [Lightweight Foundation](harness-foundation.md), [7 แกนคุณภาพ](harness-quality-axes.md)
- [Router และ Organization Knowledge Architecture](step-router.md), [Playbooks](playbooks.md), [Action verification](action-verification.md)
- [Knowledge Policy](knowledge-policy.md), [Repository Data Boundary](repository-data-boundary.md), [Roles and Ownership](roles-and-ownership.md)
- [Quality Layer](quality-layer.md), [Quality Pilot Smoke Test](quality-pilot-smoke-test.md)
- [Context Efficiency](context-efficiency.md), [Context and provider performance](context-performance.md)

**Skills และงานเอกสาร**

- [Skill Authoring Standard](skill-authoring-standard.md), [Skill Quality Baseline](skill-quality-baseline.md), [Legacy Skill Mapping](legacy-skill-mapping.md)
- [การเชื่อมโยง Skill ภาษาไทย](thai-skill-connections.md), [วันที่ เลขไทย และจำนวนเงิน](thai-data-formatting.md), [วิธีการจากชุมชน](third-party-methods.md)
- [Document coauthoring](document-coauthoring.md), [Office workflows](office-workflows.md), [ตรวจงานร่างเอกสารและส่งออก](document-drafting-review.md)
- Action contracts: [TOR → Project Plan](tor-to-project-plan.md), [Spreadsheet Project Plan](spreadsheet-project-plan.md), [Agenda → Run of Show](event-run-of-show.md), [Spreadsheet Run of Show](spreadsheet-run-of-show.md)
- สไตล์การพูด: [ภาษาเหนือ](speaking-styles/northern-thai.md), [Ob-Oon](speaking-styles/ob-oon.md), [Witty](speaking-styles/witty.md)

**STeP Desktop**

- [Governed tool loop](desktop-tool-loop.md), [Native workflows](desktop-workflows.md), [Context, memory and sessions](desktop-context-memory.md)
- [Coordinator, scheduled drafts, MCP and autopilot](desktop-automation.md), [Agent Browser](desktop-browser-agent.md), [Interface language](desktop-i18n.md)
- [Providers, command surfaces and LINE gateway](desktop-phase5.md), [Scoped consent](desktop-phase6.md), [Security review 2026-10-06](desktop-security-review.md)
- บริการ AI: [Antigravity adapter](antigravity-adapter.md), [ChatGPT and Gemini follow-up](chatgpt-gemini-oauth-followup.md), [Claude Code OAuth follow-up](claude-oauth-followup.md), [OAuth แบบ Hermes](hermes-oauth-research.md)

**การทดสอบและผลประเมิน**

- [Pilot 30 งาน](pilot-30-task-test.md), [ผลฝั่งโมเดลรอบ 1](pilot-30-model-side-results-2026-09-19.md), [Pilot Readiness Audit](pilot-readiness-audit.md)
- [Tool usability evaluation](tool-usability-eval.md), [ประเมิน Office Skills ด้วย ChatGPT/Codex](cloud-model-eval-setup.md)
- [UX audit 2026-10-01](ux-audit-2026-10-01.md), [ผลแก้ UX audit](ux-audit-fixes-2026-10-01.md), [UI review 0.5.31](desktop-ui-review-0.5.31.md), [Runtime structure review](refactor-review.md)
- [Graphify developer workflow](graphify-development.md), [OpenHarness handoff](openharness-handoff.md), [OpenHarness parity](openharness-parity.md)

**ลิขสิทธิ์ของบุคคลที่สาม:** [ภาพตราครุฑ](third-party-notices/thai-garuda.md), [Claude Thai Skills (MIT)](third-party-notices/claude-thai-skills-MIT.txt)
