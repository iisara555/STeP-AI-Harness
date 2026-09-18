# AFP Demo Concepts — 4 Use Cases

> Audience: หัวหน้า AFP และพนักงาน STeP
>
> เป้าหมายของ Demo: แสดงว่า STeP AI Harness ช่วยลดงานตีกลับและ conflict ได้โดยใช้ source เดียวกัน แต่ไม่แทนดุลพินิจหรืออำนาจอนุมัติของ AFP

## Demo UX กลาง

ทุก Use Case ใช้ output contract เดียวกัน:

```text
AFP PRE-CHECK

STATUS
READY / NEEDS_CORRECTION / NEEDS_INFORMATION /
HUMAN_JUDGMENT_REQUIRED / NOT_PERMITTED_BY_SOURCE

FACTS
ข้อมูลที่ตรวจพบจากเอกสารหรือผู้ใช้

CHECKS
สิ่งที่ตรวจตาม source

SOURCE
รหัส source + ชื่อเอกสาร/กฎ

SOURCE STATUS
DIRECT_STEP_REFERENCE / CMU_CENTRAL / NATIONAL_LAW /
PENDING_AFP_CONFIRMATION

ISSUES
ข้อที่พบ

NEXT ACTION
พนักงานต้องทำอะไรต่อ

HUMAN AUTHORITY
ใครต้องตัดสิน/อนุมัติขั้นสุดท้าย
```

---

# Use Case 1 — Receipt / Finance Document Pre-check

## User story

พนักงานพิมพ์:

> "ช่วยตรวจใบเสร็จและเอกสารชุดนี้ก่อนส่ง AFP ว่าพร้อมหรือยัง"

## Demo input

ใช้ชุดเอกสารตัวอย่างที่ไม่มีข้อมูลส่วนบุคคลจริง:
- ใบเสร็จ/ใบกำกับหรือหลักฐานจ่าย 1 ฉบับ
- หนังสือ/หลักฐานอนุมัติกิจกรรม
- ข้อมูลงบ/โครงการ
- เอกสารประกอบตาม transaction ที่เลือกสำหรับ Demo

## Harness flow

```text
Document intake
    ↓
Identify transaction type
    ↓
Extract facts
amount / date / payee / project / approval / evidence
    ↓
Resolve applicable sources
    ↓
Rule-based checks
    ↓
Evidence completeness
    ↓
Judgment boundary
    ↓
AFP PRE-CHECK
```

## Demo checks

เริ่มจาก principle ที่กองคลัง มช. ระบุว่าการเบิกจ่ายต้องตรวจความถูกต้องในสาระสำคัญของเอกสาร ปีงบประมาณ หลักฐานใบสำคัญ และจำนวนเงินตามกฎหมาย/ประกาศ/ข้อบังคับ/ระเบียบที่เกี่ยวข้อง

AI ตรวจได้:
- Document identity
- Amount consistency
- Date consistency
- Project/activity reference
- Approval evidence present?
- Required supporting evidence present?
- Obvious mismatch across attached documents
- Electronic signature/form validity เฉพาะเมื่อ source รองรับ

AI ห้าม:
- อนุมัติการเบิก
- สรุป eligibility ของรายการที่ไม่มี source รองรับ
- ใช้แนวปฏิบัติของคณะอื่นเป็นกฎของ STeP

## Demo output example

```text
STATUS: NEEDS_INFORMATION

FACTS
- Amount: 2,450 THB
- Activity approval: attached
- Payment evidence: attached
- Transaction type: ยังระบุไม่ชัด

CHECKS
✓ ยอดเงินในเอกสาร 2 ฉบับตรงกัน
✓ มีหลักฐานอนุมัติกิจกรรม
? ยังไม่สามารถเลือก required-document checklist ได้
  เพราะยังไม่ทราบประเภทค่าใช้จ่ายที่ AFP ใช้จัดหมวด

SOURCE
AFP-SRC-014 — CMU Finance: payment review principles
AFP-SRC-015 — CMU Finance form registry

SOURCE STATUS
CMU_CENTRAL / PENDING_AFP_CONFIRMATION

NEXT ACTION
ระบุประเภทค่าใช้จ่าย หรือให้ AFP confirm transaction taxonomy

HUMAN AUTHORITY
AFP ตรวจและอนุมัติตาม authority จริง
```

## What this demonstrates

- AI ไม่พูดว่า "เบิกได้" เพียงเพราะเห็นใบเสร็จ
- AI ชี้ว่าขาด source/data อะไรก่อนส่ง
- ลดรอบตีกลับโดยให้พนักงานแก้ก่อน

