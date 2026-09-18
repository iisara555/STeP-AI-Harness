# STeP Organization AI Harness — Lightweight Foundation

เอกสารนี้กำหนดส่วนเสริมของ Harness ที่ใช้ร่วมกับ Organization Model 6 มิติเดิม โดย **ไม่เพิ่ม Dimension ใหม่** และไม่สร้าง Workflow Engine ใหม่

## โครงสร้าง

```text
WHO / WHERE / WHAT / WHY / HOW / AUTHORITY
                    │
                    ▼
          Skills + Playbooks
                    │
                    ▼
          Actions / Capabilities
                    │
                    ▼
                 Tools
```

สิ่งที่ครอบทุกชั้นคือ Source/Provenance, Human Authority, Security, Run Log และ Feedback

## 1. Tool / Action Registry

ไฟล์กลาง: `manifest/actions.yaml`

Action คือการทำให้เกิดผลจริง เช่น สร้าง Spreadsheet หรือ Submit แบบฟอร์ม ไม่ใช่ Skill

แต่ละ Action ระบุอย่างน้อย:
- `capability`
- `risk`
- `sideEffect`
- `confirmation`
- `preferredTools`
- เงื่อนไข output reference เมื่อจำเป็น

Playbook ยังคงอ้าง `action` ตามเดิม แต่ validator จะตรวจว่ามี Action นั้นใน Registry จริง

## 2. Source / Provenance

ไฟล์กลาง: `manifest/provenance.yaml`

มาตรฐานใช้ 6 label:
- `SOURCE_FACT`
- `DERIVED_FACT`
- `USER_INPUT`
- `PLANNING_ASSUMPTION`
- `ORGANIZATION_RULE`
- `AI_RECOMMENDATION`

เป้าหมายคือไม่ให้ AI นำ Planning Assumption หรือ Recommendation ไปเขียนปะปนเป็นข้อเท็จจริง โดยเฉพาะ TOR, งบประมาณ, ISO, ระเบียบ และเอกสารราชการ

Run State สามารถเก็บ provenance records ได้ใน `context.provenance`

## 3. Lightweight Run Log

Playbook Run State ยังคงอยู่ที่:

`.step-ai/runs/<run-id>/state.json`

Run State v3 เพิ่มเพียง:
- `events` — เหตุการณ์สำคัญ เช่น run-created, step-completed, action-resolved
- `context.provenance` — แหล่งที่มาของข้อเท็จจริง/สมมติฐาน
- `feedback` — feedback สั้น ๆ ที่ผูกกับ Run ได้

ไม่เก็บ password, token, cookie, MFA หรือ PII ที่ไม่จำเป็น

## 4. Feedback Loop

Feedback ช่วง Pilot ควรตอบคำถามง่าย ๆ:
- ผลลัพธ์ใช้ได้หรือไม่
- ต้องแก้มากน้อยแค่ไหน
- ปัญหาเกิดจาก Skill, Router, Source หรือ Tool
- มีตัวอย่างที่ถูกต้องให้ทีมปรับ Skill หรือไม่

Run-level feedback ไม่แทนระบบ `FEEDBACK.md` เดิม แต่ช่วยเชื่อม usage จริงกับการปรับ Skill/Playbook

## สิ่งที่ยังไม่ทำใน Foundation นี้

- Multi-agent orchestration
- Central control-plane dashboard
- Vector database ทั้งองค์กร
- Workflow designer
- Autonomous cross-system execution

ให้เพิ่มสิ่งเหล่านี้เมื่อ Pilot usage แสดงความจำเป็นจริงเท่านั้น


## 5. Quality Layer

เอกสารหลัก: `docs/quality-layer.md`

Quality Layer ใช้ `manifest/documents.yaml` เดิมเป็น Controlled Source Registry โดยไม่เพิ่ม Dimension ใหม่

หน้าที่หลัก:
- แยก External Standard / Organization Policy / QM / QP / WI / Form / Record
- เก็บ revision/effective date/source status เท่าที่มีหลักฐาน
- mark `Quality Manual` และ `Master Document List` เป็น known gaps จนกว่า QS จะส่ง source ปัจจุบัน
- ไม่รับรอง Current Revision ของ QP/WI จากชื่อไฟล์เพียงอย่างเดียว
- link QMS Skills เดิมกับ source ที่เกี่ยวข้อง แทนการสร้าง Skill ซ้ำ

Pilot ของ Quality Layer ใช้ checklist ที่ `docs/quality-pilot-smoke-test.md` และตัดสินการพัฒนาต่อจาก usage จริง


## 6. Lightweight Privacy Gate

Privacy Gate เป็น cross-cutting safeguard ของ Harness เดิม ไม่ใช่ Dimension ใหม่และไม่ใช่ Workflow Engine

```text
Input
  ↓
Quick Local Scan
  ↓
Public/Internal ─────────────→ ใช้งานต่อ
Restricted ──────────────────→ Auto-mask → AI
Sensitive / High Risk ───────→ Human Confirmation / Block external AI
```

หลัก Pilot:
- local-first ด้วย regex/heuristic ก่อนเรียก model
- ไม่ OCR PDF/รูปภาพทั้งชุดโดยอัตโนมัติ
- cache ผล scan ตาม hash เพื่อลด latency
- allowlist เลขประจำตัวองค์กรที่เป็นข้อมูลสาธารณะและจำเป็นต่อ Task ได้
- Run State เก็บเฉพาะ privacy metadata เช่น hash/class/action/redaction status
- query และ feedback ที่จะ persist ต้องผ่าน redaction ก่อน
- Raw PII ไม่ควรถูกเก็บใน Run Log

คำสั่งตรวจแบบ local:
`step-ai privacy --file sample.txt --redact`

สำหรับ PDF/รูปภาพ ให้ AI client หรือตัวอ่านเอกสาร local สกัดเฉพาะส่วนที่จำเป็นก่อน ไม่ทำ OCR อัตโนมัติทั้งไฟล์
