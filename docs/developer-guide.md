# คู่มือผู้ดูแลและนักพัฒนา STeP AI

[หน้าแนะนำ STeP AI](../README.md) อธิบายประโยชน์และวิธีเริ่มใช้งานสำหรับพนักงาน คู่มือนี้เก็บรายละเอียด source, การพัฒนา, การแจกจ่าย และการดูแล Skills ไว้สำหรับผู้ดูแลและนักพัฒนา

## Version / inventory

คู่มือนี้อ้างอิง Harness source **v0.7.7** และ STeP Desktop **v0.5.34**

| รายการใน Harness source | จำนวน |
| --- | --- |
| ทีม | **22 ทีม** |
| กลุ่ม routing | **5 กลุ่ม** |
| Skills | **53 Skills** |
| Playbooks | **5 Playbooks** |
| Actions | **4 Actions** |

Router มีเส้นทางเลือก Skill 52 รายการ ส่วน `step-router` เป็น routing/orchestration Skill

ต้นทาง: [Skills](../manifest/skills.yaml) · [Router index](../manifest/router-index.yaml) · [Playbooks](../manifest/playbooks.yaml) · [Actions](../manifest/actions.yaml)

ตารางนี้นับจาก source ไม่ใช่รายการรับรองของ ZIP ที่พนักงานได้รับ

## สถาปัตยกรรมโดยย่อ

```text
STeP Desktop GUI
      ↓
Current task / source
      ↓
Router
      ↓
Skill / Playbook
      ↓
Source readiness
      ↓
Authority + Privacy
      ↓
Provider
      ↓
Proposal / verified output
```

อ่านต่อ: [Architecture](architecture.md) · [Router](step-router.md) · [Playbooks](playbooks.md)

## Repository visibility

repository นี้มีสถานะ **Public** จึงห้าม commit เอกสารภายใน, credential, token, ข้อมูลพนักงาน หรือข้อมูลลูกค้าที่ไม่ควรเผยแพร่

เผยแพร่แบบ open source ภายใต้ [MIT License](../LICENSE) ทั้ง Harness, STeP Desktop และ STeP Skills ไฟล์ของบุคคลที่สามใน `src/vendor/privacy/` (ฟอนต์และ cmaps) ใช้ license ของตัวเองตามไฟล์ LICENSE ในโฟลเดอร์นั้น ภาพตราครุฑมี [ที่มาและเงื่อนไขแยก](third-party-notices/thai-garuda.md) และไม่ได้เปลี่ยน license เป็น MIT

## Release

ชุดติดตั้งที่แจกพนักงานมาจาก **release tag เท่านั้น** ไม่ใช่จาก `main`

การมี build หรือ GitHub Release ไม่ได้แปลว่าอนุมัติให้พนักงานใช้แล้ว ผู้ดูแลต้องผ่าน Release Gate และแจกผ่านช่องทางภายในที่อนุมัติ

ดู: [Pilot Operations](pilot-operations.md) · [Pilot Runbook](pilot-runbook.md) · [CHANGELOG](../CHANGELOG.md)

## Development

Harness:

```sh
npm test
npm run validate
```

Desktop:

```sh
npm --prefix desktop ci
npm run desktop:build
npm run desktop:test
npm run desktop:start
```

รายละเอียด packaging และข้อจำกัดของ Electron build อยู่ใน [Desktop development](desktop-development.md)

ผลตรวจโครงสร้างและการทำงานพร้อมกัน: [Runtime refactor review](refactor-review.md)

## ความรู้ขององค์กรกับเอกสารพัฒนา

ความรู้ขององค์กรที่ AI ใช้ตอบคำถามเรื่อง STeP อยู่ใน [`docs/knowledge/`](knowledge/README.md) เท่านั้น ส่วนเอกสารอื่นใน `docs/` เป็นคู่มือผู้ใช้หรือเอกสารพัฒนา harness ดูรายการทั้งหมดใน [แผนที่เอกสาร](README.md) เอกสารความรู้ใหม่ต้องวางใน `docs/knowledge/` และลงทะเบียนใน `manifest/documents.yaml` ห้ามวางเอกสารพัฒนาหรือผลทดสอบไว้ในโฟลเดอร์นั้น

## ดูแล STeP Skills plugin

ไฟล์ใน `plugins/step/` สร้างจาก `skills/`, `rules/`, `docs/` และ `manifest/` ด้วย `node scripts/build-claude-plugin.mjs` ห้ามแก้ใน `plugins/step/` โดยตรง หลังแก้ Skill ให้รันสคริปต์นี้ทุกครั้ง (`npm test` ตรวจว่า plugin ตรงกับต้นฉบับ) กติกาที่ขึ้นต้นทุกแชตแก้ที่ `plugin/session-brief.md` ส่วน `scripts/install-agent-skills.mjs` ลงชุดเดียวกันให้ Codex (กติกา) และ Antigravity (global หรือราย workspace)

Claude และ Codex ดึง plugin จาก `main` ของ repository นี้ การ merge เข้า `main` จึงเท่ากับปล่อย Skills รุ่นใหม่ให้คนที่ติดตั้ง plugin

## ช่องทางที่เลิกใช้แล้ว

- **ชุด ZIP + CLI `step-ai`** (`Install-STeP-AI.bat` / `.command`, `Update-STeP-AI.*`, `START-HERE.md`, `OPEN-IN-CODEX.md`) — เลิกแจกพนักงานใหม่แล้ว ถ้าดับเบิลคลิก `Install-STeP-AI` หรือ `Update-STeP-AI` ในชุดที่ดาวน์โหลดจาก GitHub ตัวเก่าจะบอกว่าเลิกใช้แล้วและเปิด `Setup-STeP-Skills` แทน (ชุด ZIP ของ Pilot ไม่มี Setup จึงทำงานแบบเดิม) ห้ามใช้ `export-ignore` ซ่อนไฟล์ เพราะ plugin directory ไม่รับ repository ที่มีกฎนี้ โค้ดยังอยู่เพราะ Router และ Skills ใน `src/` เป็นแกนที่ STeP Desktop ใช้ร่วม และผู้ทดสอบ Pilot รุ่นเก่ายังอัปเดตได้ ผู้ใช้เดิมให้ย้ายไป [STeP Desktop](../desktop/README.md) หรือ [STeP Skills](../plugins/step/README.md)
- **Gemini CLI extension** — ถอดออกแล้ว Google หยุดให้บริการ Gemini CLI กับบัญชีส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 ใช้ Antigravity แทน
- **LINE gateway** (`gateway/line/`) — โค้ดทดลอง ยังไม่เคยเปิดใช้และไม่ใช่ช่องทางสำหรับพนักงาน

---
