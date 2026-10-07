# Editable PowerPoint

เมื่อผู้ใช้ขอ `.pptx` ให้ใช้ `slides_create` ใน Desktop แทนการส่ง HTML อย่างเดียว ส่วน HTML interactive ใช้ workflow เดิม

```step-tool
{"tool":"slides_create","input":"โครงการสังเคราะห์.pptx","args":{"spec":{"title":"โครงการสังเคราะห์","slides":[{"title":"สถานะปัจจุบัน","bullets":["เสร็จแล้วสองขั้นตอน","รอยืนยันกำหนดส่ง"],"notes":"ข้อมูลสำหรับทดสอบ","source":"ข้อมูลสังเคราะห์จากผู้ใช้"},{"title":"แผนงาน","table":{"headers":["งาน","สถานะ"],"rows":[["ทดสอบ","ร่าง"]]}},{"title":"ผลสังเคราะห์","chart":{"type":"bar","categories":["รอบแรก","รอบสอง"],"series":[{"name":"จำนวน","values":[2,3]}]}}]}}}
```

เครื่องมือสร้าง text/table/chart ที่แก้ต่อได้ พร้อม speaker notes และ source; ไม่ rasterize ทั้งสไลด์ ไม่อ้างว่าเป็น template CI ที่ได้รับอนุมัติ

ถ้า host ไม่มี `slides_create` ให้ระบุ unavailable และส่งต่อ Desktop ที่รองรับ ไม่อ้างว่า HTML export คือไฟล์ PPTX ที่ผู้ใช้ขอ

ขอบเขต: สร้างไฟล์ใหม่เท่านั้น ไม่เขียนทับหรือแก้ PPTX เดิม; สูงสุด 20 สไลด์ ชื่อ 80 อักขระ และหนึ่งใน bullets/table/chart ต่อสไลด์ bullets ไม่เกิน 5 ข้อ ข้อละ 140 อักขระ ตารางไม่เกิน 5 columns/7 data rows กราฟ bar/line/pie ไม่เกิน 8 categories/3 series (pie ใช้หนึ่ง series) ถ้าเกินให้แบ่งสไลด์หรือขอให้คนเลือกเนื้อหา ไม่ตัดสาระเอง

หลังนำ Changes ไปใช้ ให้เปิด PowerPoint/LibreOffice หรือ renderer ที่พร้อมเพื่อตรวจทุกหน้า: ไทย/วรรณยุกต์ไม่ตก ข้อความไม่ล้น ตารางไม่ทับ footer กราฟอ้างข้อมูลตรง และ notes ครบ แยกผล structural checks จาก visual review; ถ้า renderer ไม่พร้อมให้ระบุ visual review ยังไม่รัน

ใช้ IBM Plex Sans Thai; ตรวจฟอนต์บนเครื่องปลายทางด้วย เมื่อต้องใช้ template เดิมอย่างละเอียดให้ส่งต่อผู้ใช้/ดีไซเนอร์ ไม่อ้างว่า importer/exporter รักษาทุก feature ได้
