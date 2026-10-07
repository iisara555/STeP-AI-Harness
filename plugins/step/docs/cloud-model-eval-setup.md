# ประเมิน Office Skills ด้วย ChatGPT/Codex OAuth

บัญชีที่ลงชื่อเข้าใช้ใน STeP Desktop ไม่ถูกส่งเข้า cloud อัตโนมัติ งานนี้ใช้ ChatGPT/Codex OAuth จึงไม่ต้องเพิ่ม API key, secret alias หรือ model ID ให้ใช้โปรไฟล์ connection บนเครื่องที่ล็อกอินได้จริง ไม่อ่าน/คัดลอก token files และไม่เขียน credentials ใน Git, scripts หรือ reports

## คำสั่งเดียวกันสำหรับ Windows และ macOS

ใช้ Node 24 และ source `main` ปัจจุบันพร้อม desktop dependencies; ตัวรันนี้เป็นเครื่องมือจาก source ยังไม่มีปุ่มใน installer ปิด STeP Desktop ก่อน live เพื่อไม่ให้ใช้โปรไฟล์พร้อมงานอื่น หากยังไม่มี dependencies ให้รัน `npm --prefix desktop ci` จาก repo root

รันตามลำดับจาก repo root ได้ทั้ง PowerShell และ Terminal:

```sh
npm run desktop:eval:skill-benefit -- --self-test
npm run desktop:eval:skill-benefit -- --list
npm run desktop:eval:skill-benefit -- --connection 1 --probe
```

`--self-test` ตรวจ XLSX/PPTX ทั้ง positive/negative สี่กรณีและคืนไฟล์สังเคราะห์ที่ถูกไว้ให้ตรวจ; `--list` อ่านเฉพาะ connection metadata ใน SQLite แบบ read-only และแสดงหมายเลข ChatGPT subscription profiles; `--probe` ตรวจ OAuth backend และคืน model IDs ที่บัญชีใช้ได้ ทั้งสามคำสั่งไม่ส่ง model prompts ต้องได้ `backendAuthenticated: true` ก่อนรัน live ตัวรัน live ตรวจ prerequisite นี้ซ้ำก่อนเริ่ม

เลือกหมายเลข connection จาก `--list` โดยไม่เดาว่าเลข 1 คือบัญชีที่ต้องการ ตำแหน่งที่ตรวจอัตโนมัติ:

| ระบบ | Desktop data directory |
| --- | --- |
| Windows | `%APPDATA%\STeP Desktop` หรือ `%APPDATA%\@step-cmu\desktop` |
| macOS | `~/Library/Application Support/STeP Desktop` หรือ `~/Library/Application Support/@step-cmu/desktop` |

หากหาไม่พบหรือพบหลายตำแหน่ง ให้เติม `--data-dir "โฟลเดอร์ที่มี workspace.sqlite"` ใช้ `--profile "โฟลเดอร์ runtimes ของ connection ที่ต้องการ"` ได้สำหรับตำแหน่งกำหนดเอง ไม่มี fallback ไปใช้ personal Codex profile โดยไม่ระบุ โทเคนถูกใช้ผ่าน CLI เดิมโดยตรง ไม่ถูกคัดลอกเข้ารายงาน

## งบที่อนุมัติและการรันต่อ

ขอบเขตเดิม: ทุก connection/โมเดลที่พร้อม สูงสุดสามคู่ทดสอบต่อโมเดล ตัวรันนี้ทำสามคู่จาก positive cases ใน `evals/skills/`: Excel (`spreadsheet-work`), PowerPoint (`presentation-design`) และข้อเสนอ (`decision-memo`) ใช้เครื่องมือเหมือนกันทั้งสอง arm และเพิ่มเฉพาะ Skill/references ใน WITH สลับลำดับและแยก stores/workspaces/ephemeral threads ไม่ใช้ model judge

สำหรับงานรอบนี้ สำรองความพยายาม cloud ก่อนหน้า 2 คำขอในโมเดล gpt-6-astra ด้วย flag นี้ **ไม่ล้างจำนวนที่เคยใช้ไป**:

```sh
npm run desktop:eval:skill-benefit -- --connection 1 --live --prior-calls gpt-6-astra=2
```

