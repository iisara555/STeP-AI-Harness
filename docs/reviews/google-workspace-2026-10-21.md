# ตรวจ Google Workspace, gogcli และ Skill — 2026-10-21

รายงานนี้เก็บผลก่อนแก้จาก baseline ด้านล่าง ดู [การแก้ production code และผลตรวจใหม่](google-workspace-2026-10-21-fixes.md)
สำหรับสถานะปัจจุบัน สคริปต์ใน source ปัจจุบันตรวจ regression หลังแก้; ตัวทำซ้ำปัญหาเดิมอยู่ใน audit commit `49f91c8`

ตรวจ `origin/main` หลัง `git fetch origin main --tags`: **127218295efbeb8b4b4d9a85b471033011574bbb**
(`Merge pull request #228`, 2026-10-21). ตรวจ GitHub Release แล้ว `desktop-v0.6.19` เผยแพร่เมื่อ
2026-10-21T04:55:49Z จาก `aacabd5e64238601ede961c0da26cf9d036bccd6`; release กับ main ที่ตรวจเป็นคนละ commit
จึงไม่อ้างว่าทุกผลนี้ได้ทดสอบจาก installer ที่เผยแพร่แล้ว

## ผลที่ยืนยันได้

**พบ 7 ประเด็น: ทำซ้ำด้วยข้อมูลสังเคราะห์ได้ 6 ประเด็น และยืนยันการขาดพารามิเตอร์ Shared drives จากโค้ดได้อีก 1 ประเด็น**
มี race condition ที่ทำซ้ำได้ 2 รูปแบบ; กรณี Apps Script สูญเสียการแก้ไขมีการเปิดเผยข้อจำกัดในคู่มือเดิมแล้ว
ยังไม่มีการแก้ production code ในงานตรวจนี้

Skill examples ทั้ง **76 operations / 11 บริการ** เรียกผ่าน `GoogleWorkspace.execute`, Store, Vault,
scope/intent checks และ transport จำลองสำเร็จ ชุดทดสอบเดิมที่เจาะ Google/OAuth/Vault/Skill selection
ผ่าน 72 รายการ และ Harness connector/Skill ผ่านอีก 11 รายการ
การผ่านนี้ยืนยันเส้นทางโค้ดและสัญญาของเครื่องมือภายใต้ response จำลอง ไม่ยืนยัน OAuth หรือผลข้อมูลในบัญชีจริง

**ยังตรวจใช้งานกับบัญชี Google จริงไม่ได้ใน environment นี้**: ไม่มี account credential binding ที่ตั้งค่าไว้,
ไม่มี executable `gog` หรือ `gws` และการ probe ผ่าน proxy ไปยัง Google 11 endpoints ด้านล่างถูกปฏิเสธ
`Tunnel connection failed: 403 Forbidden` ก่อนถึง API บัญชี ผลนี้เป็นข้อจำกัด environment
ไม่ใช่หลักฐานว่าบริการ Google เหล่านั้นเสียหรือผู้ใช้ไม่มี scope

## gogcli กับ Skill เชื่อมกันอย่างไรใน main ปัจจุบัน

มีสอง implementation แยกจากกัน:

1. **Desktop + `google-workspace` Skill** → `google_workspace` → OAuth/Vault ในแอป → Google REST API
   ใช้ gogcli เป็นแนวทางออกแบบ ไม่มีการเรียก gogcli binary
2. **Optional Harness connector** → subprocess **`gws`** → credentials/profile ที่ CLI จัดการเอง
   รองรับเพียง 8 operations และไม่ได้ลงทะเบียนเข้า Desktop tool loop โดยอัตโนมัติ

ดังนั้น main นี้ **ยังไม่มีเส้นทาง gogcli + Skill ที่ทำงานร่วมกันโดยตรง** และการลงชื่อใน gogcli
ไม่ได้เชื่อมบัญชีให้ Desktop หรือ gws connector การเรียก connector จริงด้วย `drive.list` ใน session นี้ได้
`WORKSPACE_CLI_UNAVAILABLE` ตามโค้ด

