---
name: github-workflow
description: ใช้เมื่อทำงานกับ GitHub repository ของ STeP เช่น Issue/Branch/Commit/PR/CI/Merge และต้องรักษา scope/secret/review evidence; ไม่ใช้แทน coding implementation, deployment-specific verification หรืออนุญาตให้ merge เมื่อ required checks/authority ยังไม่ผ่าน
standardVersion: 2
---

# STeP GitHub Workflow

## Purpose

ทำงานกับ GitHub repository ของ STeP อย่างเป็นระบบ ตั้งแต่ Issue, Branch, Commit, PR, CI จนถึง Merge โดยรักษาขอบเขตการแก้ ไม่ทำให้ secret หลุด และมีหลักฐานการตรวจก่อน merge

## เมื่อควรใช้

- เริ่มงานแก้โค้ดที่ต้องมี branch และ PR
- เตรียม PR ให้พร้อมรีวิว
- ตรวจสถานะ CI และเงื่อนไขก่อน merge

**Anti-trigger:**
- การเขียนโค้ดและ commit convention ให้ใช้ `coding-git-workflow`
- การ deploy ขึ้น production ให้ใช้ `vercel-deploy` หรือ Skill ที่ตรงกับ platform

## Inputs

- repository, branch, issue หรือ brief
- requested change
- repository instructions และ CI requirements
- current working tree หรือ existing changes เมื่อเข้าถึงได้

## Source

- repository instructions ในตัว repo เช่น CLAUDE.md, CONTRIBUTING หรือ workflow config เป็นแหล่งกำหนดวิธีทำงาน
- ผลการรัน CI จริงเป็นแหล่งเดียวที่ใช้ยืนยันว่า check ผ่าน
- ไม่มี source ภายนอกอื่นที่จำเป็น

## Workflow

1. อ่าน repository instructions และตรวจสถานะ branch กับ working tree
2. ผูกงานกับ Issue หรือ Brief และกำหนด scope ที่เล็กที่สุด
3. สร้าง branch จาก base ที่ถูกต้อง และรักษางานเดิมของผู้อื่น
4. แก้เฉพาะขอบเขตที่ขอ ไม่ใช้ destructive reset โดยพลการ
5. แยก commit ตามเหตุผล และหลีกเลี่ยง secret หรือ credential
6. รัน test, lint, build และ security checks ที่ repo กำหนด
7. เปิด PR พร้อม Why / What / Verification / Risk / Rollback
8. ตรวจ CI และ required review ก่อน merge
9. หลัง merge ตรวจ target branch และ commit แล้วบันทึก known gap

## Output

- Branch และ PR reference เมื่อสร้างจริง
- Files changed
- Verification performed พร้อมผลลัพธ์
- Known risk และรายการที่ยังไม่ได้ verify
- Merge status: `NOT-READY` / `READY-FOR-REVIEW` / `MERGED` ตามหลักฐานจริง

## Authority

AI ช่วยได้: เตรียม branch, commit, PR, รัน check และสรุปสถานะ

ต้องให้มนุษย์ตัดสิน:
- การอนุมัติ PR และการ merge เมื่อ repo กำหนด required review
- การเปลี่ยนแปลงที่กระทบ production หรือข้อมูลจริง
- การยกเว้น required check

## Handoff

- การเขียนโค้ดจริงและ commit convention → `coding-git-workflow`
- การ deploy → `vercel-deploy`
- การเปลี่ยนแปลงที่กระทบผู้ใช้จริงและต้องสื่อสาร → `step-writing`

พร้อมส่งต่อเมื่อ: PR มีคำอธิบายครบ ผล check ปรากฏจริง และระบุ risk กับ rollback แล้ว

## Guardrails

- ไม่ claim ว่า CI ผ่านถ้ายังไม่มี check result
- ไม่ force-push, reset หรือลบ branch ที่มีงานคนอื่นโดยไม่มีคำสั่งชัดเจน
- ไม่ commit secret, token, cookie หรือ private runtime state
- ไม่ merge เมื่อ required check ล้มเหลว หรือ authority และ review ที่ repo กำหนดยังไม่ครบ
