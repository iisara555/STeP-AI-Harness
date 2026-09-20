---
name: document-record-control
description: ตรวจสถานะเอกสารและบันทึกใน QMS เช่น owner, version, approval, effective date, current/obsolete, retention, access และ traceability โดยแยก Document กับ Record ให้ชัด
standardVersion: 2
---

# STeP Document & Record Control Review

## Purpose

ตรวจสถานะเอกสารและบันทึกในระบบคุณภาพ ให้รู้ว่าอะไรเป็นฉบับปัจจุบัน อะไรถูกยกเลิก และหลักฐานใดยังขาด

หลักสำคัญ: **Document บอกว่าต้องทำอย่างไร Record แสดงว่าเกิดอะไรขึ้นจริง**

## เมื่อควรใช้

- ตรวจ document control หรือ record control
- ตรวจ revision, master list หรือ obsolete document
- ตอบคำถามว่าเอกสารพร้อม audit หรือไม่
- retention, approval หรือ effective date ไม่ชัด

**Anti-trigger:**
- ต้องสร้างหรือแก้ SOP ให้ใช้ `sop-authoring`
- ต้องรวบรวมหลักฐานสำหรับการตรวจ ให้ใช้ `audit-evidence-matrix`
- เอกสารมีข้อมูลส่วนบุคคล ให้ใช้ `data-privacy-compliance`

## Inputs

ขั้นต่ำ:
- รายการเอกสารหรือบันทึกที่ต้องตรวจ
- process ที่เกี่ยวข้อง

ช่วยให้ตรวจได้ครบขึ้นถ้ามี:
- Master document list
- นโยบาย retention ขององค์กร

## Source

- สถานะเอกสารควบคุมต้อง resolve จาก `manifest/documents.yaml` และ Master Document List ขององค์กร
- **ห้าม invent retention period หากไม่มี policy หรือ SOP ที่กำหนด**

**แยกก่อน:**
- **Controlled Document** — สิ่งที่กำหนดวิธีทำงานและ revise ได้ เช่น SOP, WI, Policy, Template, Guideline
- **Record** — หลักฐานของสิ่งที่เกิดขึ้นแล้ว เช่น completed form, meeting record, approval log, training record, test result, service record

## Workflow

**Document Review** — ตรวจ Document ID และชื่อ, Owner, Version/revision, Effective date, Approval evidence, Review date และ review cycle, Current status, จุดใช้งานเข้าถึง current version ได้หรือไม่, obsolete version ถูกป้องกันจาก unintended use หรือไม่, external document หรือ reference ยัง current หรือไม่ และ linked forms/templates ตรง revision หรือไม่

**Record Review** — ตรวจ Record type และ process, ผู้สร้างหรือ source system, วันที่และเวลา, period, traceability ID, completeness, integrity และ correction trail, access และ confidentiality, retention requirement ที่องค์กรกำหนด รวมถึง disposal หรือ archival status ถ้ามี

**สถานะ:**
- **CURRENT** — current, approved, traceable
- **REVIEW-DUE** — ถึงรอบหรือเกินรอบ review
- **OBSOLETE** — superseded หรือยกเลิกแล้ว
- **UNCONTROLLED** — ไม่มี owner, version หรือ approval ตามที่ควรมี
- **RECORD-GAP** — evidence record ที่ควรมีไม่ครบ
- **UNKNOWN** — ข้อมูลไม่พอ

## Output

### Document / Record Control Review

| Item | Type | Owner | Version/Period | Status | Evidence | Gap / Action |
|---|---|---|---|---|---|---|

ตามด้วย:
- Current-use risk
- Obsolete-document risk
- Record gaps
- Review due
- Human action required

## Authority

AI ช่วยได้: ตรวจสถานะ ชี้ความเสี่ยง และสรุป gap

AI ห้าม:
- ประกาศใช้ ยกเลิก หรือแก้ไข controlled document แทนผู้มีอำนาจ — `iso-qms-enactment`
- backdate approval หรือ effective date
- สร้าง signature หรือ approval ที่ไม่มีจริง

## Handoff

- ต้องสร้างหรือแก้ SOP → `sop-authoring`
- มีข้อมูลส่วนบุคคล → `data-privacy-compliance`
- gap กลายเป็นข้อบกพร่อง → `ncr-capa`
- ต้องรวบรวมหลักฐานสำหรับการตรวจ → `audit-evidence-matrix`

พร้อมส่งต่อเมื่อ: ทุกรายการมีสถานะและเจ้าของ และความเสี่ยงจากการใช้เอกสารที่ล้าสมัยถูกระบุแล้ว

## Guardrails

- **ห้ามแก้ record ย้อนหลังให้สวยโดยลบ trace เดิม** หากต้องแก้ต้องรักษา audit trail ตามระบบที่องค์กรใช้
- ห้ามกำหนด retention period เองโดยไม่มี policy รองรับ
- ห้ามระบุว่าเอกสารเป็น current ถ้ายืนยัน approval evidence ไม่ได้

## Method note

เขียนใหม่โดยอาศัยแนวคิด document currency, ownership และ testability จาก smerphy/cyber-grc-agent-skills (`policy-review`, MIT), process evidence จาก RBraga01/Quality-Engineering-Skills (MIT) และ document lifecycle patterns ของ STeP
