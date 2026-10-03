# Output File Management

กฎนี้ใช้กับไฟล์งานที่ AI สร้างให้ผู้ใช้ เช่น DOCX, PDF, PPTX, XLSX, CSV, HTML, รูปภาพ, รายงาน และไฟล์ส่งมอบอื่น ๆ

## หลักการ

- เก็บไฟล์ที่สร้างใหม่ไว้ใต้โฟลเดอร์ `output/` เว้นแต่ผู้ใช้ระบุปลายทางเอง
- ห้ามย้ายหรือเปลี่ยนชื่อไฟล์ต้นฉบับของผู้ใช้โดยอัตโนมัติ
- `output/` เป็นไฟล์งานเฉพาะเครื่องและอยู่ใน `.gitignore`; ห้าม commit ผลงานภายในโดยไม่ตั้งใจ
- ถ้าผู้ใช้ระบุชื่อไฟล์หรือ path ชัดเจน ให้ยึดตามผู้ใช้ก่อน ตราบใดที่ปลอดภัย

## โครงสร้างโฟลเดอร์มาตรฐาน

```text
output/
└─ <TEAM>/
   └─ <YYYY>/
      └─ <MM>/
         └─ <TYPE>/
```

ตัวอย่าง:

```text
output/CC/2026/09/presentation/
output/AFP/2026/09/document/
output/MI/2026/09/spreadsheet/
output/SHARED/2026/09/image/
```

- `TEAM`: ใช้รหัสทีมจาก USER.md / workspace เช่น CC, MI, AFP, PITI หากไม่ทราบให้ใช้ `SHARED`
- `TYPE`: ใช้ประเภทที่สื่อความหมาย เช่น `document`, `presentation`, `spreadsheet`, `image`, `report`, `data`, `web` หรือประเภทงานเฉพาะที่สั้นและค้นหาได้

## รูปแบบชื่อไฟล์

```text
YYYYMMDD_TEAM_TYPE_TITLE_vNN.ext
```

ตัวอย่าง:

```text
20260918_CC_presentation_STeP-Booth-CMU_v01.pptx
20260918_GA_document_หนังสือขอใช้สถานที่_v02.docx
20260918_MI_spreadsheet_Market-Test-Summary_v01.xlsx
```

### กติกาตั้งชื่อ

1. วันที่ใช้รูปแบบ `YYYYMMDD`
2. รหัสทีมเป็นตัวพิมพ์ใหญ่
3. ชื่องานควรสั้นแต่ค้นหาเจอได้ และเก็บ Project ID / Job ID ถ้ามี
4. แทนช่องว่างด้วย `-` และตัดอักขระต้องห้ามของ Windows/macOS
5. ใช้เวอร์ชัน `v01`, `v02`, `v03` ตามลำดับ
6. ห้ามใช้คำว่า `final-final`, `ล่าสุด`, `new`, `use-this` เป็นระบบเวอร์ชัน
7. ห้ามใส่รหัสผ่าน Token เลขบัตรประชาชน หรือข้อมูลอ่อนไหวในชื่อไฟล์

## เมื่อ AI สร้างไฟล์

ก่อนบันทึกไฟล์ ถ้าเครื่องมือสามารถเข้าถึง workspace ได้ ให้หา path ถัดไปด้วย:

```bash
step-ai output --team cc --type presentation --title "STeP Booth CMU" --ext pptx
```

หรือแบบ JSON สำหรับ automation:

```bash
step-ai output --team cc --type presentation --title "STeP Booth CMU" --ext pptx --json
```

จากนั้นบันทึก artifact ลง path ที่ได้ และบอกผู้ใช้ว่าไฟล์ถูกเก็บไว้ที่ใด

ถ้าเครื่องมือรัน CLI ไม่ได้ ให้สร้างชื่อและโครงสร้างตามกฎเดียวกัน โดยไม่เขียนทับไฟล์เดิม
