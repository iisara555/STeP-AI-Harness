# Repository Visibility & Data Boundary

**As of:** 2026-09-21

**Last documented GitHub visibility:** **PUBLIC** on 2026-09-20; verification on 2026-09-21 was unavailable (authenticated CLI 401, anonymous API 404). Treat tracked material as public-readable until the owner confirms the current model.

**Policy decision:** pending repository owner confirmation before wider organizational rollout.

## Why this matters

A public repository is a public disclosure channel. Access controls described inside Skills, Rules, or README do **not** make tracked Git content private.

Until the repository owner explicitly chooses a different visibility model, every committed file must be treated as public-readable.

## Allowed in the public repository

- application/source code and tests
- generic Skill/Playbook methodology
- synthetic test data
- organization/team/service metadata that is already intentionally public or explicitly approved for publication
- identifiers for controlled sources when exposing the identifier itself has been reviewed as public-safe

## Do not commit to a public repository

- controlled SOP/WI/QA document contents that are not already public
- customer/entrepreneur records or examples containing real PII
- employee personal data, private contact details, performance/HR information
- credentials, tokens, cookies, session material, private keys
- internal-only pricing, budgets, unpublished procurement details, or non-public approval evidence
- confidential partner/vendor material
- internal templates or authority records that have not been approved for public disclosure

## Distribution rule

Employee distribution should use an **organization-approved internal channel**. A public GitHub repository or release being technically downloadable does not make it an approved internal distribution channel.

## Decision required before wider Pilot

Choose one model:

### Model A — Public technical harness
Keep GitHub public, but enforce a strict public-safe boundary. Controlled organization knowledge remains in internal systems and is resolved at runtime by authorized users/connectors.

### Model B — Private organization repository
Move the repository and release artifacts to private/internal access. Before doing so, update installer/updater authentication and release distribution so general staff do not depend on anonymous GitHub access.

Do not mix the two models implicitly.

## Review gate

Before release:
1. confirm repository visibility;
2. confirm release channel;
3. scan tracked content for secrets/PII;
4. review new organization metadata for public-disclosure suitability;
5. keep internal Source of Truth outside the repo unless explicitly approved for publication.

## ข้อมูลที่ถูกกันออกจาก repository โดยเจตนา

บันทึกไว้เพื่อให้ผู้ดูแลรุ่นถัดไปรู้ว่าอะไร "หายไป" เพราะนโยบาย ไม่ใช่เพราะยังไม่ได้ทำ

| ชุดข้อมูล | เหตุผล | สถานะ |
| --- | --- | --- |
| ทำเนียบพนักงาน 22 ทีม (ชื่อ ชื่อเล่น มือถือ Line อีเมล) | PII ของพนักงานทุกคน เผยแพร่สาธารณะไม่ได้ | ไม่นำเข้า repo เจ้าของข้อมูลเก็บเอง |
| KPI/R-KR รายไตรมาสของทีม พร้อมตัวเลขกำไรและรายได้จริง | ตัวเลขผลการดำเนินงานภายใน ยังไม่เผยแพร่ | ไม่นำเข้า repo โครงสร้างตัวชี้วัดใช้ได้ ตัวเลขไม่เก็บ |
| ทะเบียน Stakeholder ในระบบรหัสโครงการ (ชื่อบริษัทคู่สัญญา ผู้ประกอบการที่บ่มเพาะ) | รายชื่อคู่ค้าและผู้รับบริการ เป็นข้อมูลธุรกิจของบุคคลที่สาม | ไม่นำเข้า repo เก็บเฉพาะโครงสร้างรหัสใน docs/project-code-scheme.md |
| เนื้อหาจากระบบภายใน เช่น STeP MIS | ต้องเข้าสู่ระบบ และ repo เป็น public | ลงทะเบียนเป็น pointer เท่านั้น |
| ประกาศฯ หลักเกณฑ์การบริหารงานบุคคลและสวัสดิการพนักงาน พ.ศ. 2569 (ฉบับเต็ม) | มีตารางค่าตอบแทน วงเงินสวัสดิการ และอัตราเบิกจ่ายรายตำแหน่ง | ลงทะเบียนใน documents.yaml + เก็บเฉพาะดัชนีหัวข้อที่ docs/hr-personnel-welfare-index.md |
| ประกาศฯ เส้นทางความก้าวหน้าในสายอาชีพ (Career Path) พ.ศ. 2569 (ฉบับเต็ม) | ตารางเงินเดือนต่ำสุด/สูงสุด และค่าความเชี่ยวชาญ/ค่าตำแหน่งรายขั้น | ลงทะเบียนใน documents.yaml + เก็บเฉพาะดัชนีโครงสร้างขั้นที่ docs/career-path-index.md |

ฐานภายในของกติกานี้คือประกาศฯ พ.ศ. 2569 ข้อ 5.1.14 ที่ห้ามนำข้อมูลของอุทยานฯ และของลูกค้าออกเผยแพร่โดยไม่ได้รับอนุญาต และระบุว่าเป็นความผิดขั้นร้ายแรง (ดู [ดัชนีประกาศฯ](hr-personnel-welfare-index.md)) — เลขข้อนี้คือ 5.1.16 ในฉบับ 2566 ที่ถูกยกเลิกแล้ว

ถ้าจำเป็นต้องให้ AI ใช้ข้อมูลเหล่านี้ ทางเลือกคือเก็บไว้นอก repo แล้วให้ผู้ใช้แนบเป็นราย session หรือย้ายไป repository ส่วนตัวที่กำหนดสิทธิ์แล้ว
