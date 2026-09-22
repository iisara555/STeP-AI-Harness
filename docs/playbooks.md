# STeP Playbooks — Multi-Skill Flow

Development contract: [Action verification](action-verification.md). Action completion ต้องผ่าน `completePlaybookAction` และการอ่านผลกลับ; path/link อย่างเดียวไม่พอ

Playbook ใช้กับคำขอที่มี **หลายผลลัพธ์และหลายขั้นตอน** ซึ่ง Skill เดียวไม่ควรรับผิดชอบทั้งหมด

## หลักการ

```text
Atomic Task
→ Router
→ 1 Skill

Composite Task
→ Router
→ Playbook ก้ำกึ่งกันหรือไม่
   ├─ ก้ำกึ่ง → CLARIFY + clarification.options (ยังไม่เลือก Playbook และยังไม่โหลด step)
   └─ ชัด ↓
→ Playbook
→ Skill A
→ handoff context
→ Skill B
→ Tool / Action
```

Playbook **ไม่ใช่ Workflow Engine** และไม่ใช่มิติที่ 7 ของ Organization Model แต่เป็นวิธีประกอบ HOW จาก Skills ที่มีอยู่แล้ว

Scope Guard และ Authority Preflight ทำงานก่อนการถามแยก Playbook เสมอ งานที่เป็น human-only ต้องหยุดตั้งแต่ก่อนเลือก flow ไม่ใช่ไปหยุดกลางขั้นตอน

## Loading Budget

- Atomic: โหลด Domain Skill เดียวเหมือนเดิม
- Composite: โหลด `manifest/playbooks.yaml` เพื่อเลือก flow
- ใน Playbook ให้โหลด **ทีละ Skill ตาม current step**
- เมื่อจบ step ให้ส่งเฉพาะ structured handoff ที่จำเป็นไปขั้นถัดไป
- ห้ามโหลด Skills ทุกตัวของ Playbook พร้อมกัน
- Templates/examples ยังเป็น L3 และโหลดเมื่อจำเป็นเท่านั้น

## Run State

เมื่อ client แก้ไฟล์ได้ ให้เก็บ state ไว้ที่:

`.step-ai/runs/<run-id>/state.json`

ข้อมูลที่ควรเก็บ:
- Playbook
- original request
- current step
- completed/pending steps
- structured outputs จากแต่ละ step
- missing information
- output files/links

ห้ามเก็บ password/token/credential/PII ที่ไม่จำเป็น

ผู้ใช้จึงสามารถกลับมาพิมพ์ เช่น:

> จาก TOR เมื่อกี้ ปรับ Gantt ให้เร็วขึ้น 2 สัปดาห์

แล้ว AI ใช้ state ของ run เดิมต่อได้เมื่อหา context ได้อย่างมั่นใจ

## Tool / Action

Action ไม่ใช่ Skill และต้องมีรายการกลางใน `manifest/actions.yaml` เพื่อให้ Playbook/validator รู้ capability, risk, confirmation และ tool ที่รองรับ

Action ตัวอย่าง:
- สร้าง/อัปเดต Google Sheet
- สร้างไฟล์ XLSX
- บันทึก output
- เปิด browser เพื่อกรอก draft

ถ้า preferred tool ไม่มี ให้ใช้ fallback ที่ Playbook กำหนด หรือส่งมอบข้อมูลในรูปแบบที่นำไปใช้ต่อได้

Action ที่มีผลจริงยังต้องทำตาม Human Approval / Authority เดิม

## Playbooks ชุดแรก

### TOR → Project Plan
`tor-review → project-plan → spreadsheet-project-plan`

ใช้เมื่อคำขอพูดถึง TOR และอย่างน้อยอีกสองมิติ เช่น กิจกรรม + งบ, timeline, Gantt, Google Sheet

กติกาเฉพาะ:
- หนึ่ง TOR ต่อหนึ่ง Run
- แยก TOR Fact / Planning Assumption
- สร้าง Project Parameters ก่อน Timeline
- งบใช้ Source เท่านั้น ห้ามกระจายวงเงินรวมเอง
- Google Sheet/XLSX ใช้ Project Master Plan + Gantt schema เดียวกัน
- โหลดรายละเอียดมาตรฐานจาก `docs/tor-to-project-plan.md`

