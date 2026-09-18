# AFP Demo Run Sheet — Meeting Ready

> ใช้เล่น Demo 15–20 นาที กับหัวหน้า AFP
>
> Mock data เท่านั้น ห้ามตีความว่าเป็น transaction จริงหรือคำวินิจฉัยของ AFP

## Before demo

เปิดเอกสารประกอบ:
1. `docs/afp-demo-source-register.md`
2. `docs/afp-demo-concepts.md`

อธิบายก่อนเริ่ม:

> "Demo นี้ใช้ source สาธารณะที่ STeP/CMU อ้างอิงได้ก่อน ส่วนกฎภายใน AFP ที่ยังไม่ได้รับ จะถูก mark ว่า pending และ AI จะไม่เดา"

---

## Demo 1 — Receipt / Finance Pre-check

### Prompt

```text
ช่วยตรวจชุดเอกสารนี้ก่อนส่ง AFP ว่าพร้อมหรือยัง
อย่าตัดสินว่าเบิกได้ ถ้ายังไม่มี source รองรับ
```

### Mock facts

```text
Project: Innovation Event Demo
Amount: 2,450 THB
Payment evidence: attached
Activity approval: attached
Expense category: user did not specify
Date on payment evidence: within project month
```

### Expected screen/result

```text
STATUS: NEEDS_INFORMATION

✓ Amount consistent
✓ Approval evidence present
? Transaction type not confirmed
? AFP-specific required-document checklist not yet loaded

SOURCE
AFP-SRC-014 — CMU Finance payment review principles
AFP-SRC-015 — CMU Finance form registry

SOURCE STATUS
PENDING_AFP_CONFIRMATION

NEXT ACTION
Confirm expense/transaction category before final document checklist.

HUMAN AUTHORITY
AFP
```

### Ask AFP live

> "ถ้าเป็นเคสจริง AFP จะถามอะไรเพิ่มเป็นอันดับแรก?"

จดคำตอบเป็น candidate rule/checklist

---

## Demo 2 — TOR Pre-check

### Prompt

```text
ช่วยตรวจ TOR งานจ้างออกแบบและติดตั้งบูธนี้ก่อนส่ง AFP
แยกสิ่งที่เป็น rule, สิ่งที่เป็น risk และสิ่งที่ต้องให้คนใช้ดุลพินิจ
```

### Mock TOR excerpt

```text
งาน: ออกแบบและติดตั้ง Event Booth
Deliverable: Booth พร้อมใช้งาน
คุณภาพงาน: "สวยงาม ทันสมัย Premium"
วัสดุหลัก: ต้องใช้ระบบ/ผลิตภัณฑ์ Brand X
ส่งมอบ: ก่อนวันงาน
Acceptance: "เป็นที่พึงพอใจของผู้ว่าจ้าง"
```

### Expected screen/result

```text
STATUS: NEEDS_CORRECTION + HUMAN_JUDGMENT_REQUIRED

ISSUE A — Acceptance not measurable
"เป็นที่พึงพอใจของผู้ว่าจ้าง"

ISSUE B — Deliverable lacks objective inspection criteria

ISSUE C — Brand-specific wording
ต้องตรวจเหตุจำเป็นและกฎหมาย/เงื่อนไขที่รองรับ

SOURCE
STeP OIT procurement references
Procurement Act 2560 — section 8/9 principles
Ministry procurement regulation 2560

AI ACTION
Suggest clearer measurable wording.

AI MUST NOT
Approve TOR
Decide that brand wording is legally acceptable
Select a vendor
```

### Ask AFP live

> "จุดไหน AFP จะให้แก้ทันที และจุดไหนต้องดูบริบทก่อน?"

คำตอบจะแยก Rule vs Judgment

---

## Demo 3 — Required Document Navigator

### Prompt

```text
ผมจะจ้างทำสื่อสำหรับงาน Event ต้องเตรียมเอกสารอะไรส่ง AFP บ้าง
ถ้ายังไม่มี checklist ของ AFP ให้บอกตรง ๆ ว่าขาดอะไร
```

### Expected screen/result

```text
TRANSACTION: Event media service procurement

KNOWN SOURCE SET
✓ STeP procurement references
✓ CMU central procurement registry
✓ CMU finance forms registry

PENDING
AFP internal transaction checklist

PROVISIONAL STRUCTURE
[ ] Approval/request evidence
[ ] TOR/scope if applicable
[ ] Procurement evidence
[ ] Delivery/acceptance evidence
[ ] Payment evidence
[ ] Transaction-specific forms

STATUS: NEEDS_AFP_CONFIRMATION
```

### Ask AFP live

ให้หัวหน้า AFP แก้ checklist บนจอ:

```text
Required
Conditional
Not Required
Depends on amount
Depends on fund source
Depends on transaction
```

นี่คือข้อมูล Foundation ที่มีค่าที่สุดจาก Demo

---

## Demo 4 — Explain My Return

### Prompt

```text
ครั้งก่อนเคสคล้ายกันผ่าน แต่ครั้งนี้ AFP ตีกลับ
ช่วยเปรียบเทียบโดยไม่เข้าข้างฝ่ายไหน
บอกว่าต่างกันตรงไหน และอะไรยังต้องให้ AFP ตัดสิน
```

### Mock Case A

```text
Amount: 8,000 THB
Activity approval: before transaction
Payment evidence: complete
Return note: none
Outcome: processed
```

### Mock Case B

```text
Amount: 8,000 THB
Activity approval: attached but approval date unclear
Payment evidence: complete
Return note: "ตรวจสอบเอกสารอนุมัติ"
Outcome: returned
```

### Expected screen/result

```text
STATUS: HUMAN_JUDGMENT_REQUIRED

SIMILAR
- same amount
- similar expense context

MATERIAL DIFFERENCE FOUND
- Case A shows approval timing clearly
- Case B approval timing is unclear from evidence supplied

PRECEDENT
Case A is historical evidence, not a rule.

SOURCE
CMU Finance review principle: check material correctness and supporting evidence

CONCLUSION
Current data is insufficient to conclude AFP treated the cases inconsistently.

NEXT ACTION
Confirm applicable approval rule and timing requirement with AFP.
```

### Ask AFP live

> "ถ้า facts เหมือนกันจริง 100% แต่ผลต่างกัน AFP อยากให้ AI flag อย่างไร?"

Proposed flag:

```text
POTENTIAL_INCONSISTENCY_REVIEW
→ Send to AFP lead
→ Never auto-overrule prior/current decision
```

---

# Capture during meeting

จดทุก correction ของ AFP ในตารางนี้:

| Demo | AFP correction | Type | Source available? | Next step |
| --- | --- | --- | --- | --- |
| Receipt | | RULE / EVIDENCE / JUDGMENT | yes/no | |
| TOR | | RULE / EVIDENCE / JUDGMENT | yes/no | |
| Checklist | | REQUIREMENT | yes/no | |
| Conflict | | PRECEDENT / JUDGMENT | yes/no | |

## Definition of a successful demo

หลังประชุมควรได้อย่างน้อย:
- 3–5 source ที่ AFP ยืนยัน
- 5 return reasons
- 3 judgment boundaries
- 1 TOR checklist direction
- 1 finance/receipt checklist direction
- 3 transaction categories ที่ควร pilot
- 1 authority/escalation correction

ไม่ต้องพยายามทำให้ Demo ตอบได้ทุกเคสในวันแรก