---

# Use Case 2 — TOR Pre-check

## User story

> "ช่วยตรวจ TOR นี้ก่อนส่ง AFP ว่ามีจุดเสี่ยงอะไร"

## Demo input

ใช้ TOR ตัวอย่างงานจ้างบริการ เช่น:
- งานออกแบบและติดตั้งบูธ
- มี scope
- deliverable
- timeline
- acceptance criteria
- specification
- budget context

ใส่ defect ตั้งใจ 3–4 จุด เช่น:
- Deliverable วัดผลไม่ได้
- Acceptance criteria ไม่ชัด
- ใช้คำที่อาจชี้ไปยัง brand/vendor เฉพาะ
- Timeline ไม่สัมพันธ์กับ deliverable

## Source basis

STeP OIT ระบุ พ.ร.บ.จัดซื้อจัดจ้างฯ 2560 และระเบียบกระทรวงการคลังฯ 2560 เป็นกฎหมายที่เกี่ยวข้องกับงานจัดซื้อจัดจ้าง

Demo ใช้หลัก:
- มาตรา 8: คุ้มค่า โปร่งใส มีประสิทธิภาพ/ประสิทธิผล ตรวจสอบได้
- มาตรา 9: specification ต้องสัมพันธ์กับคุณภาพ เทคนิค วัตถุประสงค์ และต้องไม่เจาะจง brand/vendor โดยไม่มีเหตุรองรับ
- เกณฑ์/authority รายละเอียดอื่นใช้เมื่อ AFP confirm source เพิ่มเติม

## Harness flow

```text
TOR
 ↓
Completeness
 ↓
Scope clarity
 ↓
Deliverable / acceptance
 ↓
Timeline / dependency
 ↓
Specification neutrality
 ↓
Source compliance
 ↓
Judgment gate
 ↓
TOR PRE-CHECK
```

## Demo output example

```text
STATUS: NEEDS_CORRECTION + HUMAN_JUDGMENT_REQUIRED

ISSUE 1 — Acceptance criteria
"ออกแบบให้สวยงามและทันสมัย"

Assessment:
วัดผลการตรวจรับได้ไม่ชัด

Type:
RULE/QUALITY RISK

Recommended action:
เปลี่ยนเป็น acceptance criteria ที่ตรวจได้จาก output จริง

ISSUE 2 — Specification
ระบุอุปกรณ์/ผลิตภัณฑ์ในลักษณะที่อาจชี้ไปยังผู้ขายเฉพาะ

Source:
AFP-SRC-020 — Procurement Act 2560, section 8/9 principles

Assessment:
ต้องตรวจว่ามีเหตุจำเป็นและฐานกฎหมายรองรับหรือไม่

Decision:
HUMAN_JUDGMENT_REQUIRED

HUMAN AUTHORITY
AFP / procurement authority / committee ตามกรณี
```

## What this demonstrates

AI ไม่ให้คะแนนผู้ขายหรือ approve TOR แต่ทำให้ Process Owner เห็นข้อเสี่ยงก่อนส่ง AFP

---

# Use Case 3 — "เคสนี้ต้องเตรียมเอกสารอะไรบ้าง?"

## User story

> "ผมจะจ้างทำสื่อสำหรับงาน Event ต้องเตรียมเอกสารอะไรส่ง AFP บ้าง"

หรือ

> "ผมเดินทางไปจัดงานต่างจังหวัด ต้องใช้เอกสารอะไรบ้าง"

## Core idea

นี่คือ Use Case ที่ต้องการ AFP data มากที่สุด และตั้งใจใช้ Demo เพื่อโชว์ว่า Harness รู้จักคำว่า "ยังไม่ทราบ" ได้

## Harness flow

```text
Natural language request
      ↓
Classify transaction
      ↓
Identify funding/source context
      ↓
Lookup requirement set
      ↓
Required / Conditional / Optional
      ↓
Missing sources?
      ↓
Checklist
```

## Demo output example

```text
TRANSACTION
จ้างทำสื่อสำหรับ Event

KNOWN SOURCES
- STeP procurement work references Procurement Act 2560
- CMU Finance central procurement/form registry available

SOURCE GAP
ยังไม่มี AFP internal checklist ที่ยืนยันรายการเอกสารของ STeP
สำหรับ transaction นี้

DEMO CHECKLIST
[ ] Request / approval evidence
[ ] TOR / scope where applicable
[ ] Procurement documents
[ ] Delivery / acceptance evidence
[ ] Payment evidence
[ ] Other transaction-specific forms

STATUS
NEEDS_AFP_CONFIRMATION

AI will not invent missing required documents.
```

