# STeP AI Skills สำหรับ Claude, Codex และ Antigravity

Skills และกติกาการทำงานของ STeP สำหรับคนที่มีบัญชี AI อยู่แล้ว ใช้ได้ 3 โปรแกรม:

| โปรแกรม | บัญชีที่ใช้ได้ | วิธีติดตั้ง |
| --- | --- | --- |
| Claude Code / Claude Desktop | Claude Pro, Max, Team หรือ Enterprise | พิมพ์ 2 คำสั่งใน Claude |
| Codex | ChatGPT Plus, Pro, Business หรือ Enterprise | 2 คำสั่งใน Codex + สคริปต์ 1 ครั้ง |
| Google Antigravity | บัญชี Google (รวม Google AI Plus/Pro) | สคริปต์ลงโฟลเดอร์งาน |

ทุกโปรแกรมได้ Skills ชุดเดียวกันและกติกาเดียวกัน: มนุษย์อนุมัติเอง ข้อมูลส่วนบุคคล ความลับ การเขียน และที่เก็บไฟล์ผลงาน

Gemini CLI ไม่รองรับแล้ว เพราะ Google หยุดให้บริการกับบัญชีส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 คนที่ใช้บัญชี Google ให้ใช้ Antigravity แทน

## Claude

ใน Claude Code พิมพ์:

```text
/plugin marketplace add iisara555/STeP-AI-Harness
/plugin install step@step-ai
```

แล้วเริ่มแชตใหม่ พิมพ์งานตามปกติ Claude จะเลือก Skill ที่ตรงกับงานเอง หรือเรียกเองด้วย `/step:<ชื่อ>` เช่น `/step:meeting-summary`

อัปเดต: `/plugin marketplace update step-ai` แล้วเริ่มแชตใหม่

## Codex

ใน terminal:

```text
codex plugin marketplace add iisara555/STeP-AI-Harness
codex plugin add step@step-ai
```

Codex ไม่รัน hook ของ plugin จึงต้องใส่กติกาของ STeP ลง `~/.codex/AGENTS.md` อีกครั้งเดียว ต้องมี [Node.js](https://nodejs.org) และโฟลเดอร์ของ repository นี้ (`git clone https://github.com/iisara555/STeP-AI-Harness.git` หรือกด **Code → Download ZIP** บน GitHub แล้วแตกไฟล์) จากนั้นรันในโฟลเดอร์นั้น:

```text
node scripts/install-agent-skills.mjs codex
```

ถ้าไม่มี Node.js คัดลอกเนื้อหา `session-brief.md` ไปวางท้าย `~/.codex/AGENTS.md` เองก็ได้

อัปเดต: `codex plugin marketplace upgrade`

## Google Antigravity

Antigravity อ่าน Skills จากโฟลเดอร์งานที่เปิดอยู่ จึงติดตั้งลงโฟลเดอร์งานทีละโฟลเดอร์ ต้องมี [Node.js](https://nodejs.org) และโฟลเดอร์ของ repository นี้ (clone หรือ Download ZIP แบบเดียวกับ Codex) จากนั้นรันในโฟลเดอร์ของ repository:

```text
node scripts/install-agent-skills.mjs antigravity <โฟลเดอร์งาน>
```

เช่น `node scripts/install-agent-skills.mjs antigravity ~/Documents/งานSTeP` แล้วเปิดโฟลเดอร์งานนั้นใน Antigravity

สิ่งที่ได้ในโฟลเดอร์งาน:

- `.agents/skills/` — Skills ของ STeP
- `.agents/rules/step.md` — กติกาฉบับย่อ Antigravity ใช้ทุกแชต
- `.agents/step/` — กติกาฉบับเต็ม เอกสาร และ manifest ที่ Skills อ้างถึง

อัปเดต: ดึงรุ่นใหม่ของ repository (`git pull` หรือ Download ZIP ใหม่) แล้วรันคำสั่งเดิมซ้ำ Skills ของคุณเองใน `.agents/skills/` จะไม่ถูกแตะ

## ใช้กับ STeP Desktop ได้ไหม

ได้ ใช้คู่กันได้ STeP Desktop มี Skills ชุดเดียวกันอยู่แล้ว ไม่ต้องติดตั้ง plugin เพิ่มสำหรับ Desktop
