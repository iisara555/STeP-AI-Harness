---
name: vercel-deploy
description: ใช้เมื่อเตรียม ตรวจ หรือดำเนิน Vercel Preview/Production deployment ของ STeP โดยต้องระบุ project/commit/environment, ตรวจ build/data path, verify deployment และมี rollback; ไม่ใช้สำหรับ generic coding หรือเปลี่ยน Production โดยไม่มี approval ที่เกี่ยวข้อง
standardVersion: 2
---

# STeP Vercel Deploy

## Purpose

เตรียม ตรวจ และดำเนิน Vercel deployment โดยยืนยันว่า deploy อะไร ไปที่ไหน ตรวจผลจากระบบจริง และมีทางกลับเสมอ

## เมื่อควรใช้

- เตรียมหรือดำเนิน Preview deployment
- ตรวจความพร้อมก่อน promote ขึ้น Production
- ตรวจสถานะและ health หลัง deploy

**Anti-trigger:**
- งานเขียนโค้ดทั่วไป ให้ใช้ `coding-git-workflow`
- งาน branch, PR และ merge บน GitHub ให้ใช้ `github-workflow`

## Inputs

- Vercel project
- commit หรือ branch
- target: Preview หรือ Production
- environment และ config dependencies
- migration หรือ data impact เมื่อมี
- approval requirement สำหรับ Production

## Source

- สถานะจริงของ deployment บน Vercel เป็นแหล่งเดียวที่ใช้ยืนยันผล
- environment config อ่านได้จากโปรเจกต์ แต่ **ห้ามแสดงค่า secret**
- เงื่อนไขการอนุมัติ Production อ้างจาก repository instructions และ `manifest/authority.yaml`

## Workflow

1. ยืนยัน project, commit, target environment และ expected release
2. ตรวจ config และ env references โดยไม่เปิดเผย secret
3. รัน test, lint และ production build ที่เกี่ยวข้อง
4. ถ้ามี DB หรือ schema migration ให้ตรวจ compatibility, ordering และ backup/rollback
5. Deploy Preview ก่อนเมื่อ workflow รองรับ
6. Verify critical UI, API และ data paths จาก deployment จริง **ไม่ใช้ build success แทน runtime verification**
7. ก่อน promote หรือแทนที่ Production ให้ผ่าน approval และ authority ที่เกี่ยวข้อง
8. หลัง deploy ตรวจ health, log, error และ critical workflow แล้วบันทึก deployment identity
9. ถ้าผลไม่ชัดหรือ timeout ให้ตรวจ deployment state ก่อน retry เพื่อเลี่ยง duplicate action

## Output

- Project และ Environment
- Commit หรือ deployment reference
- Build และ test result
- Verification performed
- Migration state
- Known issues
- Rollback trigger และ path
- Status: `PREVIEW-VERIFIED` / `PRODUCTION-VERIFIED` / `NEEDS-FIX` / `UNVERIFIED`

## Authority

AI ช่วยได้: เตรียม deployment ตรวจ config รัน check และ verify ผลจากระบบจริง

ต้องให้มนุษย์ตัดสิน:
- การ promote หรือแทนที่ Production
- การรัน migration ที่กระทบข้อมูลจริง
- การยกเว้น check ที่ workflow กำหนด

## Handoff

- งานแก้โค้ด → `coding-git-workflow`
- งาน PR และ merge → `github-workflow`
- การสื่อสารการเปลี่ยนแปลงต่อผู้ใช้ → `step-writing`

พร้อมส่งต่อเมื่อ: ระบุ deployment identity ได้ มีผล verification จริง และมี rollback path

## Guardrails

- ไม่พิมพ์ secret หรือ env value ใน output หรือ log
- ไม่ claim ว่า deploy สำเร็จจาก local build เพียงอย่างเดียว
- ไม่ promote Production โดยไม่มีสิทธิ์หรือ confirmation ที่ workflow กำหนด
- ไม่ retry deployment หรือ action ที่ outcome ยังไม่ชัดก่อน read-back
- ถ้า connector หรือ tool ใช้งานไม่ได้ ให้ส่ง plan และ commands พร้อมระบุสถานะ `UNVERIFIED`
