# STeP LINE Draft Gateway & Operator UI (`gateway/line`)

ระบบรับคำขอจากพนักงานผ่าน **LINE Official Account (แชต 1:1)** เพื่อสร้างเป็นร่างคำตอบที่ผ่าน Router, Authority Gate และ Privacy Gate แล้วส่งเข้าคิวให้ผู้ตรวจ (Operator) ตรวจและกดอนุมัติก่อนส่งกลับทาง LINE

> **หลักความปลอดภัยสำคัญ (Human-in-the-loop Only):**
> - ระบบ **ไม่ตอบกลับอัตโนมัติ** และ **ไม่ส่ง Push API ซ้ำอัตโนมัติ** หากผลส่งไม่แน่ชัด
> - แยกพื้นผิวเครือข่ายเด็ดขาด: Reverse proxy สาธารณะต้องเปิดเฉพาะ `POST /webhook` เท่านั้น ส่วนเส้นทางผู้ตรวจ (`/pending`, `/approve`, `/approve-input`, `/answer`, `/retry`, `/reject`, `/resolve-unknown`, `/audit`, `/healthz`) และ **Operator UI (`127.0.0.1:8789`)** รับการเชื่อมต่อเฉพาะ loopback เท่านั้น

---

## สถาปัตยกรรม

```text
LINE Platform ──(HTTPS POST /webhook)──▶ TLS Reverse Proxy ──▶ LINE Gateway (127.0.0.1:8788)
                                            (บล็อก path อื่น 404)          ▲
                                                                          │ Loopback + Bearer Token
ผู้ตรวจ (Browser) ◀──(Loopback / SSH / Tailscale Admin)──▶ Operator UI (127.0.0.1:8789)
```

---

## 1. เตรียม LINE Developers Console

1. สร้าง Provider และ **Messaging API Channel** ใน LINE Developers Console
2. ในแท็บ **Messaging API settings**:
   - **ปิด** `Auto-reply messages` และ `Greeting messages` เพื่อไม่ให้ LINE ตอบข้อความอัตโนมัติแข่งกับ Gateway
   - เก็บ `Channel ID` (`U...`), `Channel secret` และออก `Channel access token (long-lived)`
   - ตั้ง `Webhook URL` เป็น `https://<domain-ขององค์กร>/webhook` (หลังเปิด Reverse Proxy แล้วจึงกด Verify และเปิด `Use webhook`)

---

## 2. ตั้งค่า Reverse Proxy (เปิดเฉพาะ `POST /webhook`)

**กฎสำคัญ:** ห้าม proxy เส้นทางผู้ตรวจออกสู่สาธารณะ ให้คืน `404` ทุกเส้นทางยกเว้น `/webhook`

### ตัวอย่าง Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name line.step.internal;

    location = /webhook {
        limit_except POST { deny all; }
        client_max_body_size 1m;
        proxy_pass http://127.0.0.1:8788/webhook;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 30s;
    }

    location / {
        return 404;
    }
}
```

### ตัวอย่าง Caddy

```caddy
line.step.internal {
    @webhook {
        method POST
        path /webhook
    }
    handle @webhook {
        reverse_proxy 127.0.0.1:8788
    }
    handle {
        respond 404
    }
}
```

### ตัวอย่าง Tailscale Funnel (เฉพาะ `/webhook`)

```bash
tailscale funnel --bg --set-path /webhook http://127.0.0.1:8788/webhook
```

---

## 3. ตั้งค่า Allowlist และ Managed Policy

### 3.1 สร้างไฟล์ Allowlist (`STEP_LINE_ALLOWLIST`)

คัดลอก [allowlist.example.json](allowlist.example.json) ไปไว้นอก repository (เช่น `C:\ProgramData\STeP\line-allowlist.json` หรือ `/etc/step/line-allowlist.json`) และกรอกรายชื่อพนักงานจริง:
- `lineUserId`: รหัสผู้ใช้ LINE (`U` + hex 32 ตัว)
- `employeeId`, `team`: รหัสพนักงานและทีม (ต้องตรงกับทีมใน `manifest/teams.yaml`)
- `providerConsent: true`: ยืนยันว่าพนักงานยินยอมส่งคำขอไปยังโปรไฟล์ AI ที่ระบุ
- `profile`: เลือกชี้ไปที่ **AI Gateway ขององค์กร (`STeP-AI-Webapp`)** เช่น `https://ai.step.internal/ai/v1` หรือ **Ollama ในเซิร์ฟเวอร์** เช่น `http://127.0.0.1:11434/v1` (ต้องตรงกับ `providers.compatible` ใน `desktop-policy.json`)

> ระบบตรวจ ACL ของไฟล์ Allowlist ด้วย `trustedManagedPolicyPath` ดังนั้นไฟล์และโฟลเดอร์ที่เก็บต้องเป็นของ Administrators/SYSTEM (Windows) หรือ `root` โหมด `0644`/`0755` (Linux/macOS) เท่านั้น

### 3.2 เปิด Policy ด้วยสคริปต์ผู้ดูแล

- **Windows (PowerShell as Administrator):**
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/pilot/enable-line-gateway.ps1 `
    -Name step-line-ai `
    -BaseUrl http://127.0.0.1:11434/v1 `
    -Protocol openai `
    -AllowlistPath C:\ProgramData\STeP\line-allowlist.json
  ```
