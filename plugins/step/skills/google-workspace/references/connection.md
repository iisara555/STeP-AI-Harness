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
| จัดโฟลเดอร์ คัดลอก ย้าย อัปโหลดข้อความ และจัดสิทธิ์แชร์ Drive | `drive` |
| Docs, Sheets, Slides ทั้งบัญชีที่ผู้ใช้เปิดได้ | `docs`, `sheets`, `slides` ตามงาน |
| ค้น/อ่าน Gmail | `gmail-read` |
| สร้าง Gmail draft ในบัญชี | `gmail-draft` |
| ส่ง Gmail จริง | `gmail-send` |
| ติดป้ายกำกับ ทำเครื่องหมายอ่าน และเข้า/ออกถังขยะ | `gmail-manage` (ไม่ถือเป็นการอนุญาตส่งอีเมล) |
| สร้าง/แก้ Google Forms และอ่านคำตอบ | `forms` |
| โครงการ โค้ด เวอร์ชัน Deployment และ API Executable | `appscript` พร้อม runtime scopes ที่สคริปต์ใช้ |
| อ่านนัด Calendar อย่างเดียว | `calendar-read` |
| อ่านและสร้างนัด Calendar | `calendar` |
| Google Tasks | `tasks` |
| อ่าน/ส่ง Google Chat | `chat` |
| อ่าน Meet space | `meet` |

ขอเฉพาะบริการที่ต้องใช้ สิทธิ์ที่นโยบายอนุญาตไม่แปลว่า Google grant สำเร็จ ทุก operation ตรวจทั้งบริการที่บัญชีเลือกและ scope จริงอีกครั้ง ค่าเริ่มต้นแอปเสนอบริการทั้ง 7 กลุ่มเพิ่มจาก `documents`, `calendar-read`, `tasks` โดยยังต้องยินยอมบน Google เองและผู้ดูแลจำกัดได้ การสร้างนัด (`calendar`) ยังต้องให้ผู้ดูแลเปิด ไม่แก้ policy จากแชตเพื่อเพิ่มสิทธิ์เอง

บัญชีเดิมไม่ถูกเพิ่มสิทธิ์อัตโนมัติ กด “ปรับบริการที่อนุญาต” ของบัญชีนั้น เลือกบริการ แล้วเชื่อมใหม่ Host ตรวจว่าเป็น Google subject เดิม ก่อนเก็บ grant ใหม่ เปิด Gmail, Drive, Docs, Sheets, Slides, Forms และ Apps Script API ใน Cloud project ของ OAuth client และอนุญาต scope ใน Google Workspace Admin ตามที่ใช้

Apps Script ต้องเปิด API access ใน Apps Script settings สำหรับการจัดการโครงการ ส่วนการรันต้องใช้ API Executable deployment ใน standard Cloud project เดียวกับ OAuth client พร้อมสิทธิ์ครบ Project OAuth Scopes ของสคริปต์ แอปไม่ขอ runtime scopes เพิ่มเอง หากสคริปต์ใช้สิทธิ์ที่แอปไม่มี ให้ผู้ดูแลจัดโครงการ/สิทธิ์ก่อน ไม่รันซ้ำหรือเปลี่ยนไปใช้ shell

## Error → ขั้นตอนถัดไป

| รหัส | ทำอย่างไร |
| --- | --- |
| `GOOGLE_WORKSPACE_DISABLED` / `FEATURE_DISABLED` / `TOOL_UNAVAILABLE` | แสดงข้อจำกัดจาก host; ตรวจ Settings/นโยบาย ไม่เรียก MCP เป็น fallback |
| `GOOGLE_NOT_CONFIGURED` | ผู้ดูแลตรวจ OAuth client และ domain ใน managed policy |
| `GOOGLE_SCOPE_MISSING` / `GOOGLE_SERVICE_DISABLED` | ตรวจบริการที่อนุญาต แล้วเชื่อมใหม่เฉพาะบริการที่ต้องใช้ |
| `GOOGLE_REAUTH_REQUIRED` | ผู้ใช้เชื่อมใหม่ใน Settings ไม่ส่ง token เข้า AI |
| `GOOGLE_ACCOUNT_CHANGED` | โหลด catalog ใหม่และยืนยันบัญชีเดิมกับผู้ใช้; handle หมดอายุหรือ session/นโยบายเปลี่ยน |
| `VAULT_SUSPENDED` | หยุดอ่านข้อมูล ใช้ `nextAction` จาก host: ตั้งค่าพื้นที่ทำงาน → รหัสผ่านและการเชื่อมต่อ → กลับมาใช้งาน ไม่ต้องลงชื่อหรือกรอกรหัสผ่าน Google ใหม่ ไม่เรียก `browser_vault` เพื่อขอรหัสผ่าน และไม่อ้างว่าไม่มีนัดจากการอ่านที่ถูกพัก |
| `GOOGLE_ACCESS_DENIED` | ตรวจบัญชี, pause, domain, สิทธิ์ไฟล์ และข้อจำกัดองค์กร; ไม่ย้ายข้อมูลไปบัญชีอื่น |
| `GOOGLE_QUOTA_LIMIT` | หยุดและบอกข้อจำกัด ไม่ rapid-fire retry |
| `GOOGLE_REQUEST_FAILED` | ตรวจสถานะบริการ/API/เป้าหมาย ไม่อ้างว่าไม่มีไฟล์จาก request ที่ล้มเหลว |
| `GOOGLE_OUTCOME_UNKNOWN` | อาจเขียนแล้ว ห้ามทำซ้ำทันที ใช้ read ที่รองรับหรือให้ผู้ใช้ตรวจ Google ก่อน |
| `GOOGLE_SOURCE_CHANGED` | อ่าน Apps Script getContent ใหม่ ตรวจไฟล์ที่แก้/ลบ แล้วใช้ contentHash ล่าสุด |
| `GOOGLE_REDACTED_SOURCE` | ไฟล์ที่แก้มี credential ถูกปิดบัง ให้แก้ไฟล์นั้นใน Google โดยตรง ไฟล์อื่นที่ไม่ได้แก้ Host เก็บไว้ตามเดิม |
| `GOOGLE_TEXT_ONLY` | เปิดไฟล์ไบนารีใน Google; คำสั่งโอน/อ่านไฟล์รองรับข้อความ UTF-8 เท่านั้น |
| `CANCELLED` / `PRIVACY_REVIEW_REQUIRED` | หยุด action; ปรับขอบเขต/ปกปิดข้อมูลตาม host ไม่หลบ gate |

Token refresh และการเก็บ credential เป็นหน้าที่ host/Vault Skill ไม่เปิดไฟล์หรือรัน setup.py ของ Hermes
