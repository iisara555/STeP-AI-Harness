# Native Google tool contract

อ่าน operation catalog จาก `google_workspace` args `{"action":"list"}` ทุกงาน catalog ของเครื่องที่ติดตั้งเป็นหลัก ตารางนี้อธิบาย source รุ่นที่ทดสอบ ไม่เพิ่ม scope หรือรองรับ operation เอง

## รูปคำขอ

```json
{"tool":"google_workspace","input":"","args":{"action":"list"}}
```

จากนั้นเลือก `accounts[].handle` ที่ผู้ใช้ต้องการ บัญชีที่ pause/reauth ไม่อยู่ในผล; handle หมดอายุภายในห้านาทีและใช้เฉพาะ session เดิม

```json
{"tool":"google_workspace","input":"sheets.values.get","args":{"action":"execute","account":"<handle-from-list>","params":{"spreadsheetId":"<selected-id>","range":"'ข้อมูล'!A1:B3"}}}
```

เครื่องมือคืน `status`, `operation`, `retrievedAt`, `trust`, `provenance`, `data` และอาจมี `resourceUrl` ไฟล์ Google บางชนิด ผล API อยู่ใน `data` ไม่ใช่ JSON รูปแบบ wrapper ของ Hermes

## Operations

`?` = optional; ID ต้องมาจากผลจริง/ลิงก์ที่ผู้ใช้ให้ ไม่มี arbitrary URL, service account, shell, custom HTTP หรือ arbitrary API method

| Operation | params | body | ผลกระทบ |
| --- | --- | --- | --- |
| `drive.list` | query?, pageToken? | — | อ่านทีละ 20 ไฟล์; query เป็น Drive syntax ไม่ใช่ Gmail syntax |
| `docs.get` | documentId | — | อ่านเอกสารและ revisionId; ไม่รับรองครบทุก tab |
| `docs.create` | — | title | สร้างเอกสารว่าง ไม่ seed body ในคำขอนี้ |
| `docs.appendText` | documentId | text, requiredRevisionId | เพิ่มข้อความท้ายเอกสารจาก revision ล่าสุด; ไม่มี tab selector |
| `sheets.get` | spreadsheetId | — | อ่าน metadata ชีต; ไม่รวม grid data |
| `sheets.values.get` | spreadsheetId, range | — | อ่านค่าที่แสดงใน A1 range; ไม่ใช่ผลตรวจสูตร/ชนิดเซลล์ครบถ้วน |
| `sheets.create` | — | title | สร้าง spreadsheet ว่าง |
| `sheets.values.update` | spreadsheetId, range | values | เขียน RAW rectangular range ตรงขนาด; ≤100 แถว และ ≤500 cells |
| `slides.get` | presentationId | — | อ่าน slide และ revisionId |
| `slides.create` | — | title | สร้าง presentation ว่าง |
| `slides.appendTextSlide` | presentationId | text, requiredRevisionId | เพิ่ม slide ข้อความใน presentation ที่อ่าน revision ล่าสุด |
| `gmail.list` | query?, pageToken? | — | อ่านรายการ message IDs ทีละ 20 ไม่ใช่ full body หรือทุก thread |
| `gmail.get` | messageId | — | อ่าน header และ plain-text body; HTML-only/attachments อาจอ่านไม่ได้ |
| `gmail.draft` | — | to (email array), subject, text | สร้าง draft ใน Gmail; ไม่ใช่การส่ง |
| `gmail.send` | — | to (email array), subject, text | ส่งข้อความใหม่จริง ไม่มี reply/threadId/CC/BCC/attachments |
| `calendar.list` | pageToken? | — | อ่านรายการ Calendar ที่เข้าถึงได้ ทีละ 20 |
| `calendar.events` | calendarId, timeMin, timeMax, pageToken? | — | อ่านนัดในช่วง RFC3339 ที่ระบุ timezone ทีละ 20 |
| `calendar.createEvent` | calendarId | summary, text?, start, end, attendees? (email array) | สร้างนัดและ `sendUpdates=all`; ผู้เข้าร่วมได้รับคำเชิญ |
| `tasks.lists` | pageToken? | — | อ่าน task list ทีละ 20 |
| `tasks.list` | tasklistId, pageToken? | — | อ่าน task ทีละ 20 ตาม API default ไม่รับรองรวม completed/hidden |
| `tasks.create` | tasklistId | title, text? | สร้าง task ไม่มี due date argument |
| `tasks.complete` | tasklistId, taskId | — | เปลี่ยน task เป็น completed |
| `chat.spaces` | pageToken? | — | อ่าน spaces ทีละ 20 |
| `chat.messages` | spaceId, pageToken? | — | อ่าน messages ทีละ 20 |
| `chat.send` | spaceId | text | ส่งข้อความจริง ≤4,000 ตัวอักษร |
| `meet.get` | spaceId | — | อ่าน Meet space ไม่ได้สร้างประชุม/อ่าน transcript |

## ขอบเขตการอ่าน

ถ้าผล list มี `nextPageToken` และจำเป็นต่อโจทย์ ให้เรียกต่อด้วย query/ช่วงเดิม จำกัดเริ่มต้น 3 pages ต่อรายการ และอ่าน Gmail เต็มไม่เกิน 10 messages ที่เกี่ยวกับงานก่อน สรุป coverage และขอขยายเมื่อจำเป็น ไม่ใช้ `resultSizeEstimate` เป็นจำนวนที่อ่านจริง

Drive query ตัวอย่าง: `trashed = false and mimeType = 'application/vnd.google-apps.document' and name contains 'ประชุม'` หากค้นได้ไฟล์ชื่อซ้ำ ต้องยืนยัน ID ก่อนแก้ การไม่มีผลภายใต้ `drive.file` ไม่ยืนยันว่าไม่มีไฟล์ใน Drive ทั้งหมด

สคริปต์ [check-contract.mjs](../scripts/check-contract.mjs) และ [fixtures](tool-contract.json) ใช้ตรวจ offline ใน source checkout เท่านั้น ไม่ใช่คำสั่งให้ AI รันหรือช่องทางเรียก Google เพิ่มเติม
