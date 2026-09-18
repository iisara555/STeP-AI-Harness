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
- ห้ามอ้างสำเนา QP/WI ว่าเป็น Current Revision จนกว่าจะยืนยันกับ Master Document List
- ถ้ามีเอกสารหลาย revision และยังไม่มี Master Document List ให้ตอบว่า `revision status unverified`
- Quality Record ใช้เป็น evidence ของสิ่งที่เกิดขึ้นจริง แต่ไม่ยกระดับเป็น Organization Rule
- AI Recommendation และ Planning Assumption ต้องไม่ถูกนำเสนอเป็นข้อกำหนดของระบบคุณภาพ
- การประกาศใช้/แก้ไข/ยกเลิกเอกสารควบคุม และการรับรอง QMS conformity เป็น Human Authority

## 4. Current source inventory

| Source | Status in Harness | Usage |
| --- | --- | --- |
| ISO 9001:2015 | user-confirmed current standard | External normative reference |
| STeP Quality Policy V2 — 8 Sep 2026 | user-confirmed current | Organization policy / WHY |
| Quality Manual | **MISSING** | ห้ามเดา scope/process mapping ที่ต้องพึ่ง QM |
| Master Document List | **MISSING** | ห้ามรับรอง current revision ของ QP/WI จากชื่อไฟล์เพียงอย่างเดียว |
| QP-DC-001 Rev.06 | provided, pending Master List verification | Document control framework |
| QP-DC-002 Rev.02 | provided, pending Master List verification | Quality record control |
| QP-QS-001 Rev.00 | provided, pending Master List verification | Risk/opportunity |
| QP-QS-002 Rev.02 | provided, pending Master List verification | Nonconformity |
| QP-QM-001 Rev.02 | provided, pending Master List verification | Corrective/preventive action |
| QP-QM-002 Rev.01 | provided, pending Master List verification | Internal audit |
| QP-QM-003 Rev.03 | provided, pending Master List verification | Management review |
| QP-QM-004 Rev.01 | provided, pending Master List verification | Complaint management |

## 5. Known gaps

### P0 — Quality Manual
ยังขาด Quality Manual ฉบับปัจจุบัน จึงยังไม่ควรให้ AI สรุป QMS scope, exclusions/applicability, process interaction หรือ policy-to-process mapping ในฐานะข้อเท็จจริงของ STeP หากไม่มี source อื่นรองรับ

### P0 — Master Document List
ยังขาด Master Document List ปัจจุบัน จึงยังไม่ควรให้ AI รับรองว่า QP/WI/SD/FM ฉบับใดเป็น Current, Superseded หรือ Obsolete

สอง gap นี้ไม่ block Pilot แต่ต้องแสดงสถานะ `missing-source` และทำให้ AI หยุดก่อน claim ที่ต้องพึ่งข้อมูลดังกล่าว

## 6. Initial Skill mapping

| Skill | Quality sources |
| --- | --- |
| iso9001-audit-readiness | ISO 9001:2015, QP-QM-002, Quality Manual เมื่อได้รับ |
| audit-evidence-matrix | ISO criteria + process evidence + records |
| document-record-control | QP-DC-001, QP-DC-002, Master List เมื่อได้รับ |
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
- เดาว่าเอกสารเป็น current revision เมื่อยังไม่มี Master List
- เปลี่ยน Quality Policy/Objective หรือ target

## 8. Implementation plan

### Now — v0.1
- ใช้ `manifest/documents.yaml` เป็น registry เดิม
- ลง metadata ของ source ที่ได้รับ
- mark Quality Manual และ Master Document List เป็น `missing`
- link Existing Skills กับ source ที่เกี่ยวข้อง
- ใช้ Provenance labels เดิม ไม่เพิ่ม taxonomy ใหม่
- รัน Pilot Smoke Test กับพนักงานจริง

### After QS provides Quality Manual
- เพิ่ม QMS scope/process context เฉพาะข้อมูลที่ QM รองรับ
- map process → QP/WI โดยไม่เพิ่ม Skill ถ้าไม่จำเป็น

### After QS provides Master Document List
- ยืนยัน Current/Superseded/Obsolete
- เติม owner/revision/effective date ของ WI/SD/FM
- เปลี่ยน `provided-unverified` เป็นสถานะที่ยืนยันแล้วเฉพาะรายการที่ match Master List

### Only after real usage shows need
พิจารณา retrieval/indexing เพิ่มเติม แต่ยังไม่ทำ organization-wide vector DB, knowledge graph หรือ autonomous QMS workflow
