# Governed Skill Packs (`packs/`)

โฟลเดอร์นี้เก็บชุด Skill Pack ต้นแบบที่ผู้ดูแลระบบรับรอง (`features.skillPacks`) ซึ่งรองรับทั้ง `skills`, `agents` (Agent templates แบบข้อความ) และ `hooks` (`http` / `command` ที่รันผ่าน Desktop `HookEngine`)

> **ข้อแตกต่างจาก Skill ที่พนักงานเพิ่มเอง (`features.staffSkills`):**
> - พนักงานสามารถนำเข้า Skill ข้อความล้วนใช้เองได้ทันทีเมื่อผ่านการตรวจมาตรฐาน v2/v3 และความปลอดภัยอัตโนมัติ
> - ชุดที่มี `hooks` หรือ `agents` หรือต้องการแจกจ่ายระดับองค์กร ต้องเปิดผ่าน `features.skillPacks: true` และระบุ SHA-256 `digest` ใน `skillPacks.approvedDigests` ของ `desktop-policy.json` เท่านั้น
> - ห้ามวางไฟล์โค้ดหรือเอกสารที่มี URL/คำสั่งไว้ในโฟลเดอร์ pack (`packs/step-governance-pack/`) เพราะระบบตรวจรับเฉพาะไฟล์ข้อความที่สะอาดและคำนวณ digest จากทุกไฟล์ในโฟลเดอร์ pack

---

## ชุดต้นแบบ: `packs/step-governance-pack`

- `pack.json`: schema v1 ระบุ:
  - Skill: `step-document-qa` (Standard v3)
  - Agent template: `step-policy-reviewer`
  - Hook: `pre_tool_use` แบบ `http` (`matcher: "write*"`, `timeoutSeconds: 10`, `blockOnFailure: true`, `priority: 10`) ส่งเฉพาะ metadata-only ให้ผู้รับ Hook ขององค์กร
- ไฟล์นี้วางแยกอยู่นอก `skills/` ของรีโปหลัก เพื่อไม่ปะปนกับ built-in Skill ขององค์กร

---

## ขั้นตอนสำหรับผู้ดูแลระบบ (Admin Workflow)

### 1. ตรวจสอบโครงสร้างและคำนวณ SHA-256 Digest

```powershell
node scripts/packs/pack-admin.mjs inspect packs/step-governance-pack
```

คำสั่งนี้ตรวจ:
- โครงสร้าง `pack.json`, `SKILL.md` (Standard v2/v3), `agents/*.md`
- ผลตรวจความปลอดภัย (แยก `safety.hooks` ออกให้เห็นชัดว่ามีข้อบกพร่องอื่นหรือไม่)
- ค่า SHA-256 `digest` ที่ต้องนำไปใส่ใน `desktop-policy.json`

หากต้องการสร้าง JSON policy snippet เพื่อดูตัวอย่าง:

```powershell
node scripts/packs/pack-admin.mjs policy packs/step-governance-pack
```

### 2. รันตัวรับ HTTP Hook (กรณีใช้ Hook แบบ `type: "http"`)

ตัวอย่างตัวรับ Hook แบบ metadata-only อยู่ที่ `scripts/packs/hook-receiver-example.mjs`:

```bash
export STEP_HOOK_PORT=8791
export STEP_HOOK_BLOCK_TOOLS=shell
node scripts/packs/hook-receiver-example.mjs --serve
```

- ตัวอย่างนี้รับเฉพาะ `POST /v1/tool-audit` บน `127.0.0.1` (ต้องวางหลัง HTTPS reverse proxy ที่องค์กรควบคุม เช่น Tailscale / Nginx เพื่อให้ตรงข้อบังคับ `https://` ของ `pack.json`)
- `HookEngine` ส่งเฉพาะ metadata (`event`, `sessionId`, `tool`, `targetHash`, `mode`, ฯลฯ) ไม่ส่งข้อความแชต เนื้อหาไฟล์ หรือข้อมูลลับ

> **กรณีใช้ Command Hook (`type: "command"`):**
> - วางสคริปต์/โปรแกรมไว้ในพาธที่ IT ควบคุมสิทธิ์บนเครื่อง แล้วอ้างชื่อคำสั่งจาก `pack.json` (ห้ามวางไฟล์สคริปต์รันได้ไว้ในโฟลเดอร์ pack)
> - **ข้อควรระวัง:** หากนโยบายตั้ง `credentialStorage.blockHostExecution: true` เครื่องที่ผูก Vault แล้วจะปฏิเสธการรัน `command` Hook เพื่อความปลอดภัย แนะนำให้ใช้ `http` Hook สำหรับเครื่ององค์กรทั่วไป

### 3. เปิดใช้ใน `desktop-policy.json` (Managed Policy)

ใช้สคริปต์ผู้ดูแลเพื่อให้ไฟล์มี ACL ที่ STeP Desktop เชื่อถือ:

- **Windows (PowerShell as Administrator):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/pilot/enable-skill-pack.ps1 -Digest <64-hex-digest>
  ```
- **macOS / Linux:**
  ```bash
  sudo bash scripts/pilot/enable-skill-pack.sh --digest <64-hex-digest>
  ```

### 4. นำเข้าและเปิดใช้ใน STeP Desktop (หรือ CLI)

- **ใน STeP Desktop:** เปิดหน้า **Skills → เพิ่ม Skill ของฉัน → เลือกทั้งโฟลเดอร์** เลือก `packs/step-governance-pack` → กดขยาย **สำหรับผู้ดูแล** ติ๊กเลือกเปิดคำสั่งอัตโนมัติ (Hooks) และผู้ช่วยสำเร็จรูป (Agent templates) → กด **ยืนยันเปิดใช้**
- **ผ่าน CLI:**
  ```bash
  node bin/step-ai.js plugin install packs/step-governance-pack
  node bin/step-ai.js plugin list
  node bin/step-ai.js plugin enable step-governance-pack --approve-enable --approve-hooks --approve-agents
  ```
