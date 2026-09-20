---
name: browser-form-assistant
description: ผู้ช่วยร่างและตรวจทานข้อมูลแบบฟอร์มออนไลน์แบบมีมนุษย์กำกับ รองรับการใช้ authenticated session แบบ local โดยไม่เก็บ password แบบ plaintext และไม่ส่งแทนโดยพลการ
standardVersion: 2
---

# Browser Form Assistant

## Purpose

ช่วยบุคลากร STeP เปิดเว็บ เตรียมข้อมูล กรอกร่าง และตรวจทานแบบฟอร์ม เช่น จองห้องประชุม ขอใช้สถานที่ หรือลงทะเบียนงานธุรการ โดยคง **Human Confirmation Gate** ก่อน action ที่มีผลจริง

หลักการ: **Login safely → Draft → Review → Confirm → Submit**

## เมื่อควรใช้

- กรอกแบบฟอร์มออนไลน์ของหน่วยงานภายในหรือภายนอก
- ตรวจว่าแบบฟอร์มต้องการข้อมูลอะไรบ้างก่อนลงมือกรอก
- ทวนข้อมูลที่จะส่งก่อนกดยืนยัน

**Anti-trigger:**
- งานที่ต้องอนุมัติ จ่ายเงิน หรือลงนาม ให้หยุดและส่งต่อผู้มีอำนาจ
- ตรวจเนื้อหาเอกสารก่อนส่ง ให้ใช้ `document-review`
- แบบฟอร์มที่มีข้อมูลส่วนบุคคลจำนวนมาก ให้ใช้ `data-privacy-compliance` ก่อน

## Inputs

ขั้นต่ำ:
- URL หรือชื่อแบบฟอร์มที่ต้องกรอก
- ข้อมูลที่จะใช้กรอก

ถ้าขาด field สำคัญ ให้ถามเฉพาะข้อมูลที่ขาด ไม่เดาแทนผู้ใช้

## Source

- แหล่งหลักคือ **หน้าแบบฟอร์มจริงและข้อมูลที่ผู้ใช้ให้มา**
- กติกาด้านความปลอดภัย: `rules/browser-credential-safety.md`, `rules/secret-safety.md`, `rules/human-approval.md`, `rules/data-classification.md`
- ไม่อ้างเงื่อนไขของระบบปลายทางจากความจำ ให้อ่านจากหน้าเว็บจริง

## Workflow

### 1. เลือกทางทำงาน

- **ไม่มี browser tool:** สรุปรายการช่องและข้อความที่จะกรอกให้พนักงานดำเนินการเอง
- **มี browser tool:** เปิดหน้า อ่านข้อกำหนด กรอกร่าง ตรวจหน้า และหยุดก่อน action ที่มีผลผูกพัน

ถ้า browser ใช้งานไม่ได้ ให้ fallback เป็นรายการข้อมูลทันที ไม่ทำให้ผู้ใช้ติดขั้นตอน

### 2. Login และ Remembered Session

ครั้งแรก:
1. เปิดหน้า login ที่ถูกต้อง
2. ให้ **ผู้ใช้กรอก username/password เอง**
3. MFA, CAPTCHA, passkey, recovery หรือ device approval ต้องให้ผู้ใช้ทำเอง
4. หลัง login สำเร็จ จึงถามว่า "ต้องการให้เครื่องนี้จำการเข้าสู่ระบบครั้งถัดไปหรือไม่"
5. ถ้าผู้ใช้ยินยอม ให้ใช้ browser/OS credential store หรือ authenticated session ที่ runtime รองรับ โดย `.env` เก็บได้เฉพาะ credential reference เช่น `STEP_BROWSER_CREDENTIAL_REF` และ local browser profile ถ้าจำเป็นให้อยู่ใต้ `.step-ai/browser-profile`
6. ถ้าไม่มี secure credential/session persistence ให้ไม่บันทึก password และ login ใหม่ครั้งถัดไป

ครั้งต่อไป: ลองใช้ authenticated session ที่มีอยู่ก่อน ถ้า session หมดอายุ ให้หยุดและคืนหน้า login ให้ผู้ใช้