### Meeting → Action Plan
`meeting-summary → project-plan → spreadsheet-action-plan`

ใช้เมื่อผู้ใช้ไม่ได้ต้องการเพียงสรุปประชุม แต่ต้องการต่อเป็น action plan/timeline/sheet

### ISO Audit Readiness
เริ่มจาก `iso9001-audit-readiness` และเรียก evidence/document/interview/KPI/CAPA/management-review Skills เฉพาะ signal ที่ผู้ใช้ต้องการ

### Skill → Pilot
`step-skill-authoring → coding-git-workflow → evidence-before-approval`

ใช้เมื่อผู้ใช้ต้องการสร้าง/ปรับ Skill และให้ลง repo หรือเตรียมเข้าสู่ Pilot

หลัก:
- เริ่มด้วย Need Gate ก่อนเสมอ: Skill vs Playbook vs Rule vs Registry vs Action
- implementation step ทำเฉพาะเมื่อคำขอมี signal ให้แก้ repo
- evidence review ทำเฉพาะเมื่อผู้ใช้ต้องการ test/eval/Pilot readiness
- ไม่ auto-promote lifecycle และไม่ merge หากหลักฐานสำคัญไม่ผ่าน
- มาตรฐานอยู่ที่ `docs/skill-authoring-standard.md`

### Agenda → Run of Show
`document-review → event-run-of-show → spreadsheet-run-of-show`

ใช้เมื่อผู้ใช้มีกำหนดการหรือ sequence เดิม แล้วต้องการคิวเวทีระดับนาที พร้อม lane จอ เสียง แสง และผู้รับผิดชอบรายคิว

กติกาเฉพาะ:
- หนึ่งงานต่อหนึ่ง Run งานหลายวันแยกด้วยคอลัมน์ Day ได้
- แยก Source Fact ออกจาก Planning Assumption และเวลาที่ต้นทางระบุห้ามแก้เงียบ ๆ
- ทุกคิวต้องมี Lead หนึ่งคน lane ที่ไม่มีข้อมูลให้ลบออกจากตาราง
- รหัส Scene หรือ Format เป็นข้อตกลงกับทีม AV ต้องยืนยันก่อนใช้
- ห้ามเขียนเบอร์โทร ทะเบียนรถ หรือข้อมูลการเดินทางของบุคคลลงในชีต
- โหลดรายละเอียดมาตรฐานจาก `docs/event-run-of-show.md`

## หลักการเพิ่ม Playbook ใหม่

เพิ่มเมื่อ:
1. เป็น flow ที่เกิดซ้ำจริง
2. มีอย่างน้อย 2 Skills/Actions ที่ต้อง handoff กัน
3. Skill เดียวไม่ควรรับผิดชอบทั้งหมด
4. มี trigger ที่แยกจาก atomic request ได้
5. มี regression test

อย่าเพิ่ม Playbook เพียงเพราะ “อาจมีประโยชน์ในอนาคต”


## Action Completion Contract

Tool Action ต่างจาก Skill เพราะต้องเกิดผลลัพธ์จริงในระบบภายนอกหรือไฟล์

กติกา:
1. Action step อาจกำหนด `preferredTool`, `fallback`, `actionSpecPath` และ `completionCriteria`
2. ถ้ามี preferred tool ให้ใช้ก่อน
3. ถ้าไม่มี preferred tool และมี fallback ให้ใช้ fallback โดยไม่ย้อนทำ Skill steps
4. ถ้าไม่มีทั้งคู่ ให้สถานะ run เป็น `waiting-tool`
5. ห้าม mark `completed` จนกว่าจะมี output reference/path/link ตาม action spec

สำหรับ TOR → Project Plan ดู `docs/spreadsheet-project-plan.md`


## Source / Provenance และ Run Feedback

ตั้งแต่ Lightweight Harness Foundation:
- ข้อเท็จจริง/สมมติฐานที่สำคัญสามารถติด label ตาม `manifest/provenance.yaml`
- Run State v3 เก็บ `context.provenance`, `events` และ `feedback`
- Event log เก็บเฉพาะเหตุการณ์สำคัญ ไม่ใช่ transcript ทั้งหมด
- ห้ามเก็บ password/token/cookie/MFA หรือ PII ที่ไม่จำเป็น

รายละเอียดดู `docs/harness-foundation.md`
