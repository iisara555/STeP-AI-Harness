---
name: vercel-deploy
description: วางแผน ตรวจสอบ และดำเนินการ Deploy ไปยัง Vercel ของ STeP อย่างปลอดภัย โดยแยก Environment ตรวจ Preview จัดลำดับ Migration ตรวจ Observability เตรียม Rollback และขออนุมัติ Production อย่างชัดเจน
---

# การ Deploy ไปยัง Vercel

1. ยืนยัน Project, Branch, Target Environment และ Commit ที่จะ Deploy
2. ตรวจ Environment Variables โดยไม่แสดงค่าลับ และแยก Preview กับ Production
3. รัน Test, Lint และ Production Build ในสภาพแวดล้อมที่ใกล้เคียงจริง
4. หากมี Database Migration ให้ตรวจ Backward Compatibility, Backup และลำดับการ Deploy
5. Deploy Preview ก่อน และตรวจ Flow สำคัญผ่าน Browser, API และ Data Path
6. ขออนุมัติอย่างชัดเจนก่อนแทนที่ Production
7. หลัง Deploy ตรวจ Health, Logs, Error Rate และ Workflow หลัก พร้อมกำหนด Rollback Trigger
8. สรุป URL, Commit, Migration, Verification และปัญหาค้าง โดยไม่เปิดเผย Secret
