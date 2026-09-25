# วิธีการจากชุมชนที่ดัดแปลงเข้า STeP AI Harness

เอกสารนี้บันทึกว่าแนวคิดจาก Skill ของชุมชนเข้ามาอยู่ตรงไหน และภายใต้ license ใด

หลักที่ใช้ตาม `step-skill-authoring`: **ดัดแปลงวิธีการแล้วเขียนใหม่ให้เข้ากับ STeP ไม่คัดลอกทั้งไฟล์** เพราะ Skill ของเราต้องมีโครง Standard v2 มี Source, Authority และ Handoff ซึ่ง Skill ภายนอกไม่มี และ repository นี้เป็น Public

ตรวจ license ณ วันที่ 25 กันยายน 2569 จาก commit ล่าสุดของแต่ละ repository

| ต้นทาง | License | สิ่งที่นำมาใช้ | อยู่ที่ |
| --- | --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) `to-questionnaire` | MIT © 2026 Matt Pocock | ถามผู้ใช้เฉพาะเรื่องการส่ง แล้วเขียนคำถามที่เจาะช่องว่างระหว่างสิ่งที่ผู้รับรู้กับสิ่งที่ผู้ใช้ต้องการ · โครงแบบสอบถามที่มีวัตถุประสงค์ บริบท วิธีตอบ และข้อปิดท้าย | Skill ใหม่ `stakeholder-questionnaire` |
| [mattpocock/skills](https://github.com/mattpocock/skills) `writing-for-agents` | MIT © 2026 Matt Pocock | ทุกขั้นตอนต้องมีเกณฑ์ว่าเสร็จ · ตัวชี้ไปไฟล์ย่อยต้องบอกว่าเปิดเมื่อไร · เขียนสิ่งที่ต้องทำแทนการห้าม · ตัดประโยคที่ไม่เปลี่ยนพฤติกรรม | `step-skill-authoring` ส่วน Writing for the agent |
| [anthropics/skills](https://github.com/anthropics/skills) `skill-creator` | Apache 2.0 | เทียบผลแบบมี Skill กับไม่มี Skill · assertion ต้องตรวจได้จริงและมีชื่อบอกว่าตรวจอะไร · หา assertion ที่ผ่านเสมอไม่ว่ามี Skill หรือไม่ | `step-skill-authoring` ขั้น Baseline, `evals/skills/*.json` |
| [anthropics/skills](https://github.com/anthropics/skills) `discernment-nudge` | Apache 2.0 | หลังคำตอบที่ผู้ใช้จะนำไปตัดสินใจ แนบคำถามชวนตรวจ 2–3 ข้อที่อ้างถึงสิ่งในคำตอบ ครั้งเดียวต่อบทสนทนา และข้ามเมื่อผู้ใช้ขอตรวจเองหรือให้ข้อมูลมาเอง | คำสั่งให้ AI ใน `src/modules/router/router-prompt.js` |
| [anthropics/skills](https://github.com/anthropics/skills) `doc-coauthoring` | Apache 2.0 | Reader testing: คาดคำถามที่ผู้อ่านจะถาม แล้วตรวจว่าเอกสารตอบได้หรือยัง | `document-review` ขั้น Reader check |
| [obra/superpowers](https://github.com/obra/superpowers) `writing-skills` | MIT © 2025 Jesse Vincent | เขียนเคสที่ AI ทำพลาดเมื่อไม่มี Skill ก่อนเขียน Skill (RED → GREEN) · description บอกเงื่อนไขที่ใช้ ไม่สรุปขั้นตอน | `step-skill-authoring` ขั้น Baseline และ Trigger Metadata |

## ที่ตัดสินใจไม่นำมาใช้

| ต้นทาง | เหตุผล |
| --- | --- |
| anthropics/skills `docx`, `pdf`, `pptx`, `xlsx` | License "All rights reserved" (source-available) คัดลอกเข้า repository Public ไม่ได้ |
| anthropics/skills `internal-comms`, `brand-guidelines` | ซ้ำกับ `step-writing`, `executive-status-update` และ `step-brand` ที่มีอยู่ |
| mattpocock/skills `grill-me`, `grilling` | ซ้ำกับ `assumption-challenger` |
| Skill สายพัฒนาซอฟต์แวร์ เช่น `tdd`, `code-review`, `systematic-debugging` | ไม่ใช่งานของพนักงาน STeP ส่วนผู้พัฒนา Harness ใช้จาก Claude Code ได้โดยตรง |

## ข้อความ license

MIT License กำหนดให้แนบประกาศลิขสิทธิ์เมื่อคัดลอกส่วนสำคัญของซอฟต์แวร์ ไฟล์ใน repository นี้ไม่ได้คัดลอกข้อความต้นฉบับ แต่บันทึกที่มาไว้ที่นี่และท้ายไฟล์ที่ดัดแปลง เพื่อให้ตรวจย้อนได้
Apache License 2.0 ให้ใช้และดัดแปลงได้โดยระบุที่มาและบอกว่ามีการเปลี่ยนแปลง ตารางด้านบนทำหน้าที่นั้น