## AFP meeting interaction

ให้หัวหน้า AFP แก้ checklist นี้สด ๆ:
- อะไร Required
- อะไร Conditional
- อะไรไม่ต้องใช้
- transaction ไหนใช้ rule ต่างกัน

ผลการประชุมจะกลายเป็น AFP Source Pack v0.2 ได้ทันที

## What this demonstrates

- AI ช่วย navigation
- ไม่แต่ง checklist ที่ไม่มี source
- เปลี่ยน tacit knowledge ของ AFP ให้เป็น reusable organization knowledge

---

# Use Case 4 — Explain My Return / Conflict Resolver

## User story

พนักงาน:

> "ครั้งก่อนผมทำแบบนี้ผ่าน ทำไมรอบนี้ AFP ตีกลับ?"

นี่คือ Demo หลักสำหรับ pain point เรื่อง conflict

## Input

Case A — historical case ที่เคยผ่าน
Case B — current case ที่ถูกตีกลับ
Return note จาก AFP
Relevant rules

ใช้ข้อมูลจำลองก่อนจน AFP ให้ตัวอย่างจริง

## Harness flow

```text
Case A facts
       ┐
       ├── Compare facts/evidence
Case B facts
       ┘
          ↓
Resolve source/rule
          ↓
Identify material difference
          ↓
Rule vs precedent vs judgment
          ↓
Explain neutrally
```

## Demo output example

```text
STATUS: HUMAN_JUDGMENT_REQUIRED

คำถาม:
"ครั้งก่อนผ่าน ทำไมครั้งนี้ไม่ผ่าน?"

สิ่งที่เหมือนกัน
- Expense category เดียวกัน
- Project type คล้ายกัน

สิ่งที่ต่างกัน
- Case A มี approval evidence ก่อนดำเนินการ
- Case B ยังไม่พบ approval evidence ในชุดเอกสาร
- วันที่/บริบทของ transaction ต่างกัน

SOURCE
AFP-SRC-014 — CMU Finance review principles
AFP internal checklist — NOT YET PROVIDED

PRECEDENT STATUS
Case A = historical reference
ไม่ใช่ rule ที่บังคับว่า Case B ต้องได้ผลเหมือนกัน

CONCLUSION
จาก source ที่มี ยังไม่ควรสรุปว่า AFP พิจารณาไม่สม่ำเสมอ
ต้องให้ AFP ตรวจ material difference และ applicable rule

NEXT ACTION
1. ขอ source/reason code ที่ AFP ใช้ตีกลับ
2. เปรียบเทียบกับ Case A
3. ถ้า rule เดียว facts เดียว แต่ outcome ต่าง จึง flag inconsistency ให้หัวหน้า AFP review
```

## What this demonstrates

Harness ไม่เข้าข้างพนักงานและไม่เข้าข้าง AFP แต่ทำหน้าที่:
- normalize facts
- show source
- explain difference
- identify inconsistent treatment ที่ตรวจสอบได้
- ส่ง judgment กลับให้คน

---

# Demo sequence สำหรับประชุม AFP

แนะนำเวลา 15–20 นาที:

```text
2 min  — Pain point: "ทำไมครั้งก่อนผ่าน?"
3 min  — Source Register / Source hierarchy
3 min  — Receipt Pre-check
4 min  — TOR Pre-check
3 min  — Document Checklist
4 min  — Explain My Return
1 min  — Ask AFP to correct rules/source gaps
```

## คำถามปิด Demo

ถามหัวหน้า AFP เพียง 5 ข้อ:

1. Source ใดที่ควรเป็น Source of Truth ตัวจริงของ AFP?
2. Source ไหนใน Demo ใช้กับ STeP ไม่ได้/ต้องจำกัด scope?
3. TOR checklist จริงของ AFP ต่างจาก Demo ตรงไหน?
4. Transaction ไหนควร Pilot ก่อน?
5. เรื่องอะไรที่ AI ต้องหยุดทันทีและให้ AFP ตัดสิน?

## Success criterion ของ Demo

Demo สำเร็จไม่ใช่เพราะ AI ตอบทุกอย่างได้ แต่เพราะ AFP สามารถชี้ได้ว่า:

```text
"อันนี้คือ source ที่ถูก"
"อันนี้ไม่ใช่"
"อันนี้ AI ตรวจเองได้"
"อันนี้ต้องถาม AFP"
"อันนี้คือเหตุผลที่เราตีกลับบ่อย"
```

ข้อมูลเหล่านี้จะเปลี่ยน Demo Source Pack ไปเป็น AFP Foundation v0.1
