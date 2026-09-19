# STeP Skill Contract

ใช้เป็น checklist ตอนสร้างหรือ review Skill ไม่จำเป็นต้องยัดทุกหัวข้อลง SKILL.md หากไม่มีประโยชน์ต่อ runtime

## Required design decisions

| Contract | คำถาม |
|---|---|
| Trigger | คำขอแบบใดควรเลือก Skill นี้ |
| Anti-trigger | งานแบบใดดูคล้ายกันแต่ต้องไม่เลือก |
| Inputs | ข้อมูลขั้นต่ำอะไรที่ต้องมี |
| Method | ขั้นตอนใดทำซ้ำได้และสร้างความสม่ำเสมอ |
| Output | รูปแบบผลลัพธ์ขั้นต่ำคืออะไร |
| Source | Facts/Rules มาจาก source ไหนและ current แค่ไหน |
| Authority | การตัดสินใดต้องคืนให้มนุษย์ |
| Handoff | เมื่อจบ/เกินขอบเขต ส่งต่ออะไร |
| Tool | งานใดต้องใช้ Tool/Action จริง |
| Eval | จะพิสูจน์ว่า Skill ดีกว่า baseline อย่างไร |
| Context | เนื้อหาใดควรอยู่ Core vs reference/script/template |
| Lifecycle | draft / pilot / approved / deprecated |

## Minimum eval set

1. **Positive** — คำขอที่ควร route เข้า Skill และ output หลักต้องครบ
2. **Anti-trigger** — คำขอที่ไม่ควรใช้ Skill นี้
3. **Collision** — คำขอที่ชนกับ Skill ใกล้เคียงและ Router ต้องเลือกถูก
4. **Missing-source** — เมื่อข้อมูล/กฎที่ต้องใช้ไม่มี ต้องเปิดเผย gap ไม่แต่งคำตอบ

เพิ่ม authority/privacy/action cases เมื่อเกี่ยวข้อง

## Promotion rule

`draft → pilot` ต้องมี:
- registry + router integrity
- dependency check
- positive/negative/collision eval อย่างน้อย
- source/authority mapping
- ไม่มี known critical safety issue

`pilot → approved` ต้องมี evidence จาก usage/owner review ตาม governance ของ Skill นั้น

## Progressive disclosure

Core SKILL.md ควรอ่านง่ายและมีเฉพาะสิ่งที่ใช้บ่อย รายละเอียดที่ยาวให้แยก:
- references/
- scripts/
- templates/
- assets/

ทุก local dependency ที่อ้างจาก SKILL.md ต้องมีไฟล์จริงและถูกแจกไปกับ package
