---
name: step-brand
description: ตรวจงานออกแบบของ STeP เทียบกับ Brand Guideline, Logo Asset, Template และตัวอย่างงานที่ได้รับอนุมัติ เพื่อหาความไม่สอดคล้องด้าน Logo, สี, Typography, Brand hierarchy และการใช้งานจริง พร้อมระบุหลักฐานและวิธีแก้โดยไม่สร้างกฎ Brand ขึ้นเอง
standardVersion: 2
---

# STeP Brand Review

## Purpose

ตรวจว่างานออกแบบที่เกี่ยวข้องกับ STeP สอดคล้องกับ Brand Source ที่ได้รับการยืนยันหรือไม่

Skill นี้มีหน้าที่ **ตรวจและชี้ความไม่สอดคล้อง** ไม่ใช่สร้าง Brand Guideline ใหม่หรือกำหนด Creative Direction แทนเจ้าของ Brand

## เมื่อควรใช้

- ตรวจ artwork, poster, social media, presentation, booth, signage, เอกสาร หรือ UI ก่อนเผยแพร่
- ตรวจการวาง logo และ co-branding
- ตรวจว่าใช้สีและ typography ตรงกับ guideline หรือไม่

**Anti-trigger:**
- ออกแบบงานใหม่หรือให้ creative direction → `creative-art-director`
- บรีฟงานให้ดีไซเนอร์ → `designer-brief`
- เรื่องถ้อยคำและน้ำเสียง → `brand-tone-of-voice`

## Inputs

อาจได้รับ: artwork, poster, social media, presentation, booth หรือ exhibition, signage, document, website หรือ UI, logo asset, brand guideline, template และตัวอย่างงานที่ได้รับอนุมัติ

## Source

สำหรับงาน STeP ให้อ่าน [CI manual digest reference](references/ci-manual-digest.md) และ resolve สถานะจาก `manifest/documents.yaml` → `step-brand-ci-guideline` ก่อนตรวจสี โลโก้ clear space ขนาดขั้นต่ำ หรือพื้นหลัง คู่มือที่ได้รับมีวันที่เผยแพร่ 18 February 2021; สีดิจิทัลได้รับการยืนยันจากผู้ใช้แล้ว แต่สถานะฉบับควบคุมปัจจุบันยังรอ CC ยืนยัน

**Reference Priority** ใช้หลักฐานตามลำดับนี้เมื่อมี:

1. Brand Guideline ที่ได้รับการยืนยัน
2. Official Logo หรือ Brand Asset
3. Official Template
4. งานตัวอย่างที่ได้รับอนุมัติ
5. ข้อมูลที่ผู้ใช้ยืนยันในคำขอปัจจุบัน

**หากแหล่งข้อมูลขัดกัน ให้รายงาน Conflict ห้ามเลือกเองว่าข้อมูลใดถูก**

เมื่อผู้ใช้ยืนยันเพื่อแก้ conflict ให้บันทึกขอบเขตและวันที่ของคำยืนยันแยกจากต้นฉบับ ใช้คำยืนยันเฉพาะประเด็นนั้น เช่น สีดิจิทัลไม่ใช่การยืนยัน CMYK หรือคู่มือทั้งฉบับ

## Workflow

ตรวจเฉพาะรายการที่มีข้อมูลเพียงพอ: logo usage, clear space, logo proportion, minimum size, brand hierarchy, color usage, contrast, typography, grid และ alignment, readability, co-branding, sponsor placement และการใช้งานบนขนาดกับช่องทางจริง

ไม่จำเป็นต้องตรวจทุกหัวข้อ หากไม่มีหลักฐานหรือไม่เกี่ยวข้องกับงานนั้น

แต่ละประเด็นต้องระบุ ตำแหน่ง, สิ่งที่พบ, Brand reference ที่เกี่ยวข้อง, ผลกระทบ, วิธีแก้ และระดับความมั่นใจ

**Classification:** `สอดคล้อง`, `ไม่สอดคล้อง` หรือ `รอยืนยัน`

ใช้ `รอยืนยัน` เมื่อไม่มี guideline รองรับ, asset ยืนยันไม่ได้, brand hierarchy ไม่ชัด, แหล่งข้อมูลขัดกัน หรือ artwork เห็นรายละเอียดไม่พอ

## Output

### Brand Sources
Brand หรือ Project, Guideline, Logo และ Assets, Template, Approved references, Confidence

### Brand Findings

| ตำแหน่ง | ประเด็น | สถานะ | หลักฐาน | วิธีแก้ | Confidence |
|---|---|---|---|---|---|

### Design Suggestions

ระบุเฉพาะเมื่อผู้ใช้ต้องการ **ข้อเสนอในส่วนนี้ไม่ถือเป็น Brand requirement**

### Human Confirmation

Brand Source ที่ยังขาด, asset ที่ยังยืนยันไม่ได้, brand hierarchy ที่ยังไม่ชัด, conflict ระหว่าง guideline template และ artwork และประเด็นอื่นที่ต้องให้เจ้าของ Brand ยืนยัน

## Authority

AI ช่วยได้: ตรวจความสอดคล้องกับ brand source และเสนอวิธีแก้

ต้องให้มนุษย์ตัดสิน:
- การดัดแปลง logo สีประจำองค์กร หรือข้อความอัตลักษณ์ — `brand-alteration` ใน `manifest/authority.yaml`
- การอนุมัติเผยแพร่งานออกแบบ
- การตัดสิน brand hierarchy เมื่อแหล่งข้อมูลขัดกัน

## Handoff

- ออกแบบงานใหม่ → `creative-art-director`
- บรีฟงานให้ดีไซเนอร์ → `designer-brief`
- ถ้อยคำและน้ำเสียง → `brand-tone-of-voice`
- สไลด์นำเสนอ → `presentation-design`

พร้อมส่งต่อเมื่อ: ทุก finding ระบุหลักฐาน brand ที่ใช้ และรายการ `รอยืนยัน` ถูกส่งให้เจ้าของ Brand

## Guardrails

- ห้ามสร้างกฎ Brand จากความชอบส่วนตัว
- ห้ามถือว่างานเก่าเป็น Brand Standard โดยอัตโนมัติ
- ห้ามเปลี่ยน logo สี หรือ font เพียงเพราะดูดีกว่า
- ห้ามสรุป brand hierarchy หากไม่มีหลักฐาน
- **ห้ามถือว่า CMU และ STeP ใช้กฎเดียวกันทุกกรณี**
- แยก `Brand requirement` ออกจาก `Design suggestion` และติดป้ายให้ชัด
- หากไม่มี Brand Source เพียงพอ ให้รายงานสิ่งที่ตรวจไม่ได้แทนการเดา
