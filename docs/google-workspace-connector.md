# Google Workspace connector (optional, separate)

Current Desktop connects directly with its native `google_workspace` tool and in-app OAuth/Vault. The [Google Workspace Skill](../skills/common/google-workspace/SKILL.md) and its references describe that path; no CLI or external MCP server is required. `skill` input `google-workspace` with `args.resource` reads one reference progressively. The [design handoff](desktop-google-workspace-design.md) retains the original design context. The optional CLI connector documented below is a separate module with the narrower operations listed here.

โมดูล `src/modules/connectors/google-workspace.js` ใช้ gws CLI ที่องค์กรติดตั้งและ sign in เองแล้ว ไม่ติดตั้ง ไม่เรียก auth login ไม่เปิด service account key และไม่เพิ่มเข้า Desktop tool loop โดยอัตโนมัติ

รองรับ drive.list, docs.get, sheets.get, sheets.values.get สำหรับอ่าน และ docs.create/sheets.create สำหรับสร้างร่างว่าง พร้อม docs.appendText (append ข้อความโดยต้องมี requiredRevisionId จากผลอ่านล่าสุด) และ sheets.values.update (RAW scalar values สูงสุด 500 cells ใน range ที่ host ตรวจแล้ว) ไม่รองรับ sharing, mail, delete หรือ publish

`drive.list` ค้น My Drive และ Shared drives ที่ grant อนุญาตเป็นค่าเริ่มต้น ใช้ `params.driveId` เพื่อจำกัด Shared drive หรือ `params.includeItemsFromAllDrives: false` สำหรับ My Drive อย่างเดียว ตรวจ `incompleteSearch` และ `nextPageToken` ก่อนสรุปขอบเขตผลค้น

ตัวอย่างผ่าน host ที่มี permission/Privacy gate ของตน:

```js
import { GoogleWorkspaceConnector } from '../src/modules/connectors/google-workspace.js';
const connector = new GoogleWorkspaceConnector();
const result = await connector.execute({ operation: 'docs.get', params: { documentId: selectedId } }, { signal });
// Scan/mask result.data with Harness Privacy Gate and check destination consent before sending it to AI.
const draft = await connector.execute({ operation: 'docs.create', body: { title: 'ร่างโครงการ' } }, {
  authorize: async ({ request, digest }) => hostAuthorizeExactAction(request, digest),
  signal,
});
```

authorize ต้องเป็น callback ของ trusted host ที่ตรวจ permission, authority, privacy และการยืนยันตาม action ห้ามรับ authorize=true จาก args ของโมเดล ห้ามใช้ remembered approval ข้าม payload; connector ผูก invocation กับ immutable argv ที่ digest ระบุ การสร้างร่างไม่อนุญาตให้แชร์/ส่งจริง การสร้างในบัญชี Google อยู่ภายใต้นโยบายการเข้าถึงของบัญชีนั้น ไม่รับรองว่า ACL เป็น private ถ้าองค์กรมี default policy

`{dryRun:true}` ตรวจ request และคืน digest/effect โดยไม่เปิด subprocess หรือเรียก Google ผลอ่านติด EXTRACTED_UNVERIFIED/untrusted-data พร้อม retrievedAt; ต้องอ้างเนื้อหาต้นทางและ revision ที่ response มี ไม่ตีความเป็น current policy ที่ผ่านการยืนยันแล้ว

CLI ใช้ execFile ไม่มี shell จำกัด 20 วินาที/1 MB ไม่ auto-paginate และไม่ retry writes ไม่คืน stderr/account diagnostics ถ้าขาด CLI ให้ WORKSPACE_CLI_UNAVAILABLE; งานอ่านที่ auth/quota/transport ล้มเหลวเป็น WORKSPACE_CLI_FAILED ให้คนตรวจ gws ในเครื่องเอง ไม่ขอ credentials ผ่าน chat

งานเขียนที่เริ่ม process แล้วแต่ล้ม/ถูกยกเลิก/ตอบ JSON หรือ resource reference ไม่ครบ จะคืน error `WORKSPACE_OUTCOME_UNKNOWN` พร้อม `operation`, `requestDigest` และ `target` (params ที่ตรวจแล้ว ไม่มี body หรือ upstream diagnostics) อาจเขียนไปแล้ว ให้ตรวจใน Google หรืออ่านเป้าหมายก่อนทำซ้ำ การปฏิเสธ consent/ยกเลิกก่อนเริ่ม และ ENOENT ยังเป็นความล้มเหลวก่อนเขียนที่แยกได้

เก็บ token/output เอกสารจริงภายนอก repository ไม่ log raw data และผ่าน outgoing-data gate ก่อนส่งไป provider อื่น Tests ใช้ CLI จำลองและข้อมูลสังเคราะห์ ยังไม่ได้ทดสอบ live OAuth/Google API ไม่เปลี่ยน policy defaults

อ้างอิง syntax/auth จาก [Google Workspace CLI](https://github.com/googleworkspace/cli) และ [gws-shared](https://github.com/googleworkspace/cli/blob/main/skills/gws-shared/SKILL.md); ไม่คัดลอกหรือติดตั้งทั้ง skill bundle