สำหรับงานใหม่ที่ไม่มีความพยายามก่อนหน้า ให้ไม่ระบุ `--prior-calls` ค่าก่อนหน้าต้องตั้งตอนเริ่ม ledger; ถ้ามี ledger แล้วแต่จำนวน seed ไม่ตรง ตัวรันปฏิเสธแทนการเขียนทับ

- เลือก **เครื่องเดียวต่อบัญชี** สำหรับ live อีกเครื่องใช้ self-test/Excel/PowerPoint review ได้ ไม่เริ่ม results folder ใหม่เพียงเพราะสลับ Windows/macOS
- ผลอยู่ที่ `STeP-Office-Eval` ใน home ของผู้ใช้ หรือ `--output "โฟลเดอร์นอก repo"` ปฏิเสธ output ใน checkout, symlink ที่ชี้เข้า checkout และ output ที่ทับ auth profile
- `budget.json` บันทึกคำขอก่อนส่ง จำกัดรวมไม่เกิน 18 admitted calls/model และไม่เกิน 3 model turns/trial; failed calls นับด้วย เมื่อยอด token ที่วัดได้ถึง 120,000 จะไม่รับคำขอถัดไป นี่เป็น admission threshold ไม่ใช่ hard cap ของ generation และ token ก่อน ledger ไม่ทราบ
- ใช้คำสั่งเดิม/output เดิมและ source/fixtures รุ่นเดิมเพื่อรันต่อ จะไม่ทำซ้ำ trial ที่บันทึกแล้ว เมื่อต้องย้ายเครื่อง ให้ย้าย results folder **ทั้งโฟลเดอร์รวม ledger** หลังตัวรันเดิมหยุดแล้ว บัญชีคนละบัญชีจริงใช้ output แยกภายในงบที่อนุมัติ
- auth/network/quota/timeout failures หยุดชุดทดสอบ ไม่มี retry prompts อัตโนมัติ โมเดลที่ไม่รองรับถูกบันทึกแล้วข้าม มี lock กันงานซ้อนใน output เดียวกัน อย่าลบ lock ขณะตัวรันเดิมยังทำงาน
- native shell/web/plugins/apps/MCP ปิด ทั้งสอง arm ใช้ bounded host Office tools งานสังเคราะห์ใช้ Accept Edits ภายใน workspace ใหม่ของ trial เท่านั้น ไม่เปลี่ยน policy default ของแอป

## ผลที่ review ได้และสิ่งที่ยังค้าง

แต่ละรอบมี `recording.json`, `report.json` และ `summary.json` ไฟล์ summary ตัดคำตอบเต็ม identity/path และ raw tool results ออก ใช้ส่งกลับ review; ห้าม commit OAuth profiles, Desktop database หรือเอกสารจริงใน public repo สูตร/รหัสอ่านจาก XLSX จริง ส่วน PPTX ตรวจโครงสร้าง native table/chart/notes ยังไม่ตรวจ layout และทุกค่าในกราฟอย่างครบถ้วน Memo มี heuristic flags และต้อง review ความหมายโดยคน

เปิด XLSX ใน Excel ให้ B4 คำนวณเป็น 300 และคงรหัส 00123/00007; เปิด PPTX ใน PowerPoint ตรวจภาษาไทย ฟอนต์ การทับกัน ตาราง/กราฟที่แก้ได้และ notes บันทึก OS/application version และผลตามที่ตรวจจริงแยกจาก structural checks

สามคู่ข้างต้นยังไม่ครอบคลุม live coauthoring ของ `step-writing`, `document-review`, `sop-authoring` หรือ `receipt-audit` ไม่ใช่ eval output ครบสี่มิติของทุก Skill Anti-trigger/collision routing ตรวจแยกใน CI จึงคง `modelSideRun: not-yet-run` และ lifecycle `draft` จนมี recordings จริงที่ review แล้ว ไม่ใช้การผ่าน unit tests แทน model benefit หรือ real OCR acceptance

## Cloud troubleshooting

ChatGPT/Codex OAuth ใช้ `chatgpt.com` และ `auth.openai.com`; network settings ไม่ทำให้ Desktop OAuth ถูกส่งเข้ามา cloud ในรอบ 7 ตุลาคม 2569 หลังเปิดโดเมน backend เข้าถึงได้แต่ตอบ 401 "Could not parse your authentication token" และ refresh ไม่ผ่าน จึงไม่ส่ง prompt เพิ่ม การอ่าน local login/model metadata สำเร็จยังไม่พิสูจน์ backend authentication

