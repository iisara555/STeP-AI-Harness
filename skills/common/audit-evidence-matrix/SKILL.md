---
name: audit-evidence-matrix
description: สร้างและทบทวน Evidence Matrix สำหรับ Internal/External Audit โดยเชื่อม process/criteria กับหลักฐาน ช่วงเวลา แหล่งข้อมูล owner สถานะ และ evidence gap ของแต่ละทีม
standardVersion: 2
---

# STeP Audit Evidence Matrix

## Purpose

รวบรวมและตรวจคุณภาพหลักฐานสำหรับการตรวจประเมิน โดยเชื่อม criteria กับหลักฐานจริง ช่วงเวลา เจ้าของ และสถานะ เพื่อให้เห็น gap ก่อนถึงวัน fieldwork

หลักของ Skill นี้: **หลักฐานต้องพิสูจน์ claim ได้ ในขอบเขตและช่วงเวลาที่ถูกต้อง**

## เมื่อควรใช้

- ทำรายการหลักฐานก่อน audit
- ได้รับ auditor / PBC / evidence request list
- คำถามแบบ "หลักฐานข้อนี้อยู่ไหน"
- ต้องรวมหลักฐานจากหลายทีม

**Anti-trigger:**
- ต้องการประเมินความพร้อมของระบบคุณภาพทั้งระบบ ให้ใช้ `iso9001-audit-readiness`
- ต้องการซ้อมตอบ auditor ให้ใช้ `audit-interview-coach`
- gap กลายเป็นข้อบกพร่องแล้ว ให้ใช้ `ncr-capa`

## Inputs

ขั้นต่ำ:
- ขอบเขตการตรวจ (process / ทีม / ช่วงเวลา)
- criteria หรือ request list ที่ผู้ตรวจส่งมา

ช่วยให้แม่นขึ้นถ้ามี:
- รายชื่อ record และระบบที่ใช้เก็บ
- ผู้รับผิดชอบหลักฐานของแต่ละ process

## Source

- criteria ต้องอ้างจาก audit plan หรือมาตรฐานที่ยืนยันแล้ว ไม่ตีความเพิ่มเอง
- หลักฐานต้องชี้กลับไปที่ record ต้นทางได้ ไม่ใช่สรุปที่เขียนขึ้นใหม่
- เอกสารควบคุมที่เกี่ยวข้องดูที่ `manifest/documents.yaml`

## Workflow

1. **สร้างตาราง** ตาม schema ด้านล่าง
2. **ตรวจคุณภาพหลักฐานทีละรายการ** ตามลำดับ 8 ข้อใน Guardrails
3. **ให้สถานะ** READY / PARTIAL / MISSING / STALE / N/A
4. **สรุป coverage และ gap** ที่ต้องปิดก่อน fieldwork

### Evidence Matrix Schema

| Field | ความหมาย |
|---|---|
| Evidence ID | ID ไม่ซ้ำ เช่น AUD-CC-001 |
| Team / Process | เจ้าของ process |
| Criteria Ref | reference จาก audit plan/criteria ที่ยืนยันแล้ว |
| Claim / Control | สิ่งที่หลักฐานต้องพิสูจน์ |
| Evidence | ชื่อหลักฐาน/record |
| Period Covered | ช่วงเวลาที่ครอบคลุม |
| Source | ระบบ/โฟลเดอร์/เอกสารต้นทาง |
| Owner | ผู้รับผิดชอบหลักฐาน |
| Last Updated | วันที่ล่าสุด |
| Population / Sample | ประชากรหรือ sample context ถ้ามี |
| Sensitivity | Public / Internal / Restricted |
| Status | READY / PARTIAL / MISSING / STALE / N/A |
| Path / Link | ที่อยู่จริง |
| Gap / Action | สิ่งที่ต้องทำต่อ |

### Status Rules

- **READY** — ตรง claim + scope + period + traceable
- **PARTIAL** — ใช้ได้บางส่วนแต่ยังมี gap ชัด
- **MISSING** — ไม่มีหลักฐานที่รองรับ
- **STALE** — มีแต่ไม่ตรงช่วงหรือเวอร์ชัน
- **N/A** — ยืนยันแล้วว่าไม่ applicable พร้อมเหตุผล

## Output

### Evidence Coverage Summary

- Total requests / READY / PARTIAL / MISSING / STALE / N/A
- Critical gaps
- Due owners

จากนั้นแสดง Evidence Matrix เต็ม และ Top 5 gaps ที่ต้องปิดก่อน fieldwork

เมื่อสร้างไฟล์ ให้เก็บที่ `output/<TEAM>/<YYYY>/<MM>/audit/` ชื่อเช่น `YYYYMMDD_CC_audit_Evidence-Matrix_v01.xlsx`

## Authority

AI ช่วยได้: จัดตาราง ตรวจคุณภาพหลักฐานตามเกณฑ์ และชี้ gap

ต้องให้มนุษย์ตัดสิน:
- การรับรองว่าหลักฐานเพียงพอต่อการตรวจ — เป็นอำนาจของ QS และ Process Owner
- การประกาศว่า process ใดผ่านหรือไม่ผ่าน — `iso-qms-enactment` ใน `manifest/authority.yaml`
- การเปิดเผยหลักฐานที่มีชั้นความลับต่อผู้ตรวจภายนอก

## Handoff

- evidence ยังไม่พอ → `evidence-before-approval`
- document revision หรือ status ไม่ชัด → `document-record-control`
- มี PII → `data-privacy-compliance`
- gap กลายเป็น NC/CAPA → `ncr-capa`
- ต้องซ้อมอธิบายหลักฐานกับผู้ตรวจ → `audit-interview-coach`

พร้อมส่งต่อเมื่อ: ทุกรายการมีสถานะและเจ้าของ และ critical gap มีผู้รับผิดชอบพร้อมกำหนดเวลา

## Guardrails

ตรวจหลักฐานทุก item ตามลำดับนี้:

1. **Relevance** — ตอบ claim นี้จริงหรือไม่
2. **Completeness** — ครบทุก process/location/service ใน scope หรือไม่
3. **Period** — อยู่ในช่วง audit period หรือพิสูจน์ช่วงนั้นได้หรือไม่
4. **Traceability** — รู้ว่าใครหรือระบบใดสร้าง เมื่อไร และเชื่อมกลับ source ได้หรือไม่
5. **Integrity** — เป็น source record หรือเป็นสรุปที่ทำขึ้นภายหลัง
6. **Population / Sampling** — ถ้าจะ sample ต้องรู้ full population ก่อน ห้าม hand-pick เฉพาะรายการที่ดูดี
7. **Accessibility** — วัน audit เปิดได้จริงและมีสิทธิ์เข้าถึงหรือไม่
8. **Privacy** — มี PII หรือความลับเกินความจำเป็นหรือไม่

**ห้ามเปลี่ยน MISSING เป็น READY เพราะมีเอกสารใหม่ที่ไม่ได้พิสูจน์การปฏิบัติในอดีต**

## Method note

ดัดแปลงเชิงแนวคิดจาก evidence/PBC workflow ของ smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ evidence-before-assertion pattern ของ obra/superpowers (MIT) เขียนใหม่สำหรับงานบริการและโครงการของ STeP
