---
name: spreadsheet-work
description: ใช้เมื่อขอสร้างไฟล์ Excel อ่านหรือแก้เซลล์ใน workbook เดิม หรือตรวจสูตร Excel; การวางแผนโครงการและการอนุมัติงบต้องส่งต่อ Skill เฉพาะทาง
standardVersion: 2
---

# STeP Spreadsheet Work

## Purpose

สร้าง อ่าน และแก้ Excel ที่พนักงานใช้ต่อได้ โดยรักษารหัสที่มีศูนย์นำหน้า แยก input/formula และระบุข้อจำกัดของการคำนวณอย่างชัดเจน

## เมื่อควรใช้

- สร้างไฟล์ Excel จากข้อมูลที่มี
- อ่านหรือแก้ค่าเซลล์ในไฟล์ Excel เดิม
- ตรวจสูตร Excel หรือหาจุดอ้างอิงที่ผิด

Anti-trigger: วางแผนโครงการ → `project-plan`; ตรวจ TOR → `tor-review`; ตรวจใบเสร็จ/สิทธิ์เบิก → `receipt-audit`; อนุมัติงบเป็นอำนาจมนุษย์

## Inputs

ไฟล์ต้นฉบับหรือข้อมูลตาราง พร้อมชื่อ sheet, เซลล์/ช่วงที่ต้องทำ และชนิดข้อมูลที่สำคัญ ถ้ายังไม่มี template ให้ทำร่างตารางและระบุว่าไม่ได้ตรวจตาม template

## Source

ข้อมูลและสูตรมาจากต้นฉบับ/ผู้ใช้; ไม่มี Source ภายนอกที่จำเป็นสำหรับงานโครงสร้าง เงิน อัตรา และระเบียบองค์กรต้องใช้ Controlled Source ของงานนั้น ผลอ่านเครื่องมือยังไม่ใช่หลักฐานว่าตัวเลขถูกต้อง

## Workflow

1. แยก create/read/edit/review และตรวจว่าต้องส่งต่อด้านแผนงาน การเงิน หรือ Privacy หรือไม่
2. อ่านช่วงที่เกี่ยวข้องด้วย `sheet_read`; ดู `formulas` แยกจากค่าที่แสดงและ cachedResult เก็บเลขอ้างอิง/เลขภาษีเป็นข้อความ
3. สร้างด้วย `sheet_create` ตาม [tool contract](references/office-tools.md) เมื่อไม่มีไฟล์เดิม; ใช้สูตรจริงสำหรับค่าที่ขึ้นกับ input ไม่ใส่ยอดที่เดาเอง
4. แก้ไฟล์เดิมด้วย `sheet_edit` เฉพาะ input cells ที่ผู้ใช้ระบุ เครื่องมือปฏิเสธการเขียนทับ formula cell, protected sheet และ merged non-anchor; ถ้าเจอให้ส่งข้อเสนอแก้สูตรแทนการฝืนเขียน
5. เปิดอ่านผลที่นำไปใช้แล้วเพื่อตรวจชนิดข้อมูลและค่าที่เปลี่ยน การ staging ยังไม่เท่ากับเขียนไฟล์เสร็จ
6. ถ้ามีสูตรหรือเปลี่ยน input ที่เกี่ยวกับสูตร ให้ระบุว่าต้องเปิด Excel/LibreOffice เพื่อ recalculate แล้วเทียบคำตอบตัวอย่างที่คำนวณอิสระ ไม่มี formula engine ในเครื่องมือนี้
7. ส่ง path, sheet/range ที่ทำ, ข้อจำกัด และสิ่งที่คนยังต้องตรวจ ห้ามอ้าง zero format loss หรือคำนวณถูกทั้งหมดจากการเปิด ZIP ได้

## Output

ไฟล์ `.xlsx` หรือผลอ่าน/รายการข้อเสนอ พร้อมที่มาและสถานะ `staged-for-human-review` / `applied` ตามผล tool จริง ดู [ตัวอย่างสังเคราะห์](examples/good-output.md)

## Authority

AI ช่วยจัดตาราง ตรวจสูตรและแก้ input ที่ได้รับคำขอได้ การรับรองยอดเงิน อนุมัติงบ ส่งจริง และแชร์ไฟล์เป็นของผู้มีอำนาจ เครื่องมือไฟล์ใช้ Changes/permission/snapshot เดิม ไม่ยกระดับ EXTRACTED_UNVERIFIED เป็น SOURCE_FACT เอง

## Handoff

`project-plan` สำหรับโครงแผน, AFP/`receipt-audit` สำหรับแหล่งกฎการเงิน, `data-privacy-compliance` สำหรับข้อมูลส่วนบุคคล; Google Workspace connector เป็น Action แยก พร้อมส่งต่อเมื่อระบุ sheet/range และ source ของค่าที่ต้องใช้แล้ว

## Guardrails

- รองรับ `.xlsx` เท่านั้น ไม่แก้ `.xlsm` หรือไฟล์ที่มี digital signature
- ห้ามใช้ shell/สร้าง script เพื่อหลบ path, Changes หรือ formula protection
- ไม่อ่าน cached result เป็นผล recalculate ใหม่ ไม่อ้างความถูกต้องของสูตรจากการไม่มี error เพียงอย่างเดียว
- ชิ้นส่วน ZIP ที่ไม่ได้แก้ถูกเก็บไว้ แต่ยังต้องตรวจเปิดด้วยโปรแกรมปลายทาง โดยเฉพาะไฟล์ซับซ้อน
- ห้ามสร้างข้อเท็จจริงหรือ commit workbook จริงเข้า public repo
