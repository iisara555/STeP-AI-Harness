---
name: audit-evidence-matrix
description: สร้างและทบทวน Evidence Matrix สำหรับ Internal/External Audit โดยเชื่อม process/criteria กับหลักฐาน ช่วงเวลา แหล่งข้อมูล owner สถานะ และ evidence gap ของแต่ละทีม
---

# STeP Audit Evidence Matrix

> **Evidence must prove the claim for the right scope and the right period.**

## ใช้เมื่อ
- ทำรายการหลักฐานก่อน audit
- auditor/PBC/evidence request list
- “หลักฐานข้อนี้อยู่ไหน”
- ต้องรวมหลักฐานจากหลายทีม

## Evidence Matrix Schema

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

## Evidence Quality Checks

ตรวจทุก item ตามลำดับ:

1. **Relevance** — หลักฐานตอบ claim นี้จริงหรือไม่
2. **Completeness** — ครบทั้ง process/location/service ที่อยู่ใน scope หรือไม่
3. **Period** — อยู่ในช่วง audit period หรือพิสูจน์ช่วงนั้นได้หรือไม่
4. **Traceability** — รู้ว่าใคร/ระบบไหนสร้าง เมื่อไร และเชื่อมกลับ source ได้หรือไม่
5. **Integrity** — เป็น source record หรือเป็นสรุปที่มนุษย์ทำขึ้นภายหลัง
6. **Population / Sampling** — ถ้าจะ sample ต้องรู้ full population ก่อน ไม่ hand-pick แต่รายการที่ดูดี
7. **Accessibility** — วัน audit เปิดได้จริงและมีสิทธิ์เข้าถึงหรือไม่
8. **Privacy** — มี PII/ความลับเกินความจำเป็นหรือไม่

## Status Rules
- **READY** — ตรง claim + scope + period + traceable
- **PARTIAL** — ใช้ได้บางส่วนแต่ยังมี gap ชัด
- **MISSING** — ไม่มีหลักฐานที่รองรับ
- **STALE** — มีแต่ไม่ตรงช่วง/เวอร์ชัน
- **N/A** — ยืนยันแล้วว่าไม่ applicable พร้อมเหตุผล

ห้ามเปลี่ยน MISSING เป็น READY เพราะมี “เอกสารใหม่” ที่ไม่ได้พิสูจน์การปฏิบัติในอดีต

## Output

### Evidence Coverage Summary
- Total requests:
- READY:
- PARTIAL:
- MISSING:
- STALE:
- N/A:
- Critical gaps:
- Due owners:

จากนั้นแสดง Evidence Matrix และ Top 5 gaps ที่ต้องปิดก่อน fieldwork

## Output Storage
เมื่อสร้างไฟล์ ให้ใช้:
`output/<TEAM>/<YYYY>/<MM>/audit/`

ชื่อเช่น:
`YYYYMMDD_CC_audit_Evidence-Matrix_v01.xlsx`

## Handoff
- evidence ยังไม่พอ → `evidence-before-approval`
- document revision/status ไม่ชัด → `document-record-control`
- มี PII → `data-privacy-compliance`
- gap กลายเป็น NC/CAPA → `ncr-capa`

## Method note
ดัดแปลงเชิงแนวคิดจาก evidence/PBC workflow ของ smerphy/cyber-grc-agent-skills (`audit-preparation`, MIT) และ evidence-before-assertion pattern ของ obra/superpowers (MIT) เขียนใหม่สำหรับงานบริการและโครงการของ STeP
