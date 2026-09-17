---
name: evidence-before-approval
description: ตรวจว่าข้อสรุป งาน หรือเอกสารมีหลักฐานเพียงพอก่อนกล่าวว่าเสร็จ ถูกต้อง พร้อมส่ง หรือพร้อมอนุมัติ โดยยึด Evidence before Assertion และไม่อนุมัติแทนมนุษย์
---

# STeP Evidence Before Approval

> **Evidence before assertion.** อย่าบอกว่างาน “เรียบร้อย / ถูกต้อง / พร้อมส่ง” เพียงเพราะขั้นตอนหนึ่งทำสำเร็จ ต้องมีหลักฐานที่ตรงกับข้อกล่าวอ้างนั้น

Skill นี้เป็น **verification layer** ใช้ร่วมกับ Skill เฉพาะงาน เช่น TOR, Finance, QS, Document, Project หรือ Creative ไม่ใช่ตัวแทนการตรวจเชิงโดเมนทั้งหมด

## ใช้เมื่อ
- ผู้ใช้ถามว่า “พร้อมส่งไหม”, “ครบหรือยัง”, “ยืนยันได้ไหม”, “ปิดงานได้หรือยัง”
- AI กำลังจะสรุปว่า task สำเร็จ แก้ไขแล้ว ผ่านแล้ว หรือพร้อมใช้งาน
- ต้องตรวจหลักฐานก่อน handoff, submit, publish หรือ review รอบมนุษย์

## ไม่ใช้แทน
- การอนุมัติงบประมาณ จัดซื้อ ลงนาม ประกาศใช้ SOP หรือการตัดสินทางกฎหมาย
- การตรวจมาตรฐานเฉพาะทางที่มี Skill เจ้าของโดเมนอยู่แล้ว

## Verification Loop

### 1. ระบุ Claim
เขียนให้ชัดว่ากำลังจะยืนยันอะไร เช่น:
- “เอกสารมีหัวข้อครบตาม template”
- “ตัวเลขในตารางรวมถูกต้อง”
- “ไฟล์ export เปิดได้”
- “ข้อแก้ไขจากรอบก่อนถูกดำเนินการครบ”

ห้ามใช้คำกว้างว่า “โอเคแล้ว” โดยไม่มี claim ที่ตรวจได้

### 2. ระบุ Evidence ที่ต้องมี
จับคู่ทุก Claim กับหลักฐานโดยตรง เช่น:
- Claim เรื่องความครบถ้วน → checklist / source template
- Claim เรื่องตัวเลข → สูตร / source data / recalculation
- Claim เรื่องไฟล์ → เปิดไฟล์จริง / validation result
- Claim เรื่องแก้ไข → diff / before-after / issue list

### 3. ตรวจ Source และ Freshness
ถามว่า:
- หลักฐานมาจากแหล่งไหน
- เป็นข้อมูลล่าสุดพอสำหรับ claim นี้หรือไม่
- เป็นข้อมูลจริงหรือสมมติฐาน
- มีข้อจำกัดหรือ sample bias หรือไม่

### 4. Cross-check
เมื่อ claim สำคัญ ให้ตรวจอย่างน้อยหนึ่งทางที่เป็นอิสระจากขั้นตอนสร้างงาน เช่น คำนวณซ้ำ ตรวจจาก source ต้นฉบับ หรือเทียบ checklist

### 5. สถานะ
ใช้ 3 สถานะเท่านั้น:
- **VERIFIED** — มีหลักฐานตรงกับ claim
- **PARTIAL** — ตรวจได้บางส่วน ยังมี gap ชัดเจน
- **UNVERIFIED** — ยังไม่มีหลักฐานพอ ห้ามกล่าวว่าเสร็จ/ผ่าน

## Output เริ่มต้น

### Verification Summary
- **Claim:** …
- **Status:** VERIFIED / PARTIAL / UNVERIFIED
- **Evidence checked:** …
- **Gap / risk:** …
- **Next verification:** …
- **Human decision required:** Yes / No

หากมีหลาย claim ให้ใช้ตารางสั้น ๆ แทนการเขียนยาว

## Guardrails
- ความสำเร็จของคำสั่งหรือการสร้างไฟล์ ≠ ความถูกต้องของผลลัพธ์
- ห้ามสร้าง evidence, test result, citation หรือ approval ขึ้นเอง
- ถ้าไม่มี access ถึงหลักฐาน ให้ระบุ `UNVERIFIED` และบอกสิ่งที่ต้องตรวจ ไม่เดา
- หากเป็นข้อมูลส่วนบุคคล/ข้อมูลลับ ให้ส่งต่อ `data-privacy-compliance`
- หาก claim อยู่ในอำนาจอนุมัติของมนุษย์ ให้ตรวจความพร้อมได้ แต่ห้ามเปลี่ยนเป็นคำว่า “อนุมัติแล้ว”

## Handoff
หลัง verification ให้กลับไปยัง Skill เจ้าของงานเพื่อแก้ gap หรือจัดทำ final output

---

**Method note:** แนวคิด Evidence-before-assertion ได้แรงบันดาลใจจาก `verification-before-completion` ใน obra/superpowers (MIT) และเขียนใหม่สำหรับงานองค์กร STeP ที่ไม่จำกัดเฉพาะงานซอฟต์แวร์