ถ้า `--probe` ได้ `OAUTH_REAUTH_REQUIRED` ให้ยืนยันตัวตนด้วย supported login บนเครื่องที่ใช้ eval ไม่แก้ token files หรือใช้ API key แทน OAuth ที่ผู้ใช้เลือก ฟังก์ชันเชื่อมต่อของ Desktop อาจส่ง prompt ทดสอบหนึ่งครั้ง: ต้องนับจำนวนนี้เพิ่มใน prior calls ตามโมเดลที่ใช้ก่อน live ไม่กดทดสอบซ้ำเพื่อแก้ network failure

## ตัวประเมิน API เดิม — ใช้เฉพาะเมื่อเลือกเส้นทาง API โดยชัดแจ้ง

Native provider smoke/golden evaluation ใช้ `STEP_EVAL_API_KEY`, `STEP_EVAL_APPROVE_LIVE=1`, `STEP_EVAL_PROVIDER`, `STEP_EVAL_MODEL`, `STEP_EVAL_RUNS` และ `STEP_EVAL_MAX_CALLS`. ส่ง alias ของ secret ที่เลือกเฉพาะ process ไม่ตั้งค่าระดับเครื่อง:

```sh
# ตัวอย่างสำหรับตรวจ golden suite เดิมบน OpenAI; ใช้ quota จริงเมื่อรัน
STEP_EVAL_API_KEY="$STEP_OPENAI_EVAL_KEY" STEP_EVAL_APPROVE_LIVE=1 \
STEP_EVAL_PROVIDER=openai STEP_EVAL_MODEL="$STEP_EVAL_MODEL" \
STEP_EVAL_RUNS=3 STEP_EVAL_MAX_CALLS=12 npm --prefix desktop run eval:golden
```

Golden suite เดิมมี 3 synthetic scenarios; 3 รอบคือ 9 งานตอบตามปกติ. Retry นับใน maxCalls=12 เช่นกัน; หยุดเมื่อถึงขอบเขตหรือพบ auth/quota failure. คำสั่งนี้ตรวจ suite เดิม ไม่ใช่การประเมิน Office แบบมี/ไม่มี Skill และไม่ควรใช้ผลแทนกัน. Gemini ใช้ alias `STEP_GEMINI_EVAL_KEY`/provider `gemini`; Claude API ใช้ `STEP_CLAUDE_EVAL_KEY`/provider `claude`. ตรวจ model ID ก่อนรัน อย่าเลือกค่า placeholder.

`scripts/skill-eval-compare.mjs` ใช้ API text transport อีกชุด: `STEP_EVAL_BASE_URL`, `STEP_EVAL_PROTOCOL`, `STEP_EVAL_MODEL`, `STEP_EVAL_KEY` และ optional `STEP_EVAL_JUDGE_MODEL`. ตรวจจำนวนคำขอก่อนใช้ quota ได้ด้วย `--dry-run --runs 3`.

| บัญชี API | base URL | protocol | secret alias ที่ใช้เป็น STEP_EVAL_KEY |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `openai` | `STEP_OPENAI_EVAL_KEY` |
| Anthropic | `https://api.anthropic.com/v1` | `anthropic` | `STEP_CLAUDE_EVAL_KEY` |
| Gemini OpenAI-compatible endpoint | `https://generativelanguage.googleapis.com/v1beta/openai` | `openai` | `STEP_GEMINI_EVAL_KEY` |

ตรวจว่า model รองรับ endpoint และ request schema นั้นด้วย; model ที่ใช้ API เฉพาะอาจต้อง adapter เพิ่ม. สคริปต์นี้เปรียบเทียบ **Skill ก่อน/หลัง** และเรียก model judge เพิ่ม ไม่ใช่ WITH/WITHOUT Skill; ไม่มี native Office tool execution ใน transport นี้. `spreadsheet-work` เป็น Skill ใหม่จึงไม่มี old version ที่ main ก่อนรวม Office สำหรับสคริปต์นี้.


Legacy golden/old-new API evaluators ข้างต้นไม่ใช่ตัวรัน OAuth และไม่ใช่ผล WITH/WITHOUT Skill ของ Office อย่าตั้ง API secrets เพียงเพื่อใช้คำสั่ง OAuth ในหน้านี้ ดู [แผนประเมิน](tool-usability-eval.md)
