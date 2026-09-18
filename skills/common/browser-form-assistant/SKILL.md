---
name: browser-form-assistant
description: ผู้ช่วยร่างและตรวจทานข้อมูลแบบฟอร์มออนไลน์แบบมีมนุษย์กำกับ รองรับการใช้ authenticated session แบบ local โดยไม่เก็บ password แบบ plaintext และไม่ส่งแทนโดยพลการ
---

# Browser Form Assistant (ผู้ช่วยกรอกแบบฟอร์ม)

ช่วยบุคลากร STeP เปิดเว็บ เตรียมข้อมูล กรอกร่าง และตรวจทานแบบฟอร์ม เช่น จองห้องประชุม ขอใช้สถานที่ หรือลงทะเบียนงานธุรการ โดยคง **Human Confirmation Gate** ก่อน action ที่มีผลจริง

หลักการ: **Login safely → Draft → Review → Confirm → Submit**

## 1. เลือกทางทำงาน

**ไม่มี browser tool:** สรุปรายการช่องและข้อความที่จะกรอกให้พนักงานดำเนินการเอง

**มี browser tool:** เปิดหน้า อ่านข้อกำหนด กรอกร่าง ตรวจหน้า และหยุดก่อน action ที่มีผลผูกพัน

ถ้า browser ใช้งานไม่ได้ ให้ fallback เป็นรายการข้อมูลทันที ไม่ทำให้ผู้ใช้ติดขั้นตอน

## 2. Login & Remembered Session

### ครั้งแรก
1. เปิดหน้า login ที่ถูกต้อง
2. ให้ **ผู้ใช้กรอก username/password เอง**
3. MFA, CAPTCHA, passkey, recovery หรือ device approval ต้องให้ผู้ใช้ทำเอง
4. หลัง login สำเร็จ จึงถามว่า **“ต้องการให้เครื่องนี้จำการเข้าสู่ระบบครั้งถัดไปหรือไม่”**
5. ถ้าผู้ใช้ยินยอม:
   - ใช้ browser/OS credential store หรือ authenticated session ที่ runtime รองรับ
   - `.env` เก็บได้เฉพาะ configuration/credential reference เช่น `STEP_BROWSER_CREDENTIAL_REF`
   - local browser profile ถ้าจำเป็นให้อยู่ใต้ `.step-ai/browser-profile`
6. ถ้าไม่มี secure credential/session persistence ให้ไม่บันทึก password และ login ใหม่ครั้งถัดไป

### ครั้งต่อไป
- ลองใช้ authenticated session ที่มีอยู่ก่อน
- ถ้า session หมดอายุ ให้หยุดและคืนหน้า login ให้ผู้ใช้
- ห้ามขอให้ผู้ใช้วาง password ลง chat
- ห้ามอ่านข้อความ secret ออกมาแสดงหรือบันทึกลง log/output

รายละเอียดดู `rules/browser-credential-safety.md`

## 3. Form Workflow

1. รวบรวมข้อมูลจากคำถามและไฟล์แนบ
2. เปิดหน้าและสำรวจ required fields
3. กรอกร่างเฉพาะข้อมูลที่มีหลักฐาน/ผู้ใช้ให้มา
4. ถ้าขาด field สำคัญ ให้ถามเฉพาะข้อมูลที่ขาด
5. สรุปสิ่งที่กำลังจะส่งให้ผู้ใช้ตรวจ
6. หยุดที่ Human Confirmation Gate
7. กด Submit/Confirm/Book ได้เฉพาะเมื่อผู้ใช้ยืนยันชัดเจนในรอบปัจจุบัน

การ login ที่จำไว้ **ไม่ใช่** การยินยอมให้ submit อัตโนมัติ

## 4. ขอบเขต

### ทำได้
- เปิดเว็บและอ่านข้อกำหนดของฟอร์ม
- กรอก draft fields / dropdown / attachment
- reuse authenticated session ที่ user opt-in ไว้
- ตรวจ required fields และสรุป preview
- ถ่าย screenshot เฉพาะเมื่อไม่มี secret/PII ที่ไม่จำเป็นปรากฏ

### ต้องยืนยันก่อน
- Submit form
- Confirm booking
- ส่งข้อความออกภายนอก
- action ที่สร้าง/แก้ไข/ยกเลิกข้อมูลจริง

### Human-only / ห้ามทำ
- อนุมัติงบ ตัดสินจัดซื้อ ลงนาม จ่ายเงิน
- bypass MFA/CAPTCHA/passkey/device approval
- เก็บ password/token/cookie/MFA code แบบ plaintext
- export browser profile หรือ credential store ออกจากเครื่อง
- เปิดเผย credential ใน chat, output, log หรือ screenshot

## 5. Shared Device Rule

ถ้าเป็นเครื่องส่วนกลาง/สาธารณะ:
- `STEP_BROWSER_REMEMBER_LOGIN=false`
- ไม่สร้าง persistent profile
- logout เมื่อจบงาน
- ไม่ใช้ saved credential

## 6. ตัวอย่าง

ผู้ใช้: ช่วยกรอกแบบฟอร์มขอใช้ห้องประชุมจากข้อมูลโครงการนี้

ระบบ:
- ถ้ามี session: เปิดหน้าแบบฟอร์มต่อได้
- ถ้าไม่มี session: เปิดหน้า login และให้ผู้ใช้ login เอง
- กรอก project / date / time / room / attendees / contact
- แสดงข้อมูลที่ยังขาด
- หยุดก่อน Submit และรอ “ยืนยันส่ง”

## เอกสารอ้างอิง

- `rules/browser-credential-safety.md`
- `rules/human-approval.md`
- `rules/secret-safety.md`
- `rules/data-classification.md`
