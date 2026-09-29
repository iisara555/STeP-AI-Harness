# ติดตั้ง STeP Desktop

## Windows

1. เปิด `STeP-Desktop-Setup-<เวอร์ชัน>.exe`
2. ติดตั้งแบบ “เฉพาะผู้ใช้นี้” ได้โดยไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ เลือกโฟลเดอร์ติดตั้งได้
3. ตัวติดตั้งสร้าง shortcut บน Desktop และ Start Menu แล้วเปิดแอปให้ทันที

> ถ้า Windows แสดง “Windows protected your PC” แปลว่าตัวติดตั้งยังไม่ได้ลงลายมือชื่อดิจิทัลขององค์กร ให้ติดต่อผู้ดูแลระบบ อย่ากด “Run anyway” กับไฟล์ที่ไม่ได้รับจากช่องทางของ STeP

## macOS

1. เปิดไฟล์ `.dmg` ที่ตรงกับเครื่อง: `arm64` สำหรับ Apple silicon (M1 ขึ้นไป) หรือ `x64` สำหรับ Intel
2. ลาก **STeP Desktop** ไปไว้ใน **Applications**
3. เปิดจาก Applications ถ้าเป็นรุ่นที่ยังไม่ได้ notarize ให้คลิกขวาแล้วเลือก Open ในครั้งแรก

## ในตัวติดตั้งมีอะไรบ้าง

| ส่วนประกอบ | ติดตั้งให้เลย | หมายเหตุ |
|---|---|---|
| แอป STeP Desktop และ STeP AI Harness (Skill, Rule, Manifest) | ✅ | ใช้งานได้ทันที |
| ตัวเชื่อม OpenAI Codex, Gemini CLI, Claude Agent SDK | ✅ | ใช้บัญชี AI ของผู้ใช้เอง |
| ฟอนต์ IBM Plex Sans Thai (SIL OFL 1.1) | ✅ | ใบอนุญาตอยู่ใน `resources/licenses` |
| โค้ด OCR ภาษาไทยสำหรับตรวจใบเสร็จ | ✅ | ส่วนเสริม *ทดลอง* |
| แพ็กเกจ Python ของ OCR (PaddleOCR ประมาณ 1–2 GB) | ติดตั้งจากตัวช่วยตั้งค่า | ต้องมี Python 3.10–3.12 แบบ 64-bit และอินเทอร์เน็ตตอนติดตั้ง |

แพ็กเกจของ OCR ติดตั้งลงข้อมูลแอปของผู้ใช้ (`%APPDATA%` หรือ `~/Library/Application Support`) จึงไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ และไม่แก้ไฟล์ในโฟลเดอร์ที่ติดตั้งแอป

## ครั้งแรกที่เปิด

ตัวช่วยตั้งค่าจะพาทำ 6 ขั้นตอน ข้ามได้ทุกขั้นและกลับมาตั้งค่าภายหลังได้

1. ต้อนรับ
2. ชื่อเรียกและทีมหลัก
3. ชื่อผู้ช่วย AI และวิธีพูดคุย (เพื่อนร่วมงาน / มืออาชีพ / กระชับ / กำหนดเอง)
4. เชื่อมต่อ AI
5. โฟลเดอร์เก็บผลงานและส่วนเสริม OCR
6. ทัวร์แนะนำหน้าจอ 7 จุด

ชื่อ ผู้ช่วย และวิธีพูดคุยบันทึกลง `USER.md` ในโฟลเดอร์ทำงาน ใช้ร่วมกับ STeP AI บน CLI ได้ ไฟล์นี้ถูกเพิ่มใน `.gitignore` เสมอ ห้ามใส่รหัสผ่านหรือข้อมูลส่วนบุคคลจริงลงไป

เปิดตัวช่วยตั้งค่าหรือทัวร์อีกครั้งได้จาก **ตั้งค่าพื้นที่ทำงาน → ทั่วไป** หรือกด Ctrl+K (⌘K)

## สำหรับผู้ดูแลระบบ: สร้างตัวติดตั้ง

```bash
cd desktop
npm ci
npm run dist:win   # Windows: release/STeP-Desktop-Setup-<version>.exe
npm run dist:mac   # macOS เท่านั้น: release/STeP-Desktop-<version>-arm64.dmg และ -x64.dmg
```

ตัวติดตั้ง macOS ต้องสร้างบนเครื่อง Mac ส่วน workflow `.github/workflows/desktop-release.yml` สร้างให้ทั้งสองระบบเมื่อสั่งด้วยมือหรือ push tag `desktop-v*` ถ้าตั้ง secret `CSC_LINK`, `CSC_KEY_PASSWORD` (และ `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` สำหรับ notarize) ตัวติดตั้งจะลงลายมือชื่อให้อัตโนมัติ

ข้อมูลผู้ใช้อยู่ใน `%APPDATA%\@step-cmu\desktop` (Windows) หรือ `~/Library/Application Support/@step-cmu/desktop` (macOS) การถอนการติดตั้งไม่ลบข้อมูลนี้ Log วินิจฉัยอยู่ใน `logs/diagnostics.jsonl` เก็บเฉพาะรหัสข้อผิดพลาด ไม่มีเนื้อหางาน
