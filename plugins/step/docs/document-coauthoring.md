# Coauthoring สำหรับเอกสารของ STeP

วิธีเสริม skills เดิม ไม่ใช่ Skill ปลายทางใหม่ ดัดแปลงวิธีจาก Anthropic doc-coauthoring (Apache-2.0) และเขียนใหม่ตาม Source/Authority ของ Harness

ใช้กับเอกสารหลายหัวข้อหรือหลายรอบ เช่น proposal, decision memo และ SOP; งานแก้สำนวนสั้นให้ทำตรงคำขอ ไม่บังคับ interview ทุกครั้ง

1. เก็บบริบทที่ขาดเท่านั้น: ผู้รับ การตัดสินใจ/การกระทำที่ต้องการ template และ source ของข้อเท็จจริง ค้นข้อมูลที่มีอยู่ก่อนถาม รวมคำถามที่จำเป็นในรอบเดียว
2. ทำ outline และ source map แยกข้อเท็จจริง ข้อเสนอ และรอยืนยัน รักษา EXTRACTED_UNVERIFIED ของค่าเครื่องอ่าน ไม่เติม owner/deadline/approval เพื่อให้ครบหัวข้อ
3. ร่างและแก้ทีละส่วนตามคำตอบผู้ใช้ เก็บ decision log ของสิ่งที่ยืนยันและสิ่งที่ยังค้าง ตรวจการแก้ไม่ให้เปลี่ยนมติหรือข้อผูกพัน และไม่สรุปว่าคนยืนยัน raw source ทั้งหมด
4. ก่อนส่ง ให้สร้างคำถามผู้อ่าน 3 ข้อแล้วหา evidence ในร่าง: ต้องทำอะไร เพราะอะไร และข้อมูลใดช่วยตัดสินใจ สำหรับ SOP ให้ลอง normal/missing-input cases
5. บันทึก reader check เป็น question → section/evidence → gap → owner action พร้อม method=author-review หรือ independent-reader ถ้ามีคน/โมเดลใหม่ที่อ่านเฉพาะร่างจริง จึงใช้ independent-reader ได้ ต้องไม่มี prior chat context และไม่ส่งข้อมูลให้ provider เพิ่มโดยไม่มี Privacy/consent ของ host
6. แก้ช่องว่างแล้วตรวจซ้ำเฉพาะคำถามที่ยังค้าง ส่งร่างและรายการที่ต้องยืนยัน ห้ามใช้ reader test เป็น compliance/approval

ถ้าไม่มี independent reader ให้ทำ author-review และระบุสถานะตามจริง ไม่ถือว่าการคาดคำถามเองเป็น blind test ไม่บังคับเพิ่ม sub-agent หรือ live model call

ตัวอย่างสังเคราะห์: ร่าง proposal กล่าวว่า "ดำเนินการเดือนหน้า" แต่ source ไม่มีวันเริ่ม คำถาม "เริ่มวันใด" จึงเป็น gap มี action ขอเจ้าของงานยืนยันวัน แทนใส่วันเอง
