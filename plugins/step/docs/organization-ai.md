# AI ขององค์กร

องค์กรจ่ายค่า AI ผ่าน gateway กลาง (STeP-AI-Webapp `npm run ai-gateway`, เอกสาร `docs/ai-gateway.md` ใน repo นั้น)
key ของ OpenRouter อยู่บน server เท่านั้น ไม่มีในเครื่องพนักงาน ไม่มีใน Desktop และไม่มีใน repo

## ฝั่ง Desktop

- ตัวเลือก "AI ขององค์กร" ขึ้นเป็นตัวแรกและเป็นตัวที่แนะนำในหน้าเชื่อมต่อ AI เมื่อ `organizationAi` มีอยู่ในนโยบาย
  (bundled ตอน build จากตัวแปร `STEP_ORGANIZATION_AI_URL` หรือ managed policy) และเปิด Google sign-in อยู่
- กดเชื่อมต่อ: ถ้ายังไม่มีบัญชี Google ขององค์กรในแอป จะเปิดหน้าลงชื่อที่ขอแค่ `openid email` (ไม่ขอ Drive, Mail หรือ Calendar)
  แล้วโหลดรายชื่อโมเดลจาก gateway (`step-chat`, `step-long` ฯลฯ) และทดสอบส่งข้อความหนึ่งครั้ง
- งานเอกสารทางการ (ฟอร์มร่างเอกสาร หรือ Skill `tor-government-writing`, `tor-review`, `thai-official-documents`,
  `decision-memo`) ใช้โมเดล `step-long` ให้เอง เมื่อ gateway มีโมเดลชื่อนี้ ถ้าพนักงานเลือกโมเดลเองในงานนั้นจะใช้ตามที่เลือก
- ทุกคำขอส่ง Google ID token ของบัญชีนั้นแทน API key (`Authorization: Bearer …`) token ต่ออายุเองจาก refresh token ที่เก็บใน Vault
  เหมือนบริการ OCR ใบเสร็จขององค์กร ถ้าออกจากระบบ Google หรือถูกถอนสิทธิ์ แชตจะขอให้ลงชื่อใหม่
- ใช้ transport แบบ OpenAI-compatible ตัวเดียวกับ preset อื่น จึงร่างข้อความได้ ยังไม่รองรับการค้นเว็บผ่านผู้ให้บริการ
- โควตาหมดหรือเครดิตองค์กรหมด gateway ตอบ 429 `quota_exceeded` / `credit_balance_exhausted` Desktop แสดงเป็นโควตาหมด
  ไม่ใช่ปัญหาการลงชื่อ

## ก่อนเปิดให้พนักงาน

1. เจ้าของตั้ง OpenRouter และ deploy gateway ตาม `docs/ai-gateway.md` ของ Webapp (Tailscale Funnel เฉพาะ `/ai`)
2. ใส่ client id แบบ Desktop ของ STeP ใน `STEP_GOOGLE_CLIENT_IDS` ของ gateway และอีเมลพนักงานในไฟล์รายชื่อเชิญ
3. วัดคุณภาพโมเดลของ gateway ด้วยเกณฑ์เดิม (`desktop/test/knowledge-accuracy.test.ts`, `npm run eval:golden`,
   `npm run eval:selection`) ต้องไม่ต่ำกว่าที่ใช้อยู่ ([กติกาคุมคุณภาพ](../rules/learning-and-verification.md))
4. ตั้งตัวแปร repository `STEP_ORGANIZATION_AI_URL` แล้วออก Desktop รุ่นใหม่ตามขั้นตอน release ปกติ

## รูปภาพ

เมื่อ gateway เปิด `imageModels` Desktop จะสร้างรูปผ่าน `POST /v1/images` ของ gateway (Images API ของ OpenRouter) ด้วยโมเดลภาพที่ gateway ระบุ ครั้งละ 1 รูป gateway นับเงินและจำนวนรูปต่อคนต่อเดือน งานตั้งเวลาที่ตั้งผลลัพธ์เป็น "รูปภาพ 1 รูป" ใช้ทางเดียวกัน
