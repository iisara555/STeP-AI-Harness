# STeP AI Skills (Claude, Codex, Gemini CLI, Antigravity)

Skills และกติกาการทำงานของ STeP สำหรับ Claude Code, Claude Desktop, Codex, Gemini CLI และ Google Antigravity

## ติดตั้งใน Claude

ใน Claude Code พิมพ์:

```text
/plugin marketplace add iisara555/STeP-AI-Harness
/plugin install step@step-ai
```

แล้วเริ่มแชตใหม่ เรียก Skill ด้วย `/step:<ชื่อ>` เช่น `/step:meeting-summary` หรือพิมพ์งานตามปกติ Claude จะเลือก Skill ที่ตรงกับงานเอง

ทุกแชตเริ่มด้วยกติกาของ STeP (การอนุมัติโดยมนุษย์ ข้อมูลส่วนบุคคล ความลับ และการเขียน) จาก `session-brief.md`

## อัปเดตใน Claude

`/plugin marketplace update step-ai` แล้วเริ่มแชตใหม่

## ติดตั้งใน Gemini CLI

ดาวน์โหลด repository นี้ (ต้องมีสิทธิ์อ่าน) แล้วลิงก์โฟลเดอร์ `plugins/step` เป็น extension:

```text
git clone https://github.com/iisara555/STeP-AI-Harness.git
gemini extensions link STeP-AI-Harness/plugins/step
```

Gemini จะถามว่าเชื่อถือโฟลเดอร์นี้ไหม ตอบ y แล้วเริ่มแชตใหม่ Gemini เห็น Skills ของ STeP และกติกาจาก `GEMINI.md` ทุกแชต อัปเดตด้วย `git pull` ในโฟลเดอร์ที่ดาวน์โหลดไว้

Gemini CLI ต้องลงชื่อด้วย Gemini API key หรือบัญชีองค์กรที่มี Gemini Code Assist Standard/Enterprise บัญชี Google ส่วนตัว (รวม Google AI Plus/Pro) ใช้กับ Gemini CLI ไม่ได้แล้ว

## ติดตั้งใน Codex

```text
codex plugin marketplace add iisara555/STeP-AI-Harness
codex plugin add step@step-ai
```

Codex ไม่รัน hook ของ plugin จึงต้องใส่กติกาของ STeP ลง `~/.codex/AGENTS.md` อีกครั้งเดียว จากโฟลเดอร์ที่ดาวน์โหลด repository ไว้:

```text
node scripts/install-agent-skills.mjs codex
```

(หรือคัดลอกเนื้อหา `session-brief.md` ไปวางท้าย `~/.codex/AGENTS.md` เอง) อัปเดตด้วย `codex plugin marketplace upgrade`

## ติดตั้งใน Google Antigravity

Antigravity อ่าน Skills จากโฟลเดอร์งาน ติดตั้งลงโฟลเดอร์ที่จะเปิดใน Antigravity จากโฟลเดอร์ที่ดาวน์โหลด repository ไว้:

```text
node scripts/install-agent-skills.mjs antigravity <โฟลเดอร์งาน>
```

ได้ `.agents/skills/` (Skills), `.agents/rules/step.md` (กติกาฉบับย่อ ใช้ทุกแชต) และ `.agents/step/` (กติกาเต็ม เอกสาร manifest) รันซ้ำเพื่ออัปเดต Skills อื่นใน `.agents/skills/` ไม่ถูกแตะ Antigravity ลงชื่อด้วยบัญชี Google ได้ ไม่ต้องใช้ API key

## ใช้ร่วมกับ step-ai installer

ถ้าโฟลเดอร์งานเคยติดตั้งด้วย `step-ai install` แล้ว (มี `CLAUDE.md` และโฟลเดอร์ `skills/` ของ STeP) ไม่ต้องติดตั้ง plugin นี้ในโฟลเดอร์นั้น เพื่อไม่ให้ Skill ซ้ำสองชุด
