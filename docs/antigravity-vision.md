# Gemini ผ่าน Antigravity: แนวทางอ่านภาพ

ตรวจสอบเมื่อ 2026-10-31 บน source `main` หลัง Desktop 0.6.23

**แนวทางที่ควรทดลองคือส่งภาพผ่าน MCP ของ Antigravity ด้วยบัญชีที่ลงชื่อเข้าใช้ไว้**
ไม่ต้องเพิ่ม Gemini API key แต่การเรียกโมเดลอาจใช้โควตาของบัญชี Antigravity ตามแพ็กเกจและเงื่อนไขของ Google
ตอนนี้ยังเป็นตัวทดสอบสำหรับนักพัฒนา ไม่ได้เปิดความสามารถอ่านภาพใน STeP Desktop

## สาเหตุที่แอปยังอ่านภาพไม่ได้

- `desktop/src/vision-transport.ts` ไม่ระบุ Antigravity เป็นการเชื่อมต่อที่รับภาพ
- `AntigravityAdapter.check` ใน `desktop/electron/antigravity.ts` ปฏิเสธ `context.images` ด้วย `VISION_UNAVAILABLE`
- เหตุผลตรงกับ [เอกสาร headless ของ Google](https://antigravity.google/docs/cli/headless/):
  `--input-format stream-json` รับ string หรือ text blocks เท่านั้น การส่ง image block จบด้วย error
- แม้เปิดรายการ provider ใน UI ภาพก็ยังไม่ถึงโมเดล และการแปลงภาพเป็น OCR text ไม่ได้ทำให้โมเดลเห็นสี รูปร่าง ตำแหน่ง หรือลายเซ็น
- MCP bridge ปัจจุบัน (`antigravity-mcp-bridge.ts`) ส่งผลลัพธ์เป็น text ที่ครอบ JSON อีกชั้น จึงใช้ส่งภาพตรง ๆ ไม่ได้เช่นกัน

## เส้นทางที่ทดลอง

```text
ภาพที่ผู้ใช้อนุญาต
  → STeP เตรียมสำเนาภาพสำหรับคำขอนี้
  → MCP tool ส่ง { type: "image", mimeType: "image/png", data: "<base64>" }
  → Antigravity CLI ส่ง inline media ให้ Gemini
  → Gemini ตอบจากภาพ
```

ภาพต้องเป็น MCP image content จริง ไม่ใช่ base64 ใน text, JSON ที่ stringify แล้ว, ชื่อไฟล์ หรือ URL ที่โมเดลเปิดไม่ได้

**ต้องจัด permissions ให้ไม่ขัดกัน:** [เอกสาร CLI permissions](https://antigravity.google/docs/permissions?tab=cli)
ระบุว่า Deny ชนะ Allow เสมอ ใน source ปัจจุบัน bridge ตั้งทั้ง `deny: mcp(*)` และ allow เฉพาะ `step_host`;
รูปแบบนี้ตามเอกสารจะบล็อก MCP แม้มี allow ชื่อเฉพาะ ตัว probe จึงใช้ strict mode กับ catalog ที่มีเครื่องมือภาพเดียว
และ allow เฉพาะเครื่องมือนั้น โดยยัง deny การอ่าน/เขียนไฟล์ URL และคำสั่งทั้งหมด
การแก้ permissions ของ bridge ในแอปจริงต้องทดสอบแยก รวมถึงการปฏิเสธเครื่องมือที่ไม่อนุญาต

หลักฐานจากผู้พัฒนา:

- [Google MCP documentation](https://antigravity.google/docs/mcp?tab=cli) รองรับการต่อ local stdio MCP server กับ CLI
- [Official CLI changelog](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md):
  รุ่น 1.1.5 แก้ MCP tool results ที่มี embedded resources ถูกทิ้ง และระบุว่าข้อความกับ inline media เข้าบทสนทนาได้;
  รุ่น 1.1.16 ระบุการ inline image resources ใน `read_resource`
- แอปปัก CLI รุ่น 1.3.2 ซึ่งใหม่กว่าสองรายการนี้ แต่ release notes ยังไม่ใช่หลักฐานว่าภาพจาก bridge นี้ถึง Gemini
  บนบัญชีของพนักงานจริง จึงต้องทดสอบก่อนเปลี่ยนสถานะในแอป

## ตัวทดสอบที่เตรียมไว้

ไฟล์ `desktop/scripts/probe-antigravity-vision.ts` ใช้ native CLI กับการแยก profile แบบเดียวกับ Desktop:

1. สร้าง PNG ใหม่ มีรูปทรงและสีสุ่ม 6 ตำแหน่ง ไม่มีข้อความ เฉลย หรือ metadata ที่บอกคำตอบ
2. เก็บเฉลยในหน่วยความจำของตัวตรวจเท่านั้น ไม่ใส่ในคำถาม ชื่อไฟล์ หรือ MCP result
3. ใช้ agent ชั่วคราวที่อนุญาตเฉพาะ `read_probe_image` ไม่มีเครื่องมืออ่านไฟล์ทั่วไป shell หรือ URL
4. เปิดส่งภาพหลังตรวจ `init`: agent, folder, model และ `strict` permission ต้องตรงทั้งหมด
5. ส่ง pixels ผ่าน stdio MCP และตรวจว่ามีการขอภาพจริงพร้อม SHA-256 ตรงกับภาพต้นฉบับ
6. ตรวจสี รูปร่าง และลำดับตำแหน่งจากคำตอบสุดท้าย รวมถึงผลจบ process ต้องสำเร็จ
7. ลบภาพ profile และข้อมูลชั่วคราวเมื่อ process จบแน่นอน; ไม่พิมพ์ token, stderr หรือคำตอบดิบลงรายงาน

ตัวทดสอบส่งเฉพาะภาพสังเคราะห์ ไม่รับภาพเอกสารหรือ URL จากผู้ใช้ ไม่มี API key และไม่มีการเรียกบริการสำรอง
มันไม่ติดตั้งหรืออัปเดต `agy` และไม่เปิดสิทธิ์ในแอปให้เอง

บนเครื่องที่ติดตั้ง `agy` รุ่น 1.3.2 ขึ้นไปและลงชื่อเข้าใช้ด้วยบัญชี Antigravity แล้ว:

```sh
cd desktop
npm ci
npx tsx scripts/probe-antigravity-vision.ts --agy /absolute/path/to/agy --model gemini-3.8-flash-medium
```

Windows ใช้ path ของ `agy.exe` เช่น `--agy "C:\path\to\agy.exe"`; เลือกชื่อโมเดลที่บัญชีใช้ได้จาก `agy models`
ไม่ใช้ API key และไม่ลงชื่อเข้าใช้ใหม่อัตโนมัติ หากยังไม่ลงชื่อเข้าใช้ ให้ทำผ่านขั้นตอนปกติของ Antigravity ก่อน

รายงานมีเฉพาะ `version`, `model`, `imageDelivered`, `visualAnswerCorrect`:

| ผล | ความหมาย |
| --- | --- |
| ทั้งสองค่าเป็น `true`, exit 0 | MCP ส่งภาพและคำตอบตรงกับภาพทดสอบครั้งนี้ |
| `imageDelivered: true`, `visualAnswerCorrect: false`, exit 2 | MCP ส่งภาพแล้ว แต่ยังยืนยันว่าโมเดลเข้าใจไม่ได้ |
| `imageDelivered: false`, exit 2 | ไม่มีหลักฐานส่งภาพ ห้ามถือว่าคำตอบมาจากภาพ |
| exit 1 | การเชื่อมต่อ สิทธิ์ รูปแบบข้อมูล หรือเวลาทำงานไม่ผ่าน |

`imageDelivered` เป็นหลักฐานที่ฝั่ง MCP ส่งภาพให้ CLI ไม่ใช่ acknowledgement จาก Google;
ต้องพิจารณาคู่กับคำตอบจากโมเดลจริง สคริปต์ fixture ใน automated tests ไม่ถือเป็น live acceptance

## เกณฑ์ก่อนนำเข้าแอป

- ผ่าน probe หลายภาพทั้ง Windows และ macOS ด้วย CLI/โมเดลที่แอปใช้จริง
- ทดสอบภาพสังเคราะห์ที่มีข้อความไทย ตาราง แผนภาพ และช่องลายเซ็นเพิ่มเติม;
  probe สี/รูปทรงยืนยันได้เพียงการเข้าถึงภาพเบื้องต้น ไม่ใช่ความแม่นยำของ OCR หรือการรับรองลายเซ็น
- ต่อเข้าจุดเตรียมภาพและ consent เดิมของ STeP; จำกัดจำนวน ขนาด และ MIME ตามข้อจำกัดเดิม
  ให้ bridge คืนได้เฉพาะสำเนาภาพที่อนุญาตสำหรับคำขอนี้ ไม่รับ arbitrary path/URL
- แยกอายุภาพต่อคำขอ ไม่เก็บติด idle spare/conversation ข้ามงาน; หยุดและล้างเมื่อยกเลิก
- คงภาพและข้อกำหนดการอ่านไว้ในรอบ tool continuation; ห้าม fallback เป็น text-only แล้วอ้างว่าอ่านภาพ
- ส่งข้อความชัดเจนเมื่อส่งภาพไม่สำเร็จ และไม่สลับบริการ AI อัตโนมัติ
- ค่อยปรับ capability/UI และ regression tests หลังมีหลักฐาน live; คงนโยบายใบเสร็จ local-only ตามเดิม

## ขอบเขตผลตรวจครั้งนี้

ยืนยันข้อจำกัด `stream-json` จากเอกสารทางการ และทดสอบ standard MCP image transport,
การตรวจคำตอบจาก pixels, การปฏิเสธเครื่องมืออื่น และ cleanup ด้วย synthetic CLI fixture
สภาพแวดล้อมงานนี้ไม่มี native `agy` ที่ลงชื่อเข้าใช้ไว้ จึงยังไม่ได้เรียก Gemini จริง
ไม่มีการปล่อยรุ่นใหม่หรือเปลี่ยนสถานะ Antigravity ใน Desktop ให้รับภาพ
