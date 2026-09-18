---
name: document-record-control
description: ตรวจสถานะเอกสารและบันทึกใน QMS เช่น owner, version, approval, effective date, current/obsolete, retention, access และ traceability โดยแยก Document กับ Record ให้ชัด
---

# STeP Document & Record Control Review

> **Document tells people what to do. Record shows what actually happened.**

## ใช้เมื่อ
- document control / record control
- ตรวจ revision, master list, obsolete document
- เอกสารพร้อม audit หรือไม่
- retention / approval / effective date ไม่ชัด

## แยกก่อน: Document vs Record

### Controlled Document
สิ่งที่กำหนดวิธีทำงานและอาจ revise ได้ เช่น SOP, WI, Policy, Template, Guideline

### Record
หลักฐานของสิ่งที่เกิดขึ้นแล้ว เช่น completed form, meeting record, approval log, training record, test result, service record

ห้าม “แก้ record ย้อนหลังให้สวย” โดยลบ trace เดิม หากต้องแก้ต้องรักษา audit trail ตามระบบที่องค์กรใช้

## Document Review

ตรวจ:
- Document ID / ชื่อ
- Owner
- Version / revision
- Effective date
- Approval evidence
- Review date / review cycle
- Current status
- จุดใช้งานเข้าถึง current version หรือไม่
- obsolete version ถูกป้องกันจาก unintended use หรือไม่
- external document/reference ยัง current หรือไม่
- linked forms/templates ตรง revision หรือไม่

## Record Review

ตรวจ:
- Record type / process
- ผู้สร้าง / source system
- วันที่/เวลา
- period
- traceability ID
- completeness
- integrity / correction trail
- access / confidentiality
- retention requirement ที่องค์กรกำหนด
- disposal/archival status ถ้ามี

ห้าม invent retention period หากไม่มี policy/SOP ที่กำหนด

## Status
- **CURRENT** — current, approved, traceable
- **REVIEW-DUE** — ถึงรอบหรือเกินรอบ review
- **OBSOLETE** — superseded/ยกเลิกแล้ว
- **UNCONTROLLED** — ไม่มี owner/version/approval ตามที่ควรมี
- **RECORD-GAP** — evidence record ที่ควรมีไม่ครบ
- **UNKNOWN** — ข้อมูลไม่พอ

## Output

### Document / Record Control Review
| Item | Type | Owner | Version/Period | Status | Evidence | Gap / Action |
|---|---|---|---|---|---|---|

ตามด้วย:
- Current-use risk:
- Obsolete-document risk:
- Record gaps:
- Review due:
- Human action required:

## Guardrails
- ตรวจได้ แต่ห้ามประกาศใช้/ยกเลิก/แก้ไข controlled document แทนผู้มีอำนาจ
- ห้าม backdate approval/effective date
- ห้ามสร้าง signature หรือ approval ที่ไม่มีจริง
- ถ้าต้องสร้าง/แก้ SOP ส่งต่อ `sop-authoring`
- ถ้ามีข้อมูลส่วนบุคคล ส่งต่อ `data-privacy-compliance`

## Method note
เขียนใหม่โดยอาศัยแนวคิด document currency/ownership/testability จาก smerphy/cyber-grc-agent-skills (`policy-review`, MIT), process evidence จาก RBraga01/Quality-Engineering-Skills (MIT) และ document lifecycle patterns ของ STeP
