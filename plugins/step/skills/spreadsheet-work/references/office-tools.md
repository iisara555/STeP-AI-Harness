# Office tool contract

Tools ใช้ผ่าน fenced `step-tool` ใน Desktop Chat/Draft ซึ่งมี workspace path, plan mode, permission, Changes และ snapshot gates เดิม ไม่มีการส่งข้อมูลขึ้น cloud จากเครื่องมือ Office

```step-tool
{"tool":"sheet_create","input":"แผนสังเคราะห์.xlsx","args":{"spec":{"sheets":[{"name":"แผนงาน","columns":[{"label":"รหัส","type":"text"},{"label":"ค่าใช้จ่าย","type":"currency"}],"rows":[["00123",100],["00007",200]],"formulas":[{"cell":"B4","formula":"SUM(B2:B3)"}],"source":"ข้อมูลสังเคราะห์จากผู้ใช้"}]}}}
```

- ไม่เขียนทับไฟล์เดิม create สูงสุด 10 sheets, 30 columns, 500 data rows ต่อ sheet; formula ห้ามทับ input/header
- tool protocol จำกัด args ที่ 30,000 อักขระด้วย; ถ้าเกินให้แบ่งงาน ไม่ส่ง request ที่ถูกตัด
- ถ้า host ไม่มี Office tools ให้ระบุ unavailable และขอเปิดงานใน Desktop ที่รองรับ ไม่อ้างว่ามีไฟล์แล้วหรือใช้ shell หลบ gate
- types คือ text/number/currency/percent ค่า percent ส่งเป็นสัดส่วน เช่น 0.15 รหัสส่ง string ไม่ใช่ตัวเลข
- สูตรใหม่รองรับ local arithmetic และ SUM/AVERAGE/MIN/MAX/COUNT/ROUND/IFERROR เท่านั้น ไม่รองรับ external references, named ranges, dynamic arrays หรือ cross-sheet formulas ในรอบนี้
- `sheet_read` ใช้ range สูงสุด 500 cells คืน rows, formulas และ cacheStatus=not-verified
- `sheet_edit` สูงสุด 200 scalar edits; คงข้อมูลของ ZIP parts อื่นไว้ ไม่ใช่การ serialize ทั้ง workbook ด้วย ExcelJS
- edit ปฏิเสธ formula cells, array formula ranges, protected sheets, merged non-anchor และ signed/macro packages
- เอกสารส่งไม่เกิน 8 MB และ expanded package ไม่เกิน 32 MB; worker มี heap limit 256 MB และ deadline 20 วินาที
- สถานะ required-in-spreadsheet-application หมายถึงยังต้อง recalculate; ไม่มีการรับรองผลคำนวณ

PowerPoint: `slides_create` ใช้ spec.title และ slides[{title,bullets?,table?,chart?,notes?,source?}]; แต่ละ slide เลือก bullets/table/chart อย่างเดียว ดู [PPTX contract](../../presentation-design/references/editable-pptx.md)
