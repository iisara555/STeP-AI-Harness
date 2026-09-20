# Brand Visual Context

**Status:** NO-CONTROLLED-SOURCE  
**Authority:** ไม่มี Controlled CI Guideline ที่ลงทะเบียนและยืนยันแล้วใน `manifest/documents.yaml` สำหรับใช้เป็น current visual truth ใน Skill นี้

## Runtime rule

จนกว่าจะมี controlled source:
- ใช้เฉพาะ brand context ที่ผู้ใช้ให้ในงานนั้น หรือ Official Asset ที่ resolve ได้
- ห้ามแต่งค่า hex, logo geometry, co-branding rule, safe area หรือ visual claim จากความจำ
- ถ้าผู้ใช้ต้องการตรวจ compliance อย่างเป็นทางการ ให้ handoff ไป Brand Review / เจ้าของ CI ที่เกี่ยวข้อง

## เมื่อมี Controlled CI Guideline

อัปเดตไฟล์นี้ด้วยข้อมูลที่ resolve จาก source นั้นเท่านั้น เช่น:
- คำบรรยาย `PALETTE` ที่ใช้ใน Prompt Spec
- official asset constraints
- visual usage constraints ที่มีผลต่อ prompt
- source ID / revision / effective date / owner

อย่าคัดลอกคู่มือทั้งฉบับมาไว้ที่นี่ ให้เก็บเฉพาะ runtime visual context ที่จำเป็นและอ้างกลับไปยัง controlled source