### 3. Form Workflow

1. รวบรวมข้อมูลจากคำถามและไฟล์แนบ
2. เปิดหน้าและสำรวจ required fields
3. กรอกร่างเฉพาะข้อมูลที่มีหลักฐานหรือผู้ใช้ให้มา
4. ถ้าขาด field สำคัญ ให้ถามเฉพาะข้อมูลที่ขาด
5. สรุปสิ่งที่กำลังจะส่งให้ผู้ใช้ตรวจ
6. หยุดที่ Human Confirmation Gate
7. กด Submit / Confirm / Book ได้เฉพาะเมื่อผู้ใช้ยืนยันชัดเจนในรอบปัจจุบัน

**ตัวอย่าง** — ผู้ใช้ขอให้กรอกแบบฟอร์มขอใช้ห้องประชุม: ถ้ามี session ให้เปิดหน้าแบบฟอร์มต่อ ถ้าไม่มีให้เปิดหน้า login และให้ผู้ใช้ login เอง จากนั้นกรอก project / date / time / room / attendees / contact แสดงข้อมูลที่ยังขาด แล้วหยุดก่อน Submit รอคำว่า "ยืนยันส่ง"

## Output

- ร่างข้อมูลที่จะกรอกในแต่ละ field พร้อมที่มาของข้อมูล
- รายการ field ที่ยังขาดหรือรอยืนยัน
- สรุป preview ก่อน submit ให้ผู้ใช้ตรวจ
- ถ้าไม่มี browser tool: รายการช่องและข้อความให้ผู้ใช้กรอกเอง

Screenshot ทำได้เฉพาะเมื่อไม่มี secret หรือ PII ที่ไม่จำเป็นปรากฏ

## Authority

**ทำได้:** เปิดเว็บและอ่านข้อกำหนดของฟอร์ม, กรอก draft fields / dropdown / attachment, reuse authenticated session ที่ผู้ใช้ opt-in ไว้, ตรวจ required fields และสรุป preview

**ต้องยืนยันก่อนทุกครั้ง:** Submit form, Confirm booking, ส่งข้อความออกภายนอก, action ที่สร้าง แก้ไข หรือยกเลิกข้อมูลจริง

**Human-only / ห้ามทำ:** อนุมัติงบ ตัดสินจัดซื้อ ลงนาม จ่ายเงิน, bypass MFA/CAPTCHA/passkey/device approval, เก็บ password/token/cookie/MFA code แบบ plaintext, export browser profile หรือ credential store ออกจากเครื่อง, เปิดเผย credential ใน chat output log หรือ screenshot

**การ login ที่จำไว้ไม่ใช่การยินยอมให้ submit อัตโนมัติ**

## Handoff

- งานที่ต้องอนุมัติหรือลงนาม → ผู้มีอำนาจตาม `manifest/authority.yaml`
- ข้อมูลส่วนบุคคลในแบบฟอร์ม → `data-privacy-compliance`
- เนื้อหาที่ต้องตรวจก่อนส่ง → `document-review`
- ปัญหาการเข้าถึงระบบ → ผู้ดูแลระบบปลายทาง

พร้อมส่งต่อเมื่อ: ทุก required field มีข้อมูลที่ผู้ใช้ยืนยันแล้ว และผู้ใช้เห็น preview ก่อนกดส่ง

## Guardrails

- ห้ามขอให้ผู้ใช้วาง password ลง chat
- ห้ามอ่านข้อความ secret ออกมาแสดงหรือบันทึกลง log หรือ output
- **Shared Device Rule** — บนเครื่องส่วนกลางหรือสาธารณะ ตั้ง `STEP_BROWSER_REMEMBER_LOGIN=false` ไม่สร้าง persistent profile logout เมื่อจบงาน และไม่ใช้ saved credential
- กรอกเฉพาะข้อมูลที่มีหลักฐาน ไม่เติมข้อมูลแทนผู้ใช้เพื่อให้ฟอร์มผ่าน
- รายละเอียดเพิ่มเติมดู `rules/browser-credential-safety.md`
