# STeP Playbooks — Multi-Skill Flow

Playbook ใช้กับคำขอที่มี **หลายผลลัพธ์และหลายขั้นตอน** ซึ่ง Skill เดียวไม่ควรรับผิดชอบทั้งหมด

## หลักการ

```text
Atomic Task
→ Router
→ 1 Skill

Composite Task
→ Router
→ Playbook
→ Skill A
→ handoff context
→ Skill B
→ Tool / Action
```

Playbook **ไม่ใช่ Workflow Engine** และไม่ใช่มิติที่ 7 ของ Organization Model แต่เป็นวิธีประกอบ HOW จาก Skills ที่มีอยู่แล้ว

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

Action ไม่ใช่ Skill เช่น:
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

## หลักการเพิ่ม Playbook ใหม่

เพิ่มเมื่อ:
1. เป็น flow ที่เกิดซ้ำจริง
2. มีอย่างน้อย 2 Skills/Actions ที่ต้อง handoff กัน
3. Skill เดียวไม่ควรรับผิดชอบทั้งหมด
4. มี trigger ที่แยกจาก atomic request ได้
5. มี regression test

อย่าเพิ่ม Playbook เพียงเพราะ “อาจมีประโยชน์ในอนาคต”
