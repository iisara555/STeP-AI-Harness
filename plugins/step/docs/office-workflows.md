# Office workflows — first implementation

- Excel: `spreadsheet-work` เป็น draft, route ผ่าน trigger เฉพาะไฟล์ Excel; แผนโครงการ/TOR/การเงินยังใช้ specialist skill
- Desktop เพิ่ม sheet_create และ slides_create พร้อม tool schemas ใน prompt; สร้างไฟล์ใหม่เป็น binary Changes ก่อนใช้ permission mode เดิม ไม่มี policy-default change
- sheet_edit แก้ input XML เฉพาะ worksheet และ calcPr ใน workbook คง decompressed bytes ของ ZIP parts อื่นไว้; ไม่รับรองทุก feature ของ Excel หรือ digital signatures
- PPTX สร้าง editable text/table/chart/notes ด้วย PptxGenJS ที่มีแล้ว; ไม่ใช่ editor ของ PPTX เดิม และไม่จำลอง CI template ที่ไม่มี source
- Coauthoring ปรับ step-writing/document-review/decision-memo/sop-authoring; reader evidence แยก author-review จาก independent-reader
- Google Workspace เป็น optional module แยก ไม่เปิด OAuth/CLI installation/live network หรือส่งเอกสารให้ provider เพิ่ม

## ตรวจด้วยข้อมูลสังเคราะห์

รัน npm test, npm run validate, npm run desktop:test และ npm run desktop:build; `npm run desktop:eval:office` สร้าง artifacts และ contract recordings ใต้ desktop/release/qa/office (ignored)

เปิด XLSX/PPTX ด้วย Excel/PowerPoint หรือ LibreOffice เพื่อตรวจ formula recalculation และ visual rendering บันทึก renderer/version และข้อจำกัดแยกจาก structural tests การรัน mock/scripted tools ไม่ใช่ model-side usefulness หรือ live Google API acceptance

Dependencies เพิ่มการประกาศ jszip/@xmldom/xmldom ที่มีใน lockfile อยู่แล้วสำหรับ package-preserving edit; ไม่เพิ่ม model หรือ .NET runtime ไม่มีการคัดลอก Anthropic document skills ที่เป็น proprietary

## Local evidence — 6 ตุลาคม 2569

- Harness: 936 passed, 2 skipped; Desktop: 414 passed, 2 skipped. TypeScript/production build, npm validator, Python validator และ diff whitespace checks ผ่าน
- 5 paired controlled tasks ตรวจ host/worker contracts และ recovery จาก missing sheet ได้ ไม่ใช่ live model comparison
- LibreOfficeDev 26.8.0.0.alpha0 เปิดและ recalculate สอง XLSX ได้ SUM=300 และ SUM=350 หลังเปลี่ยน input; รหัส 00123 ยังคงเป็นข้อความ
- ตรวจภาพครบ 3 สไลด์สังเคราะห์: ข้อความไทย ตาราง และกราฟอ่านได้ ไม่มีการทับกันที่สังเกตพบในชุดนี้ Renderer ใช้ Noto Sans Thai แทนฟอนต์ IBM Plex Sans Thai ที่ไม่ได้ติดตั้งในระบบ จึงยังต้องตรวจฟอนต์บนเครื่องปลายทาง
- บันทึก metrics/hash/ข้อจำกัดใน evals/tool-usability/office-contract-results-2026-10-06.json; artifacts อยู่ใน ignored QA folder ไม่ใช่เอกสารจริง
- Tests ใน cloud ใช้ homedir จำลองใต้ /tmp เพราะ /home/agent เขียนไม่ได้ ไม่เปลี่ยน runtime config ของ Harness