- **macOS / Linux:**
  ```bash
  sudo bash scripts/pilot/enable-line-gateway.sh \
    --name step-line-ai \
    --base-url http://127.0.0.1:11434/v1 \
    --protocol openai \
    --allowlist /etc/step/line-allowlist.json
  ```

---

## 4. ตัวแปรสภาพแวดล้อมและวิธีรัน

| ตัวแปร | ความหมาย | ค่าเริ่มต้น / ข้อกำหนด |
| --- | --- | --- |
| `STEP_LINE_CHANNEL_SECRET` | Channel secret ของ LINE OA | บังคับ (≥ 16 ตัวอักษร) |
| `STEP_LINE_CHANNEL_TOKEN` | Channel access token | บังคับ (≥ 16 ตัวอักษร) |
| `STEP_LINE_CHANNEL_ID` | Bot User ID (`U...`) ของ LINE OA | บังคับ (`^U[a-f0-9]{32}$`) |
| `STEP_LINE_APPROVER_TOKEN` | โทเค็นสำหรับผู้ตรวจเข้าระบบ | บังคับ (≥ 32 ตัวอักษร สุ่มให้ปลอดภัย) |
| `STEP_LINE_ALLOWLIST` | พาธไฟล์ JSON รายชื่อพนักงาน | บังคับ (ต้องผ่าน ACL check) |
| `STEP_LINE_PROVIDER_KEY` | API key สำหรับปลายทาง AI (ถ้าใช้) | ไม่บังคับ (Ollama ไม่ต้องใส่) |
| `STEP_LINE_STORAGE` | โฟลเดอร์เก็บงานและคิว (สิทธิ์ 0700) | `./.step/line-private` |
| `STEP_LINE_WORKSPACE` | โฟลเดอร์ workspace ที่อ้างอิง | `process.cwd()` |
| `STEP_LINE_PORT` | พอร์ต loopback ของ Gateway | `8788` |
| `STEP_LINE_RETENTION_DAYS` | จำนวนวันเก็บ job/session ที่จบแล้ว | `30` (ขอบเขต `1`–`365`) |
| `STEP_LINE_UI_PORT` | พอร์ต loopback ของ Operator UI | `8789` |
| `STEP_LINE_GATEWAY_URL` | URL loopback ของ Gateway สำหรับ UI | `http://127.0.0.1:8788` |

### รันทั้ง Gateway และ Operator UI

```bash
# Terminal 1: LINE Gateway (127.0.0.1:8788)
node gateway/line/run.js --serve

# Terminal 2: Standalone Operator UI (127.0.0.1:8789)
node gateway/line/operator-ui.js --serve
```

ผู้ตรวจเปิดเบราว์เซอร์ที่ `http://127.0.0.1:8789` (หรือผ่าน SSH tunnel `ssh -L 8789:127.0.0.1:8789 server`) แล้วล็อกอินด้วย `STEP_LINE_APPROVER_TOKEN` (คุกกี้เซสชันเป็น `HttpOnly; SameSite=Strict` และไม่เก็บ token ใน `localStorage`)

---

## 5. แนวทางปฏิบัติสำหรับ Operator (Runbook)

- **รออนุมัติส่งกลับ (`review`):** อ่านคำขอและร่างคำตอบ สามารถแก้ไขข้อความในช่องร่างได้ (ไม่เกิน 25,000 ตัวอักษร, แบ่งส่งไม่เกิน 5 ข้อความ × 5,000 ตัวอักษร) ระบบจะตรวจ Privacy Gate และ Authority Router ซ้ำก่อนส่งจริง หากไม่ต้องการส่งให้กด **ปฏิเสธและปิดงาน**
- **รอตรวจไฟล์แนบ (`input-review`):** รองรับ `.txt`, `.md`, `.csv`, `.pdf`, `.docx` ขนาด ≤ 25 MB ตรวจผลสกัดข้อความและหมายเหตุเอกสารก่อนติ๊กยืนยัน 2 ช่องเพื่อให้ AI ร่าง
- **รอข้อมูลเพิ่ม (`needs-input`):** Router พบข้อมูลไม่ครบ ให้สอบถามพนักงานแล้วกรอกคำตอบเพิ่ม (สูงสุด 5 รอบต่อ 1 งาน)
- **งานถูกขัดจังหวะ (`interrupted`):** เกิดจากเซิร์ฟเวอร์รีสตาร์ตระหว่างประมวลผล ระบบลบข้อความค้างเดิมแล้ว (ไม่รีเพลย์อัตโนมัติ) ให้รับคำขอที่ตรวจแล้วมากรอกใหม่หรือปิดงาน
- **ผลส่งไม่แน่ชัด (`delivery-unknown`):** การส่งไป LINE Push API ขาดช่วงหลังส่งคำขอ ห้ามกดส่งซ้ำทันที ให้เปิด **LINE Official Account Manager** ตรวจแชตจริงก่อน:
  - ถ้าพนักงานได้รับแล้ว → กด **ยืนยันว่าส่งถึงแล้ว** (`confirmed-delivered`)
  - ถ้ายังไม่ได้รับและต้องการปิดงาน → กด **ยกเลิกงานนี้** (`cancelled`)

(สำหรับผู้ดูแลระบบที่เรียก API โดยตรง ต้องแนบ `Authorization: Bearer ${STEP_LINE_APPROVER_TOKEN}` บน loopback `127.0.0.1` เท่านั้น)
