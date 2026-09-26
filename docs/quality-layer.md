# STeP Quality Layer v0.1

> สถานะ: Pilot Foundation
>
> เป้าหมาย: ทำให้ STeP AI แยกมาตรฐานภายนอก นโยบายองค์กร เอกสารควบคุม วิธีปฏิบัติงาน และหลักฐานจริงออกจากกัน โดยไม่สร้าง Dimension ใหม่และไม่สร้างฐานความรู้ใหม่ทั้งองค์กร

## 1. ตำแหน่งของ Quality Layer

Quality Layer เป็น cross-cutting source/governance layer ของ Organization AI Harness เดิม

```text
WHO / WHERE / WHAT / WHY / HOW / AUTHORITY
                    │
                    ▼
              Quality Layer
                    │
       Source + Status + Authority
                    │
                    ▼
          Skills + Playbooks
                    │
                    ▼
               Actions/Tools
```

Quality Layer ไม่แทน QS, QMR, Process Owner หรือผู้อนุมัติ และไม่ถือว่า AI มีอำนาจรับรองความสอดคล้องของระบบคุณภาพ

## 2. Source hierarchy ที่ใช้ใน Pilot

โครงสร้างเอกสารภายในอ้างตาม QP-DC-001 ฉบับที่ได้รับจาก QS:

1. Quality Manual (Level 1)
2. Quality Procedure — QP (Level 2)
3. Work Instruction — WI (Level 3)
4. Support Document — SD (Level 4)
5. Form — FM

เหนือเอกสารภายในมีแหล่งอ้างอิง 2 ชั้น:

- External Standard: ISO 9001:2015
- Organization Policy: STeP Quality Policy Version 2, 8 Sep 2026

ส่วน Quality Record คือหลักฐานผลการปฏิบัติงาน ไม่ใช่กฎหรือวิธีปฏิบัติ

## 3. Source resolution rule

เมื่อ AI ใช้ข้อมูลคุณภาพ ให้แยกอย่างน้อยดังนี้:

```text
ISO REQUIREMENT
≠ ORGANIZATION POLICY
≠ QUALITY MANUAL
≠ QUALITY PROCEDURE
≠ WORK INSTRUCTION
≠ FORM / SUPPORT DOCUMENT
≠ QUALITY RECORD
≠ AI RECOMMENDATION
```

กติกา Pilot:

- ห้ามอ้างข้อกำหนดของ STeP ว่าเป็นข้อกำหนดของ ISO ถ้า source เป็นนโยบาย/QP/WI ขององค์กร
- QS แจ้งเมื่อ 25 ก.ย. 2569 ว่าไม่มีหรือไม่ให้ Quality Manual และ Master Document List ทางการ Harness จึงใช้ [Master List ฉบับทำงาน](qms-working-master-list.md) และ [แผนที่ ISO → เอกสาร STeP](qms-working-reference.md) แทน สองไฟล์นี้**ไม่ใช่เอกสารควบคุม**
- อ้าง Rev/วันที่ของ QP จาก Master List ฉบับทำงานได้ แต่ต้องบอกว่า "ตามฉบับที่ QS ส่งมา — ตรวจ Rev ล่าสุดใน STeP MIS ก่อนใช้อ้างอิงทางการ"
- ถ้ามีเอกสารหลาย revision ที่ไม่อยู่ใน Master List ฉบับทำงาน ให้ตอบว่า `revision status unverified`
- Quality Record ใช้เป็น evidence ของสิ่งที่เกิดขึ้นจริง แต่ไม่ยกระดับเป็น Organization Rule
- AI Recommendation และ Planning Assumption ต้องไม่ถูกนำเสนอเป็นข้อกำหนดของระบบคุณภาพ
- การประกาศใช้/แก้ไข/ยกเลิกเอกสารควบคุม และการรับรอง QMS conformity เป็น Human Authority

## 4. Current source inventory

| Source | Status in Harness | Usage |
| --- | --- | --- |
| ISO 9001:2015 | user-confirmed current standard | External normative reference |
| STeP Quality Policy V2 — 8 Sep 2026 | user-confirmed current | Organization policy / WHY |
| Quality Manual | **not-provided** (QS declined 25 ก.ย. 2569) | ใช้ [qms-working-reference.md](qms-working-reference.md) แทน; ห้ามเดา scope 4.3 |
| Master Document List | **not-provided** (QS declined 25 ก.ย. 2569) | ใช้ [qms-working-master-list.md](qms-working-master-list.md) แทน; Rev ล่าสุดตรวจใน STeP MIS |
| Master List ฉบับทำงาน | active-reference (derived) | Rev/วันที่ของ QP ที่ QS ส่งมา |
| แผนที่ ISO → เอกสาร STeP | active-reference (derived) | clause → QP/นโยบาย ใช้แทน QM |
| QP-DC-001 Rev.06 | provided; listed in working Master List (text not in Harness) | Document control framework |
| QP-DC-002 Rev.02 | provided; listed in working Master List (text not in Harness) | Quality record control |
| QP-QS-001 Rev.00 | provided; listed in working Master List (text not in Harness) | Risk/opportunity |
| QP-QS-002 Rev.02 | provided; listed in working Master List (text not in Harness) | Nonconformity |
| QP-QM-001 Rev.02 | provided; listed in working Master List (text not in Harness) | Corrective/preventive action |
| QP-QM-002 Rev.01 | provided; listed in working Master List (text not in Harness) | Internal audit |
| QP-QM-003 Rev.03 | provided; listed in working Master List (text not in Harness) | Management review |
| QP-QM-004 Rev.01 | provided; listed in working Master List (text not in Harness) | Complaint management |

