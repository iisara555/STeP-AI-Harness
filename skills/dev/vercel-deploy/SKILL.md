---
name: vercel-deploy
description: Plan, verify, and safely execute STeP Vercel deployments with environment separation, preview validation, migration sequencing, observability checks, rollback readiness, and explicit production approval.
---

# Vercel Deployment

1. ยืนยัน project, branch, target environment และ commit ที่จะ deploy
2. ตรวจ environment variables โดยไม่แสดงค่าลับ และแยก Preview/Production
3. รัน test, lint และ production build ในสภาพแวดล้อมที่ใกล้เคียงจริง
4. ถ้ามี database migration ให้ตรวจ backward compatibility, backup และลำดับ deploy
5. Deploy Preview ก่อนและตรวจ flow สำคัญผ่าน browser, API และ data path
6. ขออนุมัติชัดเจนก่อนแทนที่ Production
7. หลัง deploy ตรวจ health, logs, error rate และ workflow หลัก พร้อมกำหนด rollback trigger
8. สรุป URL, commit, migration, verification และปัญหาค้างโดยไม่เปิดเผย Secret

