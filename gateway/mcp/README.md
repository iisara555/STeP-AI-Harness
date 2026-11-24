# STeP Organization MCP Server (`gateway/mcp`)

MCP Server กลางสำหรับเชื่อม STeP Desktop (`features.mcp`) เข้ากับข้อมูลอ้างอิงและระบบภายในขององค์กร เขียนด้วย Node.js ล้วน (Zero external dependencies) และตรงตามข้อจำกัดความปลอดภัยของ `desktop/electron/mcp.ts` (`@modelcontextprotocol/sdk@1.31.0`, protocol `2025-11-25`)

> **หมายเหตุด้านความปลอดภัย:**
> - เซิร์ฟเวอร์นี้ปิดอยู่เป็นค่าเริ่มต้น ต้องรันแบบ opt-in (`--serve` หรือ `--stdio`) และต้องเปิด `features.mcp: true` ใน `desktop-policy.json` ที่ผู้ดูแลระบบเป็นเจ้าของ
> - STeP Desktop ถามคำยินยอมจากผู้ใช้ทุกครั้งก่อน `mcp_search` และ `mcp_call` (แม้ในโหมด `auto`) และตรวจ Privacy Gate กับข้อมูลที่ส่งทุกครั้ง
> - สำหรับโหมด HTTP แนะนำให้จำกัดการเข้าถึงไว้ในเครือข่ายองค์กร / Tailscale ร่วมกับ `STEP_MCP_AUTH_TOKEN` (ความยาวอย่างน้อย 32 ตัวอักษร) เนื่องจาก token ใน policy เป็น secret ประจำเครื่อง/องค์กร ไม่ควรเปิด endpoint สู่สาธารณะโดยไม่มีขอบเขตเครือข่าย

---

## เครื่องมือเริ่มต้น (Read-Only)

| ชื่อเครื่องมือ | หน้าที่ | แหล่งข้อมูล |
| --- | --- | --- |
| `step_mis_lookup` | ค้นหาเลขที่เอกสาร ISO (QM/QP/WI/FM/SD/Master List), REV ล่าสุด, วันที่บังคับใช้ และสถานะใช้อยู่/ยกเลิก | `docs/knowledge/mis-iso-document-register.md` |
| `step_afp_check_category` | ตรวจเกณฑ์หมวดค่าใช้จ่าย AFP (`B1`–`B12`, `BV`, `BV1`, `BV2`, `ฉุกเฉิน`, `C`), เพดาน 10,000 บาท, กำหนดส่งรายงาน 3/5 วัน, แบบฟอร์มตามกรณียืม/เคลียร์/สำรองจ่าย และเหตุผล 5 ส่วนหมวด `BV` | `afp-operational-circulars.md`, `qp-af-003.md`, `afp-bv-travel-reason.md` |
| `step_doc_catalog` | ค้นหารายการเอกสารองค์กรที่ลงทะเบียนและเปิดอ่านได้ตามทีม/คำค้น (กรองเอกสาร `restricted` ออกเสมอ) | `manifest/documents.yaml` |

---

## โหมด 1: Streamable HTTP (แนะนำสำหรับเซิร์ฟเวอร์กลางและเครื่องที่เปิด Vault)

โหมด HTTP ใช้ได้กับทุกเครื่อง รวมถึงเครื่องที่ตั้ง `credentialStorage.blockHostExecution: true` ซึ่งบล็อกคำสั่ง `stdio` ในเครื่อง

### 1. รันเซิร์ฟเวอร์บนเครื่องโฮสต์ (bind เฉพาะ `127.0.0.1`)

```bash
export STEP_MCP_AUTH_TOKEN='<สุ่มอย่างน้อย 32 ตัวอักษร>'
export STEP_MCP_PORT='8790'
node gateway/mcp/run.js --serve
```

บน PowerShell (Windows):

```powershell
$env:STEP_MCP_AUTH_TOKEN = '<สุ่มอย่างน้อย 32 ตัวอักษร>'
$env:STEP_MCP_PORT = '8790'
node gateway/mcp/run.js --serve
```

เมื่อพร้อม เซิร์ฟเวอร์จะพิมพ์ `STEP_MCP_READY` ออก `stdout` และบันทึก audit log แบบ metadata-only (ไม่บันทึก arguments ผลลัพธ์ หรือ token) ออก `stderr`

### 2. ตั้งค่า Reverse Proxy (กฎสำคัญ: ห้าม Redirect!)

`desktop/electron/mcp.ts` บังคับ `redirect: 'error'` และตรวจให้ `origin` + `pathname` ของคำตอบตรงกับ URL ที่ตั้งไว้ทุกตัวอักษร **ห้ามตั้ง rule 301/302 เช่น `/mcp` → `/mcp/`**

**ตัวอย่าง Nginx:**

```nginx
location = /mcp {
    proxy_pass http://127.0.0.1:8790/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    proxy_read_timeout 35s;
}
```

**ตัวอย่าง Caddy:**

```caddy
handle /mcp {
    reverse_proxy 127.0.0.1:8790
}
```

**ตัวอย่าง Tailscale Funnel / Serve (เฉพาะ path `/mcp`):**

```bash
tailscale serve --bg --set-path /mcp http://127.0.0.1:8790/mcp
```

