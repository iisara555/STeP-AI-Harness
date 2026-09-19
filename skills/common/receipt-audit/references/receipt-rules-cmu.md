# Receipt Review Working Guide — STeP / CMU

สถานะ: **working reference only** — ไม่ใช่ current controlled finance policy และห้ามใช้แทน source ที่ AFP/CMU ยืนยัน

เอกสารนี้เก็บวิธีคิดในการตรวจเอกสาร ไม่เก็บเพดาน/สิทธิ/รายการเอกสารบังคับเป็น truth ถาวร เพราะข้อมูลเหล่านั้นอาจเปลี่ยนตามระเบียบ หนังสือเวียน ประเภทโครงการ หรือ approval context

## 1. Document identity

ตรวจจากเอกสารจริงและ current source เมื่อจำเป็น:
- ประเภทเอกสาร
- ผู้ออก / ผู้ซื้อ
- เลขที่เอกสาร / วันที่
- รายการ / จำนวน / ราคา
- tax fields
- project / PO / approval reference

ชื่อ ที่อยู่ เลขผู้เสียภาษี สาขา และรูปแบบ buyer identity ต้อง resolve จาก source ปัจจุบันขององค์กร ห้ามใช้ค่าที่จำได้จากโมเดลเป็นเกณฑ์ definitive

## 2. Tax / e-document checks

ตรวจ field และรูปแบบตาม current official tax source ที่เกี่ยวข้องกับเอกสารชนิดนั้น

หากไม่มี current source:
- ตรวจ arithmetic และ internal consistency ได้
- บอก field ที่เห็น/ไม่เห็นได้
- ห้ามสรุป compliance ทางภาษีแบบ definitive

## 3. Expense ceiling / entitlement

เพดานค่าอาหาร ค่าเดินทาง ค่าที่พัก หรือสิทธิอื่นต้องมาจาก:
1. current organization/CMU policy
2. approval memo / project-specific approval
3. current authoritative external rule เมื่อ applicable

ถ้าหา source ไม่ได้ ให้ `NEED-SOURCE` ห้ามใช้ตัวเลขตัวอย่างเป็นเกณฑ์ตัดสิน

## 4. Disbursement package

ชุดเอกสารที่ต้องใช้แตกต่างตาม transaction และ current AFP checklist

Working categories ที่ช่วยตรวจได้:
- approval evidence
- procurement/order evidence
- delivery/acceptance evidence
- invoice/receipt evidence
- participant/travel/activity evidence เมื่อเกี่ยวข้อง

ห้ามสรุปว่าเอกสารชุดใด “ครบตาม AFP” หาก current checklist ยังไม่ได้รับการยืนยัน

## 5. Cross-document review

เปรียบเทียบข้อเท็จจริง เช่น:
- วันที่
- รายการ/ปริมาณ
- จำนวนเงิน
- vendor/issuer identity
- project/PO reference
- delivery/acceptance evidence

ความไม่ตรงกันให้ระบุเป็น mismatch และขอ AFP/owner review ไม่ตีความเจตนาหรือ fraud เอง

## 6. Status vocabulary

- `VERIFIED` — มี current source/evidence รองรับ
- `FLAG` — เอกสารขัดกันหรือ arithmetic/field มีปัญหา
- `NEED-INFO` — หลักฐานไม่พอ
- `NEED-SOURCE` — ต้องใช้ current policy/checklist แต่ยังไม่มี

## 7. Source rule

Case เก่า, receipt เก่า, chat, email หรือคำตอบ AI ใช้เป็น historical context ได้ แต่ไม่กลายเป็น organization rule โดยอัตโนมัติ
