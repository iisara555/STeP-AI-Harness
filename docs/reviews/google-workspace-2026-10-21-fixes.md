# Google Workspace — การแก้ production code ตาม audit

แก้ต่อจาก [ผล audit ของ main 1272182](google-workspace-2026-10-21.md) และ audit PR #229
โดยคง [หลักฐานก่อนแก้](google-workspace-2026-10-21.json) ไว้และเพิ่ม
[ผลตรวจหลังแก้](google-workspace-2026-10-21-fixes.json) แยกกัน

## พฤติกรรมที่เปลี่ยน

| Audit | การแก้ใน production |
| --- | --- |
| GWA-01 · refresh ชั่วคราวทำให้บัญชีใช้ต่อไม่ได้ | Network/5xx/invalid response ไม่ตั้ง reauth; invalid_grant ยังต้องเชื่อมใหม่ งานอ่านที่ผู้ใช้เรียกครั้งถัดไป refresh ใหม่ได้ ไม่มี automatic write retry |
| GWA-02 · ยกเลิกงานหนึ่งกระทบอีกงาน | Shared refresh มี controller ของตัวเองและนับ waiter; ยกเลิกเฉพาะ waiter ของงานนั้น ยกเลิก request เมื่อไม่มี waiter หรือบัญชีถูก invalidate และไม่ให้ผลล่าช้าบันทึก token ทับบัญชีที่เปลี่ยนแล้ว |
| GWA-03 · catalog แยกบัญชีไม่ได้ | ส่ง masked label พร้อมหมายเลขแยกชื่อซ้ำ โดยยังใช้ handle ผูก session และไม่ส่ง subject/token/raw email |
| GWA-04 · gws เขียนแล้วอาจรายงาน failure ธรรมดา | หลังเริ่ม runner การล้ม/abort/ตอบไม่ครบเป็น WORKSPACE_OUTCOME_UNKNOWN พร้อม operation/digest/target ที่ไม่มี body หรือ upstream diagnostics; การปฏิเสธก่อนเรียกและ ENOENT แยกเป็น definite failure |
| GWA-05 · Apps Script lost update | Queue ต่อ account/project ครอบ token acquisition, preflight/hash/merge และ PUT; งาน hash เก่าหยุดด้วย GOOGLE_SOURCE_CHANGED; งานที่รอหลัง unknown outcome หยุดโดยไม่เรียก Google ต่อ งานคนละโครงการยังทำขนานได้ |
| GWA-06 · Shared-drive search gap | Native และ optional gws ค้น all-drives เป็นค่าเริ่มต้น เพิ่ม checked driveId/ตัวเลือก My Drive และขอ incompleteSearch ใน fields; Skill ต้องเปิดเผยเมื่อค้นไม่ครบ |
| GWA-07 · Gmail charset ผิด | Decode text/plain ตาม charset ของ MIME part ด้วย strict TextDecoder รวม windows-874/TIS-620; invalid/unsupported encoding หรือ base64 คืน contentUnavailable แทน replacement characters ส่วนที่อ่านได้ไม่ทำให้ถือว่าครบทั้งฉบับ |

การ claim shared refresh เกิดภายใน Vault sink ก่อน yield จึงไม่เปิดช่องให้ decoded snapshot เก่าที่รออยู่
เริ่ม refresh ซ้ำหลัง token ใหม่ถูกบันทึกแล้ว Queue ยังคงลำดับแม้มีงานที่รอถูกยกเลิก และตรวจ context ใหม่เมื่อถึงคิว
จึงไม่ถือว่าการอนุญาตก่อนรอให้สิทธิ์ใช้บัญชี/นโยบายที่เปลี่ยนไปแล้ว

ตามคำขอเพิ่มเติมของผู้ใช้ งานอ่าน Google ในแชตขออนุมัติครั้งเดียวต่อคำขอ ครอบคลุมการค้น อ่านหน้าถัดไป
และเปิดรายการที่เกี่ยวข้องของบัญชีเดิมพร้อมส่งผลให้ AI ที่ระบุ Dialog ระบุคำขอปัจจุบัน บัญชี AI/model/endpoint
และขอบเขตอ่าน ทุกผลยังคงผ่าน privacy gate และข้อมูลที่ถูก block ไม่ออกไป สิทธิ์อยู่เฉพาะ tool loop
และตรวจซ้ำก่อน AI turn/อ่าน cache คำขอใหม่หรือ context/account/Vault เปลี่ยนใช้สิทธิ์เดิมไม่ได้
การส่ง แก้ไข ลบ และสร้าง draft ยังคงยืนยัน payload ทุกครั้ง ผู้ดูแลกำหนดให้ถามทุกครั้งได้ด้วย
`transmissionConsent.allowRunScope: false` ไม่ใช้สิทธิ์ใหม่นี้กับ direct Settings หรือ optional gws

