---
name: github-workflow
description: Apply safe GitHub workflows for STeP repositories, including issue-to-branch traceability, scoped commits, pull-request review, CI checks, secret protection, and non-destructive recovery.
---

# GitHub Workflow

1. อ่าน repository instructions และตรวจ working tree ก่อนเปลี่ยนไฟล์
2. เชื่อมงานกับ issue/brief และตั้ง branch ให้สื่อความหมาย
3. แก้เฉพาะขอบเขตงาน รักษาการเปลี่ยนแปลงเดิมของผู้อื่น และห้ามใช้ destructive reset โดยไม่อนุมัติ
4. Commit แยกตามเหตุผล พร้อมข้อความที่ตรวจย้อนกลับได้
5. รัน test, lint, build และ security check ที่เกี่ยวข้องก่อนเปิด pull request
6. ใน pull request ระบุ Why, What, Verification, Risk, Rollback และภาพประกอบเมื่อ UI เปลี่ยน
7. ห้าม merge เมื่อ required check ล้มเหลว หรือยังไม่มีผู้อนุมัติที่กำหนด

