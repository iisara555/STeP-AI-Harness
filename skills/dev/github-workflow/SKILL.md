---
name: github-workflow
description: ใช้ขั้นตอน GitHub ที่ปลอดภัยสำหรับ Repository ของ STeP ครอบคลุมการเชื่อม Issue กับ Branch การ Commit แบบมีขอบเขต การทบทวน Pull Request การตรวจ CI การป้องกัน Secret และการกู้คืนที่ไม่ทำลายข้อมูล
---

# ขั้นตอนการทำงานกับ GitHub

1. อ่านคำแนะนำของ Repository และตรวจ Working Tree ก่อนเปลี่ยนไฟล์
2. เชื่อมงานกับ Issue หรือ Brief และตั้งชื่อ Branch ให้สื่อความหมาย
3. แก้เฉพาะขอบเขตงาน รักษาการเปลี่ยนแปลงเดิมของผู้อื่น และห้ามใช้ Destructive Reset โดยไม่มีการอนุมัติ
4. แยก Commit ตามเหตุผล พร้อมข้อความที่ตรวจย้อนกลับได้
5. รัน Test, Lint, Build และ Security Check ที่เกี่ยวข้องก่อนเปิด Pull Request
6. ใน Pull Request ระบุ Why, What, Verification, Risk, Rollback และภาพประกอบเมื่อ UI เปลี่ยน
7. ห้าม Merge เมื่อ Required Check ล้มเหลวหรือยังไม่มีผู้อนุมัติที่กำหนด