## การตรวจ

Regression หลักอยู่ใน [google-workspace-reliability.test.ts](../../desktop/test/google-workspace-reliability.test.ts)
และ [google-workspace-connector.test.js](../../test/google-workspace-connector.test.js)
รวม [google-read-consent.test.ts](../../desktop/test/google-read-consent.test.ts) สำหรับหนึ่ง approval ต่อคำขอ
ใช้ barriers และ synthetic transport เพื่อคุมลำดับ race รวมถึง cancellation, rotated tokens, queued writes,
unknown outcomes, context changes, MIME charsets และ scope ของการค้น Shared drives
ทดสอบพฤติกรรมเดิมที่ล้มก่อนแก้และพฤติกรรมหลังแก้ โดยไม่ปิดหรือข้าม test เพื่อให้ผ่าน

รันการตรวจทั้ง 76 Skill operations และ regression suites ได้ด้วย:

```sh
npm --prefix desktop ci
node --import ./desktop/node_modules/tsx/dist/loader.mjs scripts/audit-google-workspace.mts
```

Runner ปัจจุบันต้องผ่านหลังแก้ ไม่คาดหวังให้ bug เดิมคงอยู่ ตัว runner ก่อนแก้ยังอยู่ใน audit commit `49f91c8`
และ JSON เดิมยังเก็บผล baseline เพื่อเทียบได้

ผลตรวจจาก source หลังแก้ในงานนี้ (Linux, Node 24.19.0):

| การตรวจ | ผล |
| --- | --- |
| Native reliability regressions | 15 passed |
| Read-request consent regressions | 7 passed |
| Optional gws connector suite | 9 passed (รวม 3 tests ใหม่) |
| Skill examples ผ่าน native execute | 76/76 operations, 11 families |
| Root `npm test` | 1,063 passed, 4 skipped, 0 failed |
| Desktop `npm test` | 936 passed, 2 skipped, 0 failed |
| Desktop clean `npm ci` / Electron runtime install / build | passed |
| Desktop `npm run format:check` | passed |
| `python3 scripts/validate_repo.py` | passed |
| Generated plugin freshness | passed |
| Electron Google connection / service selection / Workspace reliability | ทั้งสาม smoke ผ่านกับ renderer จริงและ synthetic IPC/OAuth |

จำนวน regression suites เป็นส่วนย่อยของชุดรวม ไม่นับบวกซ้ำ ไม่มีการปิด test หรือเปลี่ยน dependency versions
Native smokes ใช้ source ที่ build หลังแก้ ไม่อ้างว่าเป็นการลงชื่อบัญชี Google จริง
ผล CI ของ PR จะตรวจแยกตาม commit ที่ push; ผล local เหล่านี้ไม่ใช้แทน Windows/macOS acceptance

## ขอบเขตที่ยังเหลือ

- Apps Script queue ป้องกันงานภายใน GoogleWorkspace instance นี้เขียนทับกัน Google ไม่มี atomic content precondition
  ผู้แก้จากอีก process/device หรือการทำงานที่ Google อาจยังทำต่อหลัง timeout/abort ยังต้องอ่านและตรวจใน Google
  ก่อนทำ write ใหม่ ไม่มีการรับรองว่า remote operation ถูกยกเลิกแล้ว
- บัญชีที่ถูกตั้ง reauth โดยเวอร์ชันก่อนแก้ไม่สามารถแยกจาก grant ที่ถูกเพิกถอนด้วยข้อมูลเดิม ต้องเชื่อมใหม่หนึ่งครั้ง
- Sheet edits ยังไม่มี atomic revision guard; Docs หลาย tab และ binary transfers ยังมีข้อจำกัดตาม catalog เดิม
- ไม่เปลี่ยน OAuth scopes, service intents, policy defaults, Vault protection, exact-payload write approvals หรือ result privacy gate
  Desktop ยังคงใช้ REST/OAuth/Vault ส่วน optional connector ใช้ gws; ไม่เพิ่ม gogcli binary bridge
- Environment ยังไม่มี Google credential bindings และ Google API/OAuth hosts ถูก proxy ปฏิเสธ
  หลักฐานทั้งหมดจึงเป็น synthetic/offline/native UI checks ยังไม่รับรอง live account/API enablement
- ไม่มี version bump, merge หรือ release publication ในงานนี้
