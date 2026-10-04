# STeP AI Skills สำหรับ Claude, Codex และ Antigravity

Skills และกติกาการทำงานของ STeP สำหรับคนที่มีบัญชี AI อยู่แล้ว ใช้ได้ 3 โปรแกรม:

| โปรแกรม | บัญชีที่ใช้ได้ | วิธีติดตั้ง |
| --- | --- | --- |
| Claude Code / Claude Desktop | Claude Pro, Max, Team หรือ Enterprise | พิมพ์ 2 คำสั่งใน Claude |
| Codex | ChatGPT Plus, Pro, Business หรือ Enterprise | 2 คำสั่งใน Codex + สคริปต์ 1 ครั้ง |
| Google Antigravity | บัญชี Google (รวม Google AI Plus/Pro) | สคริปต์ 1 ครั้ง (ใช้ได้ทุก workspace) |

ทุกโปรแกรมได้ Skills ชุดเดียวกันและกติกาเดียวกัน: มนุษย์อนุมัติเอง ข้อมูลส่วนบุคคล ความลับ การเขียน และที่เก็บไฟล์ผลงาน

Gemini CLI ไม่รองรับแล้ว เพราะ Google หยุดให้บริการกับบัญชีส่วนตัวและ Google AI Pro/Ultra ตั้งแต่ 18 มิ.ย. 2569 คนที่ใช้บัญชี Google ให้ใช้ Antigravity แทน

## ติดตั้งทุกโปรแกรมในครั้งเดียว

ดาวน์โหลด repository (**Code → Download ZIP** บน GitHub) แตกไฟล์ แล้วดับเบิลคลิก `Setup-STeP-Skills.bat` (Windows) หรือ `Setup-STeP-Skills.command` (macOS) หรือรัน `node scripts/install-agent-skills.mjs setup` ไฟล์นี้ติดตั้ง Skills ลง Claude, Codex และ Antigravity ที่พบในเครื่อง ใส่กติกาของ Codex และถามโปรไฟล์ ต้องมี [Node.js](https://nodejs.org) 18 ขึ้นไป หัวข้อด้านล่างคือวิธีทำทีละโปรแกรม

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

ต้องมี [Node.js](https://nodejs.org) และโฟลเดอร์ของ repository นี้ (clone หรือ Download ZIP แบบเดียวกับ Codex) จากนั้นรันในโฟลเดอร์ของ repository:

```text
node scripts/install-agent-skills.mjs antigravity
```

ติดตั้งครั้งเดียวใช้ได้ทุก workspace ปิดแล้วเปิด Antigravity ใหม่ สิ่งที่ได้:

- `~/.gemini/config/skills/` — Skills ของ STeP (global Skills ของ Antigravity)
- `~/.gemini/config/step/` — กติกาฉบับเต็ม เอกสาร และ manifest ที่ Skills อ้างถึง
- `~/.gemini/GEMINI.md` — กติกาฉบับย่อ เพิ่มเป็นบล็อกท้ายไฟล์ (กติกา global ใช้ทุกแชต) ข้อความเดิมของคุณในไฟล์นั้นยังอยู่

อัปเดต: ดึงรุ่นใหม่ของ repository (`git pull` หรือ Download ZIP ใหม่) แล้วรันคำสั่งเดิมซ้ำ Skills ของคุณเองจะไม่ถูกแตะ

### ติดตั้งเฉพาะ workspace เดียว

ระบุโฟลเดอร์งานต่อท้าย:

```text
node scripts/install-agent-skills.mjs antigravity <โฟลเดอร์งาน>
```

ได้ `.agents/skills/` `.agents/rules/step.md` และ `.agents/step/` ในโฟลเดอร์นั้น ใช้แบบ global หรือแบบ workspace อย่างใดอย่างหนึ่ง ถ้าใช้ทั้งสองแบบ Skill จะซ้ำสองชุด

ถ้าติดตั้งแบบ global แล้ว Antigravity ไม่เห็น Skills (รุ่นเก่าบางรุ่นอ่าน global Skills จากที่อื่น) ให้ใช้แบบ workspace แทน

## ตั้งโปรไฟล์ (แทน USER.md)

หลังติดตั้งโปรแกรมแล้ว รันในโฟลเดอร์ของ repository ครั้งเดียว:

```text
node scripts/install-agent-skills.mjs profile
```

ตอบชื่อเรียก ทีม ชื่อผู้ช่วย และสไตล์การคุย (Enter ข้ามได้) ระบบเขียนบล็อก "ข้อมูลผู้ใช้ STeP" ลง `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` และ `~/.gemini/GEMINI.md` ของโปรแกรมที่มีในเครื่อง ใช้ทุกแชต รันซ้ำเพื่อแก้ ถ้าโฟลเดอร์งานมี `USER.md` ของชุดเดิม AI ใช้ไฟล์นั้นแทน ห้ามใส่เลขบัตร เบอร์โทร หรือรหัสผ่าน

## ถอนการติดตั้ง

ดับเบิลคลิก `Uninstall-STeP-Skills.bat` (Windows) หรือ `Uninstall-STeP-Skills.command` (macOS) หรือรัน `node scripts/install-agent-skills.mjs uninstall [โฟลเดอร์งาน]` ถอน plugin ออกจาก Claude และ Codex ลบกติกาและโปรไฟล์ที่ Setup เขียนไว้ (ข้อความอื่นในไฟล์ยังอยู่) ลบ Skills ของ STeP ใน Antigravity (Skills ของคุณเองยังอยู่) และถามก่อนลบโปรไฟล์ `~/.step-ai/profile.json` ไฟล์ผลงานไม่ถูกแตะ

## ใช้กับ STeP Desktop ได้ไหม

ได้ ใช้คู่กันได้ STeP Desktop มี Skills ชุดเดียวกันอยู่แล้ว ไม่ต้องติดตั้ง plugin เพิ่มสำหรับ Desktop
