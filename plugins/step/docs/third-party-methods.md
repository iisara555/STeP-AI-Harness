# วิธีการจากชุมชนที่ดัดแปลงเข้า STeP AI Harness

เอกสารนี้บันทึกว่าแนวคิดจาก Skill ของชุมชนเข้ามาอยู่ตรงไหน และภายใต้ license ใด

หลักที่ใช้ตาม `step-skill-authoring`: **ดัดแปลงวิธีการแล้วเขียนใหม่ให้เข้ากับ STeP ไม่คัดลอกทั้งไฟล์** เพราะ Skill ของเราต้องมีโครง Standard v2 มี Source, Authority และ Handoff ซึ่ง Skill ภายนอกไม่มี และ repository นี้เป็น Public

ตรวจ license ของรายการเดิม ณ วันที่ 25 กันยายน 2569; รายการ `knowledge-work-plugins` ที่เพิ่มตรวจจาก commit `da38ec1` วันที่ 27 กันยายน 2569

| ต้นทาง | License | สิ่งที่นำมาใช้ | อยู่ที่ |
| --- | --- | --- | --- |
| [mattpocock/skills](https://github.com/mattpocock/skills) `to-questionnaire` | MIT © 2026 Matt Pocock | ถามผู้ใช้เฉพาะเรื่องการส่ง แล้วเขียนคำถามที่เจาะช่องว่างระหว่างสิ่งที่ผู้รับรู้กับสิ่งที่ผู้ใช้ต้องการ · โครงแบบสอบถามที่มีวัตถุประสงค์ บริบท วิธีตอบ และข้อปิดท้าย | Skill ใหม่ `stakeholder-questionnaire` |
| [mattpocock/skills](https://github.com/mattpocock/skills) `writing-for-agents` | MIT © 2026 Matt Pocock | ทุกขั้นตอนต้องมีเกณฑ์ว่าเสร็จ · ตัวชี้ไปไฟล์ย่อยต้องบอกว่าเปิดเมื่อไร · เขียนสิ่งที่ต้องทำแทนการห้าม · ตัดประโยคที่ไม่เปลี่ยนพฤติกรรม | `step-skill-authoring` ส่วน Writing for the agent |
| [anthropics/skills](https://github.com/anthropics/skills) `skill-creator` | Apache 2.0 | เทียบผลแบบมี Skill กับไม่มี Skill · assertion ต้องตรวจได้จริงและมีชื่อบอกว่าตรวจอะไร · หา assertion ที่ผ่านเสมอไม่ว่ามี Skill หรือไม่ | `step-skill-authoring` ขั้น Baseline, `evals/skills/*.json` |
| [anthropics/skills](https://github.com/anthropics/skills) `discernment-nudge` | Apache 2.0 | หลังคำตอบที่ผู้ใช้จะนำไปตัดสินใจ แนบคำถามชวนตรวจ 2–3 ข้อที่อ้างถึงสิ่งในคำตอบ ครั้งเดียวต่อบทสนทนา และข้ามเมื่อผู้ใช้ขอตรวจเองหรือให้ข้อมูลมาเอง | คำสั่งให้ AI ใน `src/modules/router/router-prompt.js` |
| [anthropics/skills](https://github.com/anthropics/skills) `doc-coauthoring` | Apache 2.0 | Reader testing: คาดคำถามที่ผู้อ่านจะถาม แล้วตรวจว่าเอกสารตอบได้หรือยัง | `document-review` ขั้น Reader check |
| [obra/superpowers](https://github.com/obra/superpowers) `writing-skills` | MIT © 2025 Jesse Vincent | เขียนเคสที่ AI ทำพลาดเมื่อไม่มี Skill ก่อนเขียน Skill (RED → GREEN) · description บอกเงื่อนไขที่ใช้ ไม่สรุปขั้นตอน | `step-skill-authoring` ขั้น Baseline และ Trigger Metadata |
| [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates) รวบรวม `devil` จาก [dhha22/devil-skill](https://github.com/dhha22/devil-skill) | MIT | ตรวจสิ่งที่เอกสารไม่ได้เขียน · finding ต้องเป็นสถานการณ์ · ค้นซ้ำก่อนถาม · ไม่นับส่วนที่ตัดออกแล้ว · pre-mortem 3 เรื่อง · คำถามส่งต่อที่สุภาพ | `tor-review` ขั้น 6, 8, 9 และคำถามส่งต่อ |
| claude-code-templates รวบรวม `root-cause-pareto` จาก [gulmezeren2-byte/industrial-engineering-ai-skills](https://github.com/gulmezeren2-byte/industrial-engineering-ai-skills) | MIT © Eren Gulmez | เลือกหน่วยนับตามผลกระทบ · จัดหมวดก่อนนับ ("อื่น ๆ" ไม่เกินราว 15%) · เทียบกับปริมาณงาน · ตรวจอันดับข้ามสองช่วง · เจาะหมวดอันดับ 1 · ตัวเลขที่ต้องขยับ | `ncr-capa` ส่วน Pareto |
| claude-code-templates รวบรวม `weekly-ops-report` จากแหล่งเดียวกัน | MIT © Eren Gulmez | ตอบ 3 คำถาม · เทียบค่าเฉลี่ยหลายรอบ · รายงานเฉพาะที่เกินเกณฑ์ ไม่เกิน 5 ข้อ · ทุกข้อค้นพบมีตัวขับ · แยกตัวเลขจากความเห็น · คำนวณทวน · หมายเหตุคุณภาพข้อมูล | `quality-objective-kpi-review` ส่วนรายงานประจำรอบ |
| claude-code-templates รวบรวม `avoid-ai-writing` จาก [conorbronsdon/avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing) | MIT © 2026 Conor Bronsdon | หมวดของสำนวน AI (บริบทกว้างเกินเรื่อง ขยายความสำคัญ ปิดท้ายแบบแชตบอต คำฮิตที่มาเป็นกลุ่ม โครงสร้างซ้ำ) เขียนตัวอย่างภาษาไทยใหม่ทั้งหมด | `step-writing/references/thai-ai-writing-patterns.md` |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) `customer-support/skills/customer-escalation/SKILL.md` @ `da38ec1` | Apache-2.0 (plugin LICENSE) | เพิ่มร่าง Escalation Brief ที่แยกผลกระทบที่ยืนยัน สิ่งที่ลองแล้ว และคำขอให้ทีมปลายทางตรวจ โดยไม่แต่ง SLA หรืออ้างว่าส่งต่อแล้ว | `customer-support-faq-triage` |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) `product-management/skills/synthesize-research/SKILL.md` @ `da38ec1` | Apache-2.0 (plugin LICENSE) | ทำ Interview Evidence Grid ผูก finding กับจำนวนผู้ให้ข้อมูล บันทึกต้นทาง ข้อขัดกัน และข้อจำกัดของ sample โดยไม่ถือจำนวนสัมภาษณ์เป็นเกณฑ์อนุมัติ | `startup-discovery` |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) `product-management/skills/competitive-brief/SKILL.md` @ `da38ec1` | Apache-2.0 (plugin LICENSE) | เทียบข้ออ้าง/positioning คู่แข่งพร้อมแหล่งลงวันที่ แยกคำโฆษณาจากพฤติกรรมซื้อและระบุสิ่งที่ยังต้องตรวจ | `market-signal-radar` |

## วิธีการภาษาไทยที่ดัดแปลงเมื่อ 6 ตุลาคม 2569

ต้นทาง: [Boom-Vitt/claude-thai-skills](https://github.com/Boom-Vitt/claude-thai-skills/tree/62929a2092e193a64676170a58b8286eaf41c4bc/skills) @ `62929a2092e193a64676170a58b8286eaf41c4bc` — MIT © 2026 Vittawat (Boom-Vitt) เก็บ [MIT notice](third-party-notices/claude-thai-skills-MIT.txt) คู่กับการดัดแปลง ข้อความ contract, methodology และตัวอย่างเขียนใหม่สำหรับ STeP ไม่ติดตั้ง marketplace ต้นทางหรือรัน installer ของต้นทาง

| ต้นทาง | ส่วนที่ดัดแปลง | จุดใช้ใน STeP |
|---|---|---|
| thai-translate | เลือกระดับภาษา ศัพท์ และตรวจความหมายกลับกับต้นฉบับ | thai-english-translation (draft), translation-review และตัวอย่างสังเคราะห์ |
| thai-government-form | โครงบันทึก/หนังสือตามวัตถุประสงค์ | thai-official-documents/drafting-checks และฟอร์ม Desktop |
| thai-date-format | เดือนไทย เลขไทย และการจัดรูปแบบ พ.ศ./ค.ศ. | thai-data-formatting และ parser ใหม่ของ Desktop ที่ตรวจวันจริง/ศักราช ไม่เดาปีสองหลัก |
| thai-social-caption | เลือกโครงข้อความตามช่องทาง | step-writing/channel-writing และ brand-tone-of-voice |
| thai-customer-service | รับเรื่อง → ชี้แจง → ขั้นตอนถัดไป | customer-support-faq-triage/channel-replies |
| thai-invoice | แยกค่าต้นทาง ฐาน อัตรา สูตรและผลคำนวณ | receipt-audit/arithmetic-review; ไม่ออกเอกสารภาษีหรือยื่นแบบ |

สิ่งที่ไม่รับจากต้นทาง:
- ไม่คัดลอก parser วันที่ที่เดาศตวรรษและปล่อยวันที่ไม่มีจริงเลื่อนไปเดือนอื่น
- ไม่รับข้อความเรื่อง PDF/A, CA, ผลทางกฎหมายของลายเซ็น อัตราภาษี หรือฐานกฎหมาย PDPA เป็น current rule ต้องตรวจ Controlled Source และเจ้าของงาน
- ไม่ใช้การเดาอายุ/เพศจากรูปหรือโปรไฟล์ในการเลือกคำเรียกผู้รับ
- ไม่สร้าง Skill ตรวจ ID ซ้ำ เพราะ Desktop มี checksum อยู่แล้ว ไม่เพิ่ม PromptPay/payment/slip verification ในงานนี้
- ไม่คัดลอก provinces.json ซึ่ง notices ต้นทางระบุว่ามีข้อมูลอ้าง Wikipedia (CC BY-SA 4.0); ไม่ถือ MIT ของ repo เป็นใบอนุญาตข้อมูลทั้งหมด
- ไม่เพิ่มโมเดลตัดคำ Python/NLP, resume หรือ festival-card เป็น Skill ใหม่ ยังไม่มี use case ที่ต้องนำเข้าชุดนี้

ดู [การเชื่อมโยงและขอบเขตการทดสอบ](thai-skill-connections.md) ผล model-side ของการดัดแปลงนี้ยัง not-yet-run ไม่ใช่หลักฐานความแม่นยำกับเอกสารจริง

## ที่ตัดสินใจไม่นำมาใช้ (แหล่งอื่น)

| ต้นทาง | เหตุผล |
| --- | --- |
| anthropics/skills `docx`, `pdf`, `pptx`, `xlsx` | License "All rights reserved" (source-available) คัดลอกเข้า repository Public ไม่ได้ |
| anthropics/skills `internal-comms`, `brand-guidelines` | ซ้ำกับ `step-writing`, `executive-status-update` และ `step-brand` ที่มีอยู่ |
| mattpocock/skills `grill-me`, `grilling` | ซ้ำกับ `assumption-challenger` |
| claude-code-templates ทั้งชุด (ติดตั้งด้วย CLI) | ราว 600 Skill กับ hook และ MCP ที่รันโค้ดบนเครื่อง ส่วนใหญ่เป็นงาน dev และการตลาดออนไลน์ license ปนกันตามแหล่งที่รวบรวม ใช้วิธีเลือกทีละตัวแทน |
| claude-code-templates `qms-audit-expert`, `capa-officer`, `risk-management-specialist` | เขียนสำหรับ ISO 13485/FDA (เครื่องมือแพทย์) ไม่ใช่ ISO 9001 ของ STeP |
| claude-code-templates `humanizer` | เนื้อหาอิงบทความ Wikipedia (CC BY-SA) ใช้ `avoid-ai-writing` ที่เป็น MIT แทน |
| Skill สายพัฒนาซอฟต์แวร์ เช่น `tdd`, `code-review`, `systematic-debugging` | ไม่ใช่งานของพนักงาน STeP ส่วนผู้พัฒนา Harness ใช้จาก Claude Code ได้โดยตรง |

## ข้อความ license

MIT License กำหนดให้แนบประกาศลิขสิทธิ์เมื่อคัดลอกส่วนสำคัญของซอฟต์แวร์ ไฟล์ใน repository นี้ไม่ได้คัดลอกข้อความต้นฉบับ แต่บันทึกที่มาไว้ที่นี่และท้ายไฟล์ที่ดัดแปลง เพื่อให้ตรวจย้อนได้
Apache License 2.0 ให้ใช้และดัดแปลงได้โดยระบุที่มาและบอกว่ามีการเปลี่ยนแปลง ตารางด้านบนทำหน้าที่นั้น

## Office / tool usability — 6 ตุลาคม 2569

- [SerpApi agent-usability-test](https://github.com/serpapi/skills/blob/master/skills/agent-usability-test/SKILL.md), MIT: WITH/WITHOUT tools, isolated sessions, counterbalanced order และ interface failure modes; protocol/scorer/fixtures เขียนใหม่ใน STeP ไม่คัดลอก Skill
- [MiniMax minimax-xlsx](https://github.com/MiniMax-AI/skills/blob/main/skills/minimax-xlsx/SKILL.md), MIT: เลือกแก้ XML เฉพาะเซลล์เพื่อเก็บ package parts และแยก formula/cache validation; implementation เขียนใหม่ด้วย JSZip/xmldom/ExcelJS ไม่มี claim zero format loss
- [MiniMax pptx-generator](https://github.com/MiniMax-AI/skills/blob/main/skills/pptx-generator/SKILL.md), MIT: native editable PPTX และ visual QA; ใช้ public PptxGenJS API กับ fonts/limits/fixtures ของ STeP ไม่มีการคัดลอก template/code
- [Anthropic doc-coauthoring](https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring), Apache-2.0: context → section refinement → reader evidence; ขยาย skills เดิม ไม่ติดตั้ง Skill ใหม่ และไม่ถือ author-review เป็น independent reader
- [Google Workspace CLI/gws-shared](https://github.com/googleworkspace/cli/blob/main/skills/gws-shared/SKILL.md), CLI repository Apache-2.0: อ้าง syntax CLI เป็น optional connector แยก ไม่คัดลอก Skill ไม่ auto-auth หรือแชร์ไฟล์

อ้างเอกสารไลบรารีสำหรับ implementation: [ExcelJS](https://github.com/exceljs/exceljs), [PptxGenJS](https://gitbrent.github.io/PptxGenJS/), [JSZip](https://stuk.github.io/jszip/), [xmldom](https://github.com/xmldom/xmldom). ไม่มี Anthropic proprietary docx/pdf/pptx/xlsx materials ใน implementation นี้

ดู [Office workflow limits](office-workflows.md), [tool usability protocol](tool-usability-eval.md), [coauthoring](document-coauthoring.md) และ [Google connector](google-workspace-connector.md). Routing/contract tests ไม่ใช่หลักฐาน model usefulness, live Workspace หรือความถูกต้องกับเอกสารจริง