### 3. เปิดใช้ใน `desktop-policy.json` (Managed Policy)

ใช้สคริปต์ผู้ดูแลเพื่อให้ไฟล์มี ACL ที่ STeP Desktop เชื่อถือ:

- **Windows (PowerShell as Administrator):**
  ```powershell
  $env:STEP_MCP_AUTH_TOKEN = '<token เดียวกับฝั่ง server>'
  powershell -ExecutionPolicy Bypass -File scripts/pilot/configure-mcp.ps1 `
    -Name step-org `
    -Url https://mcp.step.internal/mcp
  ```
- **macOS / Linux:**
  ```bash
  export STEP_MCP_AUTH_TOKEN='<token เดียวกับฝั่ง server>'
  sudo -E bash scripts/pilot/configure-mcp.sh \
    --name step-org \
    --url https://mcp.step.internal/mcp
  ```

โครงสร้าง JSON ที่ได้ใน `desktop-policy.json`:

```json
{
  "features": { "mcp": true },
  "mcpServers": [
    {
      "name": "step-org",
      "transport": "http",
      "url": "https://mcp.step.internal/mcp",
      "headers": {
        "Authorization": "Bearer ${STEP_MCP_AUTH_TOKEN}"
      }
    }
  ]
}
```

> ในไฟล์ `desktop-policy.json` จริงให้ใส่ค่า token จริงแทน `${STEP_MCP_AUTH_TOKEN}` (และห้ามนำไฟล์ที่มี token จริงเข้า Git)

---

## โหมด 2: Stdio (สำหรับทดสอบหรือเครื่องที่อนุญาต local execution)

> **ข้อควรทราบ:** หากเครื่องปลายทางเปิด `credentialStorage.blockHostExecution: true` หลังผูก Vault แล้ว Desktop จะปฏิเสธการรัน `stdio` MCP (`VAULT_HOST_EXECUTION_BLOCKED`) ให้ใช้โหมด HTTP แทน

```json
{
  "features": { "mcp": true },
  "mcpServers": [
    {
      "name": "step-org-local",
      "transport": "stdio",
      "command": "node",
      "args": [
        "C:/path/to/STeP-AI-Harness/gateway/mcp/run.js",
        "--stdio",
        "--root",
        "C:/path/to/STeP-AI-Harness"
      ]
    }
  ]
}
```

---

## วิธีทดสอบใน STeP Desktop

1. รีสตาร์ต STeP Desktop หลังแก้ `desktop-policy.json`
2. เปิด **ตั้งค่า → นโยบายองค์กร** ตรวจว่า `เครื่องมือเสริม MCP` เป็นเปิดใช้ และจำนวนเซิร์ฟเวอร์ตรงตามที่ตั้ง
3. กด `Ctrl+K` → **เครื่องมือเพิ่มเติม (MCP และ Docker)** → เปิดหัวข้อ **บริการเสริม**
4. เลือก `step-org` → กด **ค้นหาเครื่องมือ** (จะเห็น dialog ขอความยินยอมก่อนเชื่อมต่อ)
5. ทดสอบเรียกเครื่องมือ:
   - ชื่อเครื่องมือ: `step_mis_lookup`, ข้อมูล: `{"code": "FM-AF-014"}`
   - ชื่อเครื่องมือ: `step_afp_check_category`, ข้อมูล: `{"category": "BV", "amountThb": 8500}`
6. หรือลองพิมพ์ถามในแชตหลัก เพื่อให้ AI ใช้ `mcp_search` / `mcp_call` พร้อมตรวจ Privacy Gate

---

## การเพิ่มเครื่องมือเชื่อมระบบภายใน (เช่น MIS / ERP)

`StepMcpServer` เปิด method `registerTool(def)` เพื่อลงทะเบียนเครื่องมือเพิ่มในไฟล์แยกได้โดยไม่ต้องแก้โค้ด protocol:

```js
import { StepMcpServer } from "./service.js";
import { createStepCatalogTools } from "./tools/step-catalog.js";

const server = new StepMcpServer({
  tools: createStepCatalogTools({ rootDir }),
  authToken: process.env.STEP_MCP_AUTH_TOKEN,
});

server.registerTool({
  name: "step_room_availability",
  description: "ตรวจสถานะห้องประชุมว่างแบบอ่านอย่างเดียว (Read-only room availability)",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: {
      date: { type: "string", maxLength: 10 },
    },
  },
  handler: async ({ date }, { signal }) => {
    // เรียก API ภายในด้วย signal และคืนเฉพาะข้อมูลที่จำเป็น (ขนาด <= 180 KB)
    return { date, rooms: [] };
  },
});
```

ข้อกำหนดสำหรับทุก tool ที่ลงทะเบียนเพิ่ม:
- ใส่ `"additionalProperties": false` และ `maxLength` ใน `inputSchema` เสมอ
- คืนผลลัพธ์ไม่เกิน `180,000` bytes (เพื่อให้ผ่านเพดาน `200,000` ของ Desktop) และทำงานเสร็จภายใน `25` วินาที
- ส่ง `signal` ให้ `fetch`/query ปลายทางเสมอ
- ห้ามคืน secret, token หรือ PII ที่ไม่จำเป็นในคำตอบ
