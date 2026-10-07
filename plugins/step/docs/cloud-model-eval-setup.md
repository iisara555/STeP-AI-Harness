# ตั้งค่าบัญชีสำหรับประเมินโมเดลใน cloud

บัญชีที่ล็อกอินใน STeP Desktop บนเครื่องพนักงานไม่ได้ถูกส่งมา Codex cloud อัตโนมัติ. ให้ผู้ดูแลตั้ง secret ของบัญชีที่อนุญาตให้ทดสอบด้วยข้อมูลสังเคราะห์; ไม่ต้องส่ง key/token ในแชต และห้ามใส่ใน Git, setup script, screenshot หรือ report.

## ตั้งค่าใน Codex environment

1. เปิด Codex Settings → Environments → environment ของ `iisara555/STeP-AI-Harness` → Edit. ชื่อเมนูอาจต่างตามหน้าเว็บ/แอป; เลือกส่วน environment variables/secrets ของ environment นี้.
2. เพิ่ม API keys ใน **Secrets** ตามบัญชีที่มี: `STEP_OPENAI_EVAL_KEY`, `STEP_CLAUDE_EVAL_KEY`, `STEP_GEMINI_EVAL_KEY`. เพิ่มเฉพาะบัญชีที่พร้อม ไม่ต้องตั้งทั้งสามเพื่อเริ่ม. API quota แยกจาก ChatGPT/Claude/Google subscription.
3. เพิ่ม variables ที่ไม่ใช่ secret: `STEP_EVAL_PROVIDER` (`openai`, `claude` หรือ `gemini`), `STEP_EVAL_MODEL` (model ID ที่บัญชีนั้นเรียกได้), `STEP_EVAL_RUNS=3`. ระบุชื่อโมเดลแต่ละบัญชีที่จะทดสอบในแชตได้; model ID ไม่ใช่ credential.
4. หากมี network allowlist ให้เปิดเฉพาะปลายทางของ provider ที่เลือก: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`. Compatible gateway ต้องใช้ domain ที่ผู้ดูแลอนุมัติ. อย่าเปิด unrestricted network เพียงเพื่อทดสอบ.
5. เริ่ม cloud session ใหม่เพื่อรับค่าที่แก้ แล้วแจ้งชื่อ secrets/โมเดลที่พร้อม. ตรวจได้โดยรายงานเพียง “ตั้งแล้ว/ยังไม่ตั้ง”; ห้าม `printenv`, พิมพ์ key หรือล็อก request headers.

บาง environment เปิด secrets ให้เฉพาะ setup phase: ถ้า execution phase อ่านไม่ได้ ให้ใช้กลไก secrets ที่ environment รองรับสำหรับ phase นั้นหรือประเมินบนเครื่องผู้ดูแล. ห้ามแก้โดยเขียน secret ลงไฟล์ใน workspace/repo.

## สคริปต์ประเมินที่มีอยู่

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

## ขอบเขต Office ที่อนุมัติ

ใช้ทุก connection/โมเดลที่พร้อม สูงสุด 3 รอบ; ก่อนรันบันทึก matrix จำนวน cases/arms/model calls/retries ให้ชัดเจน. WITH/WITHOUT Skill ต้องคง source และเครื่องมือเหมือนกัน สลับลำดับ และแยก session; อย่าใช้ WITHOUT tools แทน WITHOUT Skill. ดู [แผนประเมิน](tool-usability-eval.md). การมี secret ไม่ใช่หลักฐานว่า eval รันแล้ว: คง `modelSideRun: not-yet-run` จนมี recordings จริงและตรวจผล รวมทั้ง artifacts ของงานสร้างไฟล์.

CLI/subscription connections เช่น Codex, Claude subscription, Copilot และ Antigravity ต้องมีโปรไฟล์ที่ cloud เข้าถึงได้และ adapter สำหรับการประเมินนั้น. Secret ของ API ไม่ได้ยืนยันว่าการล็อกอิน subscription ใช้ได้; ห้ามคัดลอก employee profile/token มาที่ public checkout หรืออ้างว่าทุก connection ถูกทดสอบแล้ว.
