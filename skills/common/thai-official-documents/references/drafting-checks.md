# รายการตรวจร่างจากฟอร์มและต้นเรื่อง

คู่มือวิธีการ ไม่ใช่แบบหน่วยงานที่รับรองแล้ว ใช้แบบหน่วยงานปัจจุบันก่อน working template และไม่ออกเลข ลงนาม หรือส่งหนังสือจริง

แยกไฟล์แนบที่เป็นต้นเรื่องของงานนี้จากแบบฟอร์ม/ตัวอย่างที่ใช้เทียบโครง แบบที่กรอกแล้วมีชื่อบุคคล วันที่ เลขหนังสือ รหัสโครงการ หรือเงินเป็นข้อมูลตัวอย่าง ไม่ถือเป็นข้อเท็จจริงของงานใหม่ หากผู้ใช้เลือก `attachmentRole=template` ให้ใช้เฉพาะโครงและชื่อช่อง เติมค่าของงานใหม่จากฟอร์มหรือหลักฐานต้นเรื่องที่แยกได้เท่านั้น หากเลือก `source` ยังต้องตรวจ provenance และความขัดแย้งตาม Skill ไม่ถือว่าคนตรวจยืนยันค่าเครื่องอ่านแล้ว

| ประเภท | โครงที่ใช้ | สิ่งที่ตรวจจากต้นเรื่อง |
|---|---|---|
| บันทึกขออนุมัติ | เรื่องเดิม → ข้อเท็จจริง → ข้อพิจารณา → ข้อเสนอ | ขอให้อนุมัติอะไร หลักฐานงบ/ระเบียบและผู้พิจารณา ไม่เปลี่ยนคำขอเป็นการอนุมัติแล้ว |
| บันทึกขอความเห็นชอบ | โครงเดียวกัน | ระบุเรื่องให้ความเห็นชอบตามคำขอ ไม่เติมอำนาจอนุมัติใช้เงิน |
| บันทึกรายงานผล | ต้นเรื่อง → ผลที่มีหลักฐาน → ประเด็นค้าง → เสนอเพื่อทราบ/พิจารณาตามคำขอ | แยกผลจริงจากผลคาดหวังและข้อเสนอ |
| หนังสือเชิญ | เหตุที่เชิญ → กิจกรรม/บทบาท → กำหนดการ → วิธีตอบรับ | วัน เวลา สถานที่ บทบาท และช่องทางตอบรับที่มีแหล่ง |
| หนังสือตอบกลับ | อ้างถึง → คำตอบตามประเด็น → เงื่อนไข/ขั้นตอนถัดไป | ไม่แสดงว่าผู้ลงนามยอมรับข้อผูกพันที่เจ้าของยังไม่ยืนยัน |
| หนังสือประสานงาน | เหตุที่ติดต่อ → สิ่งที่ขอประสาน → ข้อมูลประกอบ → ผู้ติดต่อ | ไม่เติมกำหนดตอบกลับหรือชื่อผู้ประสานงานเอง |

สำหรับบันทึกภายใน ไม่เพิ่มคำลงท้ายของหนังสือภายนอกโดยอัตโนมัติ คำขึ้นต้นและคำลงท้ายขึ้นกับประเภทและผู้รับตามแบบปัจจุบัน หากไม่มีข้อมูลผู้รับให้เว้นช่อง ไม่เลือก “กราบเรียน” แบบเหมารวม

ลำดับเรื่องเดิม/ข้อเท็จจริง/ข้อพิจารณา/ข้อเสนอเป็นลำดับสาระ ไม่ได้บังคับให้บันทึกทุกฉบับพิมพ์หัวข้อเลข ๑–๔ สำหรับบันทึกสั้นให้ร่างเป็นย่อหน้าต่อเนื่องตามแบบหน่วยงาน ใช้หัวข้อเมื่อแบบหรือความซับซ้อนของเรื่องต้องการ ไม่อ้าง “ตามที่ได้รับอนุมัติ” ถ้าต้นทางไม่มีหลักฐานการอนุมัติเดิม ส่วนงาน/ส่วนราชการใช้ชื่อช่องตามแบบที่ได้รับ ช่องผู้เสนอความเห็นและผู้พิจารณาเพิ่มเฉพาะเมื่อแบบหรือเจ้าของเรื่องระบุ เว้นพื้นที่คำสั่งและลายมือชื่อไว้

Display checks and unresolved items separately from the document; they are not exported letter pages or implied attachments. Keep `[รอยืนยัน: ชื่อช่อง]` for unknown factual values.

## Draft assistance and revision

Draft narrative from the supplied subject and intended purpose even when prose fields are blank. Offer proposed rationale, considerations, coordination wording and a closing request for owner review. Identify proposed wording and assumptions as `AI_PROPOSED` in the separate review. Template placeholders guide the field meaning; draft the supported prose and leave only unknown factual details pending. Actual history, results, recipients, document numbers, amounts, dates, policy conditions and signatures still require current-task evidence. Meeting events and resolutions come only from supplied notes.

For a targeted revision, use the latest draft and change only the requested parts. Preserve unrelated text, tables and user edits; explicit corrections replace the corresponding earlier form value without implying approval.

เลขหนังสือ งบ ผู้ลงนาม และข้อกฎหมายที่ยังไม่มีให้ใช้ `[รอยืนยัน: ชื่อช่อง]` พร้อมรายการข้อมูลที่เจ้าของต้องเติม ข้อความร่างและไฟล์ส่งออกต้องแยกสถานะการตรวจ: ร่างข้อความ → ตรวจความหมาย/แหล่ง → ตรวจจัดหน้าจริง → ผู้มีอำนาจพิจารณา

กฎ PDF/A ลายเซ็นอิเล็กทรอนิกส์ และช่องทางส่งต้อง resolve จากข้อกำหนดหน่วยงานและแหล่งทางการปัจจุบัน ไม่รับรองผลทางกฎหมายของภาพลายเซ็นหรือบังคับ CA จากคู่มือนี้ ฟอนต์ต้องตรงแบบที่ตรวจแล้ว ไม่ถือ TH Sarabun PSK กับ TH Sarabun New เป็นไฟล์เดียวกัน

ดู [ตัวอย่างสังเคราะห์](../examples/memo-missing-facts.md) เมื่อข้อมูลจากฟอร์มไม่ครบ

ดัดแปลงเฉพาะวิธีจัดโครงจาก `thai-government-form` (Boom-Vitt/claude-thai-skills, MIT) เขียนใหม่และใช้ Source/Human Authority ของ STeP
