---
name: github-workflow
description: ใช้เมื่อทำงานกับ GitHub repository ของ STeP เช่น Issue/Branch/Commit/PR/CI/Merge และต้องรักษา scope/secret/review evidence; ไม่ใช้แทน coding implementation, deployment-specific verification หรืออนุญาตให้ merge เมื่อ required checks/authority ยังไม่ผ่าน
---

# STeP GitHub Workflow

## Inputs
- repository / branch / issue หรือ brief
- requested change
- repository instructions / CI requirements
- current working tree / existing changes เมื่อเข้าถึงได้

## Workflow
1. อ่าน repository instructions และตรวจสถานะ branch/working tree
2. ผูกงานกับ Issue/Brief และกำหนด scope ที่เล็กที่สุด
3. สร้าง branch จาก base ที่ถูกต้อง; รักษางานเดิมของผู้อื่น
4. แก้เฉพาะขอบเขตที่ขอและไม่ใช้ destructive reset โดยพลการ
5. แยก commit ตามเหตุผลและหลีกเลี่ยง secret/credential
6. รัน test/lint/build/security checks ที่ repo กำหนด
7. เปิด PR พร้อม Why / What / Verification / Risk / Rollback
8. ตรวจ CI/required review ก่อน merge
9. หลัง merge ตรวจ target branch/commit และบันทึก known gap

## Output Contract
- Branch / PR reference เมื่อสร้างจริง
- Files changed
- Verification performed + result
- Known risk / unverified item
- Merge status: `NOT-READY` / `READY-FOR-REVIEW` / `MERGED` ตามหลักฐานจริง

## Guardrails
- ไม่ claim ว่า CI ผ่านถ้ายังไม่มี check result
- ไม่ force-push/reset/delete branch ที่มีงานคนอื่นโดยไม่มีคำสั่งชัด
- ไม่ commit secret, token, cookie, private runtime state
- ไม่ merge เมื่อ required check ล้มเหลวหรือ authority/review ที่ repo กำหนดยังไม่ครบ
- Production deployment ให้ใช้ `vercel-deploy` หรือ deployment Skill ที่ตรง platform