## 5. Known gaps

### P0 — Quality Manual (QS ไม่ให้ — ใช้ฉบับทำงานแทน)
ISO 9001:2015 ไม่บังคับให้มี Quality Manual Harness จึงใช้ [แผนที่ ISO → เอกสาร STeP](qms-working-reference.md) ที่รวบรวมจากนโยบายคุณภาพ V2 และ QP ที่ QS ส่งมา ข้อที่ยังไม่มีเอกสารรองรับ โดยเฉพาะ **ขอบเขต QMS (4.3)** และ exclusions ห้ามเดา ให้ AI ทำคำถามถาม QS ผ่าน `stakeholder-questionnaire`

### P0 — Master Document List (QS ไม่ให้ — ใช้ฉบับทำงานแทน)
[Master List ฉบับทำงาน](qms-working-master-list.md) บอก Rev/วันที่ของ QP 8 ฉบับตามที่ QS ส่งมา แต่ไม่ใช่ทะเบียนควบคุม AI ห้ามรับรองว่าเอกสารใด Current/Superseded/Obsolete อย่างเป็นทางการ ให้ชี้ไปตรวจใน STeP MIS

สอง gap นี้ไม่ block Pilot: Harness ใช้ฉบับทำงานได้ทันที และแสดงข้อจำกัดข้างต้นทุกครั้งที่ claim ต้องพึ่งข้อมูลดังกล่าว

## 6. Initial Skill mapping

| Skill | Quality sources |
| --- | --- |
| iso9001-audit-readiness | ISO 9001:2015, QP-QM-002, แผนที่ ISO → เอกสาร STeP (แทน QM) |
| audit-evidence-matrix | ISO criteria + process evidence + records |
| document-record-control | QP-DC-001, QP-DC-002, Master List ฉบับทำงาน |
| ncr-capa | QP-QS-002, QP-QM-001 |
| qms-risk-opportunity-review | QP-QS-001 |
| quality-objective-kpi-review | STeP Quality Policy V2 + actual KPI records |
| management-review-prep | QP-QM-003 + actual evidence from teams |
| sop-authoring | QP-DC-001 + Process Owner input; AI drafts only |

## 7. Human Authority

AI ช่วย:
- ค้นและสรุป source ที่มี
- ทำ checklist/evidence matrix
- ชี้ gap และ revision uncertainty
- ร่าง WI/SOP/CAPA/action plan
- เตรียม management review

AI ห้ามตัดสินแทน:
- ประกาศใช้ แก้ไข หรือยกเลิก controlled document
- รับรองว่า process/QMS conform กับ ISO อย่างเป็นทางการ
- ปิด NC/CAPA อย่างเป็นทางการ
- รับรองว่าเอกสารเป็น current revision อย่างเป็นทางการ (Master List ฉบับทำงานไม่ใช่ทะเบียนควบคุม)
- เปลี่ยน Quality Policy/Objective หรือ target

## 8. Implementation plan

### Now — v0.1
- ใช้ `manifest/documents.yaml` เป็น registry เดิม
- ลง metadata ของ source ที่ได้รับ
- mark Quality Manual และ Master Document List เป็น `not-provided` (QS declined 25 ก.ย. 2569) และใช้ฉบับทำงานแทน
- link Existing Skills กับ source ที่เกี่ยวข้อง
- ใช้ Provenance labels เดิม ไม่เพิ่ม taxonomy ใหม่
- รัน Pilot Smoke Test กับพนักงานจริง

### ต่อยอดฉบับทำงาน (ไม่ต้องรอ QS ส่งเอกสาร)
- ถาม QS เฉพาะช่องว่าง เช่น ขอบเขต QMS 4.3 และ Rev ล่าสุดของ QP ผ่านแบบสอบถามจาก `stakeholder-questionnaire`
- เมื่อได้คำตอบ ให้แก้ [qms-working-master-list.md](qms-working-master-list.md) / [qms-working-reference.md](qms-working-reference.md) พร้อมวันที่และผู้ตอบ
- ถ้าภายหลัง QS ส่ง QM หรือ Master List ทางการ ให้ลงทะเบียนแทนฉบับทำงานและเปลี่ยนสถานะเป็น `active`

### Only after real usage shows need
พิจารณา retrieval/indexing เพิ่มเติม แต่ยังไม่ทำ organization-wide vector DB, knowledge graph หรือ autonomous QMS workflow
