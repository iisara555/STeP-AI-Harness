---
name: vercel-deploy
description: ใช้เมื่อเตรียม ตรวจ หรือดำเนิน Vercel Preview/Production deployment ของ STeP โดยต้องระบุ project/commit/environment, ตรวจ build/data path, verify deployment และมี rollback; ไม่ใช้สำหรับ generic coding หรือเปลี่ยน Production โดยไม่มี approval ที่เกี่ยวข้อง
---

# STeP Vercel Deploy

## Inputs
- Vercel project
- commit / branch
- target: Preview หรือ Production
- environment/config dependencies
- migration/data impact เมื่อมี
- approval requirement สำหรับ Production

## Workflow
1. ยืนยัน project, commit, target environment และ expected release
2. ตรวจ config/env references โดยไม่เปิดเผย secret
3. รัน test/lint/production build ที่เกี่ยวข้อง
4. ถ้ามี DB/schema migration ให้ตรวจ compatibility, ordering, backup/rollback
5. Deploy Preview ก่อนเมื่อ workflow รองรับ
6. Verify critical UI/API/data paths จาก deployment จริง ไม่ใช้ build success แทน runtime verification
7. ก่อน promote/replace Production ให้ผ่าน approval/authority ที่เกี่ยวข้อง
8. หลัง deploy ตรวจ health/log/error/critical workflow และบันทึก deployment identity
9. หากผลไม่ชัด/timeout ให้ตรวจ deployment state ก่อน retry เพื่อเลี่ยง duplicate action

## Output Contract
- Project / Environment
- Commit / deployment reference
- Build/test result
- Verification performed
- Migration state
- Known issues
- Rollback trigger/path
- Status: `PREVIEW-VERIFIED` / `PRODUCTION-VERIFIED` / `NEEDS-FIX` / `UNVERIFIED`

## Guardrails
- ไม่พิมพ์ secret/env value ใน output/log
- ไม่ claim deploy สำเร็จจาก local build เพียงอย่างเดียว
- ไม่ promote Production โดยไม่มีสิทธิ์/confirmation ที่ workflow กำหนด
- ไม่ retry deployment/action ที่ outcome ยังไม่ชัดก่อน read-back
- ถ้า connector/tool ใช้งานไม่ได้ ให้ส่ง plan/commands และระบุว่า `UNVERIFIED`
