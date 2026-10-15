# เชื่อม Google ใน STeP Desktop

## ตรวจจากเครื่องมือก่อน

`tool_describe` input `google_workspace` บอกความพร้อมตามนโยบาย; `google_workspace` input ว่าง args `{"action":"list"}` คืน `accounts` และ `operations` เท่านั้น ไม่มี token

- ไม่มีบัญชี: เปิด Settings → ส่วน Google Workspace กดเชื่อมและเลือกบริการที่งานต้องใช้ ผู้ใช้ล็อกอิน/ยินยอมบนหน้า Google ใน browser แล้วกลับเข้าแอป ไม่ส่ง redirect URL หรือ auth code ลงแชต
- มีหลายบัญชี: ให้เลือกบัญชีแบบปกปิดที่แอปแสดง ถ้าชื่อแยกไม่ได้ให้ตรวจบัญชีใน Settings ไม่ให้ AI ขออีเมลเต็มโดยไม่จำเป็น
- บัญชี pause/reauth จะไม่อยู่ใน catalog: ให้ผู้ใช้กลับไปเปิดใช้งานหรือเชื่อมใหม่ใน Settings ไม่เปลี่ยนไปใช้อีกบัญชีเงียบ ๆ
- นโยบายปิดบริการหรือยังไม่มี OAuth client: ผู้ดูแลตั้งค่า OAuth client/API/audience/domain และบริการใน managed policy ครั้งเดียว ไม่ใช่ให้พนักงานสร้าง Cloud project ทุกคน

## บริการกับสิทธิ์

| งาน | ชื่อบริการที่ต้องมีในบัญชีและนโยบาย |
| --- | --- |
| Docs/Sheets/Slides ที่แอปเข้าถึงได้ + สร้าง/แก้ | `documents` (`drive.file`; ไม่ใช่สิทธิ์อ่านทุกไฟล์) |
| ค้น/อ่าน Drive และเอกสารที่บัญชีเข้าถึง | `drive-read` |
| ค้น/อ่าน Gmail | `gmail-read` |
| สร้าง Gmail draft ในบัญชี | `gmail-draft` |
| ส่ง Gmail จริง | `gmail-send` |
| อ่าน/สร้างนัด Calendar | `calendar` |
| Google Tasks | `tasks` |
| อ่าน/ส่ง Google Chat | `chat` |
| อ่าน Meet space | `meet` |

ขอเฉพาะบริการที่ต้องใช้ สิทธิ์ที่นโยบายอนุญาตไม่แปลว่า Google grant สำเร็จ ทุก operation ตรวจ scope จริงอีกครั้ง ค่าเริ่มต้นแอปเปิด `documents`, `calendar`, `tasks`; งาน Gmail ต้องให้ผู้ดูแลอนุญาตก่อน ไม่แก้ policy จากแชตเพื่อเพิ่มสิทธิ์เอง

## Error → ขั้นตอนถัดไป

| รหัส | ทำอย่างไร |
| --- | --- |
| `GOOGLE_WORKSPACE_DISABLED` / `FEATURE_DISABLED` / `TOOL_UNAVAILABLE` | แสดงข้อจำกัดจาก host; ตรวจ Settings/นโยบาย ไม่เรียก MCP เป็น fallback |
| `GOOGLE_NOT_CONFIGURED` | ผู้ดูแลตรวจ OAuth client และ domain ใน managed policy |
| `GOOGLE_SCOPE_MISSING` / `GOOGLE_SERVICE_DISABLED` | ตรวจบริการที่อนุญาต แล้วเชื่อมใหม่เฉพาะบริการที่ต้องใช้ |
| `GOOGLE_REAUTH_REQUIRED` | ผู้ใช้เชื่อมใหม่ใน Settings ไม่ส่ง token เข้า AI |
| `GOOGLE_ACCOUNT_CHANGED` | โหลด catalog ใหม่และยืนยันบัญชีเดิมกับผู้ใช้; handle หมดอายุหรือ session/นโยบายเปลี่ยน |
| `VAULT_SUSPENDED` / `GOOGLE_ACCESS_DENIED` | ตรวจ Vault, บัญชี, pause, domain, สิทธิ์ไฟล์ และข้อจำกัดองค์กร; ไม่ย้ายข้อมูลไปบัญชีอื่น |
| `GOOGLE_QUOTA_LIMIT` | หยุดและบอกข้อจำกัด ไม่ rapid-fire retry |
| `GOOGLE_REQUEST_FAILED` | ตรวจสถานะบริการ/API/เป้าหมาย ไม่อ้างว่าไม่มีไฟล์จาก request ที่ล้มเหลว |
| `GOOGLE_OUTCOME_UNKNOWN` | อาจเขียนแล้ว ห้ามทำซ้ำทันที ใช้ read ที่รองรับหรือให้ผู้ใช้ตรวจ Google ก่อน |
| `CANCELLED` / `PRIVACY_REVIEW_REQUIRED` | หยุด action; ปรับขอบเขต/ปกปิดข้อมูลตาม host ไม่หลบ gate |

Token refresh และการเก็บ credential เป็นหน้าที่ host/Vault Skill ไม่เปิดไฟล์หรือรัน setup.py ของ Hermes