หลักฐาน: [Skill](../../skills/common/google-workspace/SKILL.md),
[native host](../../desktop/electron/main.ts),
[optional connector](../../src/modules/connectors/google-workspace.js),
[provenance](../../skills/common/google-workspace/references/provenance.md).
เทียบ upstream gogcli ที่ checkout **ec34fedc23dd9d3e90f0401144cec42e06a50783** แบบอ่าน source;
ไม่ได้เรียกบัญชีจริงหรือรัน Go race detector ของ upstream

## ประเด็นเรียงตามผลกระทบ

P1 = อาจสูญเสียการแก้ไขหรือหยุดใช้งานทั้งบัญชี; P2 = ล้มเหลวเฉพาะเงื่อนไข/ผลอ่านไม่ครบ/ผลลัพธ์กำกวม

### GWA-05 · P1 · Apps Script: แก้พร้อมกันแล้วข้อมูลหนึ่งงานหาย

ตำแหน่ง: [google-workspace.ts:378–410](../../desktop/electron/google-workspace.ts#L378)

เมื่อสองงานใช้ `expectedContentHash` เดียวกันและอ่าน preflight ก่อนงานใด PUT ทั้งคู่ผ่าน hash check
จากนั้นแต่ละงานส่ง source ทั้งโครงการที่ merge จาก snapshot ของตน Google ไม่มี atomic content precondition
และแอปไม่มี lock ต่อ account/project

วิธีทำซ้ำ: งาน A แก้ `Code`, งาน B แก้ `Other`; barrier ให้ GET ทั้งคู่คืน snapshot เดิมก่อน PUT
ผลจริงของ fixture คือ **completed 2 งาน แต่เหลือการแก้ไขเพียง 1 งาน** แม้แก้คนละไฟล์

แนวแก้: serialize งานในแอปตาม account/project แล้วอ่าน/check hash ภายใน lock; ให้รายการที่ล้าสมัยกลับมา review ใหม่
ยังต้องเปิดเผยความเสี่ยงจากผู้แก้ภายนอก เพราะ lock ในแอปไม่ทำให้ Google API มี atomic precondition
ประเด็น external concurrency มีบันทึกอยู่แล้วใน [คู่มือ](../google-workspace-functions.md#limits-and-write-confirmation)
การตรวจครั้งนี้เพิ่มหลักฐานการสูญเสียข้อมูลจากสองงานใน instance เดียวกัน

### GWA-01 · P1 · ทุกบริการ: เครือข่ายสะดุดขณะ refresh ทำให้บัญชีต้องเชื่อมใหม่

ตำแหน่ง: [google-workspace.ts:316–321](../../desktop/electron/google-workspace.ts#L316)

catch ของ token refresh ถือ `GOOGLE_REQUEST_FAILED` เป็นเหตุให้ตั้ง `reauth: true` เช่นเดียวกับ token ถูกเพิกถอน
แต่ error นี้รวม network failure, timeout และ HTTP 5xx ด้วย

วิธีทำซ้ำ: token หมดอายุ → transport ล้มชั่วคราวหนึ่งครั้ง → error แรก `GOOGLE_REQUEST_FAILED`
จากนั้นบัญชีหายจาก catalog และการเรียกถัดไปได้ `GOOGLE_ACCESS_DENIED` โดยไม่ลอง network อีก
กระทบทุกบริการที่ใช้บัญชีนั้นจน reauthorize

แนวแก้: แยก revoked/invalid grant ออกจาก transient failure; เก็บบัญชีพร้อม retry การอ่าน/refresh แบบจำกัด
อย่า retry writes ที่ outcome ไม่ชัดเจน

### GWA-02 · P2 · ทุกบริการ: ยกเลิกงานหนึ่งทำให้อีกงานล้มตาม

ตำแหน่ง: [google-workspace.ts:266–286](../../desktop/electron/google-workspace.ts#L266)

refresh promise ถูกแชร์ตาม account แต่ request ใช้ `AbortSignal` ของ caller แรก
caller ที่สองรับ promise เดียวกัน จึงถูกยกเลิกตามเมื่อ caller แรกหยุด

วิธีทำซ้ำ: สองงานอ่านเอกสารด้วย token หมดอายุ ให้ refresh ค้างแล้ว abort เฉพาะ A
เกิด refresh หนึ่งครั้ง; **A และ B ได้ `CANCELLED` ทั้งคู่ แม้ signal ของ B ยังไม่ abort**

แนวแก้: แยก shared refresh lifecycle ออกจาก cancellation ของ waiter แต่ละงาน
ให้ pause/disconnect/account invalidation ยกเลิก refresh ร่วม และให้ cancellation ปกติหยุดเฉพาะ waiter นั้น

### GWA-07 · P2 · Gmail: อีเมลไทย charset เก่าอ่านเพี้ยนโดยไม่แจ้ง

ตำแหน่ง: [google-mail.ts:58–59](../../desktop/electron/google-mail.ts#L58)

`googleMailContent` decode `text/plain` เป็น UTF-8 เสมอ ไม่อ่าน charset ของ MIME part
กระทบ `gmail.get`, `gmail.threads.get` และ `gmail.drafts.get`

วิธีทำซ้ำ: MIME `text/plain; charset=windows-874`, bytes `CA C7 D1 CA B4 D5`
ซึ่ง decode ถูกต้องเป็น **สวัสดี** กลับเป็น **���ʴ�** และไม่มี `contentUnavailable`
AI จึงได้รับข้อความเสียโดยไม่มีสถานะว่า decode ไม่สำเร็จ

แนวแก้: decode ตาม charset ที่รองรับด้วยการตรวจแบบ strict หรือคืนสถานะอ่านเนื้อหาไม่ได้
อย่าคืน replacement characters เป็นเนื้อหาที่อ่านสำเร็จ

### GWA-06 · P2 · Drive: สัญญา search ไม่ครอบคลุม Shared drives

ตำแหน่ง: [google-operations.ts:126–136](../../desktop/electron/google-operations.ts#L126)

`drive.list` ไม่มี `supportsAllDrives` และ `includeItemsFromAllDrives` และ validator ปฏิเสธเมื่อส่งเพิ่ม
ต่างจาก [gogcli drive search](https://github.com/openclaw/gogcli/blob/ec34fedc23dd9d3e90f0401144cec42e06a50783/internal/cmd/drive.go#L565)
ที่ส่งทั้งสองตัวและเปิด all-drives เป็นค่าเริ่มต้น ขณะที่ native `drive.get` รองรับ all-drives อยู่แล้ว

ยืนยันได้จาก invocation/validator ว่าเรียกค้น Shared-drive items แบบนั้นไม่ได้
**ยังไม่ได้ยืนยันกรณีไฟล์จริงหายจากผลค้นกับ Google** เพราะ network ถูกบล็อก
จึงไม่ควรสรุปว่า search ครอบคลุมไฟล์ทุกที่แม้มี `drive-read`

แนวแก้: เพิ่มตัวเลือก Shared drives/drive ID/corpora ที่ตรวจค่าแล้ว หรือกำหนดพฤติกรรม all-drives ชัดเจน
พร้อมแสดงขอบเขตของผลค้นและ pagination

### GWA-03 · P2 · หลายบัญชี: Skill ไม่มีป้ายให้ผู้ใช้เลือกบัญชีได้ชัดเจน

ตำแหน่ง: [google-workspace.ts:258](../../desktop/electron/google-workspace.ts#L258)

`catalog()` ส่ง label `Work Google account` เหมือนกันทุกบัญชี แม้ `state()` มี masked labels ต่างกัน
เมื่อสิทธิ์ตรงกัน entry ต่างกันเพียง UUID handle ที่ผู้ใช้จำไม่ได้ จึงขัดกับ Skill ที่ให้เลือกด้วยป้ายบัญชี
และห้ามเลือกบัญชีแรกอัตโนมัติ

วิธีทำซ้ำ: เชื่อมสอง subject ที่มี service intents เหมือนกัน; metadata จาก catalog
เมื่อตัด handle ออกเท่ากันทั้งหมด ทั้งที่ labels ใน state แยกบัญชีได้

แนวแก้: ส่ง account alias/ป้ายปกปิดที่แยกได้ให้ catalog โดยยังคง session-bound handles
และไม่ส่ง subject/token ไปให้โมเดล

### GWA-04 · P2 · Optional gws connector: เขียนแล้วแต่ตอบ failure ธรรมดา

ตำแหน่ง: [google-workspace.js:80–91](../../src/modules/connectors/google-workspace.js#L80)

หาก process/network ล้มหลัง Google เขียนแล้ว connector คืน `WORKSPACE_CLI_FAILED`
หรือ `WORKSPACE_RESPONSE_INVALID`; หาก abort หลังส่งไปแล้วจะคืน `CANCELLED`
ไม่มี outcome-unknown แบบ native path ผู้เรียกจึงแยก pre-execution failure จาก committed-but-no-response ไม่ได้

วิธีทำซ้ำ: runner บันทึก create สำเร็จหนึ่งครั้งแล้ว throw ก่อนส่ง response;
connector คืน `WORKSPACE_CLI_FAILED` ทั้งที่ effect counter เป็น 1
การ retry โดย host/คนอาจสร้างซ้ำ; ตัว connector เองไม่ได้ retry อัตโนมัติ

แนวแก้: แยกกรณีก่อน spawn/ENOENT จากกรณี write ที่เริ่มแล้วและผลไม่แน่ชัด
คืน `WORKSPACE_OUTCOME_UNKNOWN` พร้อม operation/digest/target ที่ปลอดภัยเพื่ออ่านตรวจผลก่อนทำซ้ำ
ประเด็นนี้อยู่ใน optional gws connector ไม่ใช่ Desktop native path

## สถานะรายบริการ

ทุกแถวด้านล่าง **live = ENV-BLOCKED / ยังไม่ยืนยัน**; จำนวนคือ Skill examples ที่ผ่าน synthetic execute
ประเด็น GWA-01/02/03 เป็นส่วนกลางและกระทบทุกบริการ

| บริการ | Operations | ผล offline และข้อจำกัดเฉพาะบริการ |
| --- | ---: | --- |
| Gmail | 16 | ผ่าน; non-UTF-8 plain text เพี้ยน (GWA-07), HTML-only ไม่มีตัวอ่าน body, attachments เป็น UTF-8 text เท่านั้น |
| Drive | 11 | ผ่าน; Shared-drive search gap (GWA-06), binary upload/download และ PDF/DOCX export ไม่รองรับ |
| Docs | 4 | ผ่าน; revision-bound writes, ไม่มี multi-tab selector/การอ่านทุก tab ที่รับรองได้ |
| Sheets | 9 | ผ่าน; values จำกัด 500 cells, generic batch มีขอบเขตกว้างกว่า; ไม่มี atomic revision guard |
| Slides | 5 | ผ่าน; revision-bound edits; ต้อง review ตำแหน่ง/ภาพกับไฟล์จริงเพิ่ม |
| Forms | 6 | ผ่าน; response reads ขึ้นกับ scope จริงและ partial consent; API enablement ยังไม่ยืนยัน |
| Apps Script | 14 | ผ่าน; lost update (GWA-05); ต้องเปิด Script API access และตั้ง API Executable/Cloud project/scopes ให้ตรง |
| Calendar | 3 | ผ่าน; list/events/create เท่านั้น ไม่มี update/delete; timezone/วันต้องได้จากขอบเขตงาน |
| Tasks | 4 | ผ่าน; list/create/complete เท่านั้น ไม่มี due/assigned filters ใน catalog |
| Chat | 3 | ผ่าน; spaces/messages/send; ยังไม่ทดสอบการส่งจริง |
| Meet | 1 | ผ่านเฉพาะ get space; ไม่รองรับ create/update/list recordings/transcripts |

Tasks มี `showCompleted` ตาม API default และไม่มี parameter ให้ปิดใน catalog (GWA-L01)
งาน “มีงานอะไรค้าง” ต้องกรอง `status === needsAction` และอ่านหน้าที่จำเป็น;
อย่าถือจำนวนรายการดิบเป็นจำนวนงานค้าง ส่วนรายการ assigned tasks ต้องตรวจขอบเขตเพิ่ม
gogcli ต้นฉบับมีตัวเลือกเหล่านี้ แต่ native catalog ไม่เทียบเท่าทุกคำสั่ง

Contacts/People/Directory และบริการ gogcli อื่น เช่น Classroom, Drive Activity/Labels,
Analytics/Search Console ไม่มี native operations ใน main นี้ จัดเป็น **ไม่รองรับ** ไม่ใช่บริการล่ม

Endpoints ที่ probe แบบไม่ส่ง credentials และถูก proxy ปฏิเสธ:
`oauth2.googleapis.com`, `www.googleapis.com` (Drive/Calendar), `gmail.googleapis.com`,
`docs.googleapis.com`, `sheets.googleapis.com`, `slides.googleapis.com`, `forms.googleapis.com`,
`script.googleapis.com`, `tasks.googleapis.com`, `chat.googleapis.com`, `meet.googleapis.com`.

## หลักฐานและวิธีทำซ้ำ

[ผล JSON](google-workspace-2026-10-21.json) และ
[standalone audit runner](../../scripts/audit-google-workspace.mts) ใช้บัญชี/ข้อมูลสังเคราะห์ทั้งหมด
runner เป็น executable evidence สำหรับ baseline นี้: exit 0 หมายถึงทำซ้ำผลที่บันทึกได้
ไม่ใช่ใบรับรองว่าไม่มี bug และไม่ถูกเพิ่มเข้า `npm test` เพื่อบังคับให้เก็บ bug หลังแก้

```sh
cd desktop
npm ci
cd ..
node --import ./desktop/node_modules/tsx/dist/loader.mjs scripts/audit-google-workspace.mts
```

ตัว runner ไม่เรียก Google, ไม่อ่าน credential จริง, ไม่ส่งข้อความหรือแก้ไฟล์บัญชีจริง
และลบ SQLite/Vault fixture หลังแต่ละกรณี

ผลตรวจที่รันในงานนี้ (Linux, Node 24.19.0):

| การตรวจ | ผล |
| --- | --- |
| Google/OAuth/Vault/Skill-selection focused tests | 72 passed |
| Harness connector/Skill focused tests | 11 passed |
| Skill examples ผ่าน native execute | 76/76; 11 families |
| Standalone reproduction runner | 6 reproduced findings, 1 contract gap, 1 Tasks limitation |
| Root `npm test` | 1,060 passed, 4 skipped, 0 failed |
| Desktop `npm test` | 914 passed, 2 skipped, 0 failed |
| `python3 scripts/validate_repo.py` | passed |
| Desktop clean `npm ci`, `npm run build` | passed |
| Desktop `npm run format:check` และ audit runner formatting | passed |
| Electron `google-connect-smoke.mjs` | passed: pending/error persistence/client import/cancel/retry/preconfigured OAuth |
| Electron `google-services-smoke.mjs` | passed: 11 families, full-access selection, explicit send intent, account-bound upgrades, English/narrow/dark UI |
| Electron `workspace-reliability-smoke.mjs` | passed: paused account/resume, trusted credential prompts, readable result consent |

จำนวน focused tests เป็นส่วนย่อยของชุดรวม ไม่ให้นับบวกเป็นจำนวน regression ที่ไม่ซ้ำกัน
Electron smokes ใช้ renderer จริงกับ **synthetic IPC/OAuth** ไม่มีการลงชื่อบัญชี Google จริง
ไม่ได้รัน full macOS/Windows Electron suite หรือ Office runtime acceptance

ครั้งแรก build พบ `motion/react` ขาดใน node_modules เดิม; ติดตั้งใหม่ตาม lockfile แล้ว build ผ่าน
ครั้งแรก Electron smoke พบ binary ยังไม่ถูกติดตั้งหลัง `npm ci`; รัน installer ของ Electron 44.4.5
กับ archive ที่ cache ไว้แล้วจึงผ่านทั้งสาม smoke ไม่มีการเปลี่ยน dependency versions หรือปิด test
ผลเหล่านี้แยกจาก Google service failures

ตรวจ `git fetch origin main` ซ้ำก่อนปิดรายงานแล้ว baseline ยังเป็น `127218295efbeb8b4b4d9a85b471033011574bbb`

การปิด live acceptance ต้องใช้ environment/เครื่องที่เข้าถึง OAuth และ API เหล่านี้ได้
พร้อมบัญชีทดสอบที่เชื่อมผ่าน Vault, API ที่เปิดใน Cloud project และ scope ที่ผู้ใช้ยินยอมจริง
จากนั้นตรวจ read/write/read-back กับ fixture ของแต่ละบริการและ cleanup ทรัพยากรทดสอบ
การส่ง Gmail/Chat หรือเชิญผู้เข้าร่วมต้องเป็นกรณีทดสอบที่ระบุผู้รับและยืนยันแยกต่างหาก
