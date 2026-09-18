# AFP Demo Source Register v0.1

> เป้าหมาย: ใช้เป็น Source Pack สำหรับ Demo STeP AI Harness กับทีม AFP ก่อนประชุมยืนยัน Source of Truth จริง
>
> หลักสำคัญ: เอกสารที่พบจากแหล่งสาธารณะไม่ได้ถูกยกระดับเป็นกฎภายใน STeP ทุกกรณีโดยอัตโนมัติ หากยังไม่มีการยืนยันจาก AFP ให้ใช้สถานะ `PENDING_AFP_CONFIRMATION`

## Source hierarchy สำหรับ Demo

```text
A. STeP Direct Source
        ↓
B. CMU Central Rule / Order / Form
        ↓
C. National Law / Ministry Regulation
        ↓
D. AFP Internal Guidance / Checklist
        ↓
E. Prior Case / Example
```

หมายเหตุ:
- ลำดับข้างต้นเป็น retrieval/traceability hierarchy สำหรับ Demo ไม่ใช่การวินิจฉัยลำดับศักดิ์กฎหมาย
- ถ้า source ขัดกัน ให้ AI หยุดที่ `HUMAN_JUDGMENT_REQUIRED` และส่งให้ AFP
- Prior case ไม่ใช่ rule และไม่ทำให้ case ใหม่ต้องได้ผลเหมือนเดิม

## A. STeP Direct Sources

### AFP-SRC-001 — STeP OIT 2026: คู่มือ/แนวทางการปฏิบัติงานของเจ้าหน้าที่
- URL: https://www.step.cmu.ac.th/oit/oit-2026.php
- Publisher: อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่
- Scope found: งานดำเนินการจัดซื้อจัดจ้าง
- Related laws named by STeP:
  1. พระราชบัญญัติการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560
  2. ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560
- Demo status: `DIRECT_STEP_REFERENCE`
- Use: TOR / procurement compliance source routing

### AFP-SRC-002 — STeP OIT 2026: ผลการจัดซื้อจัดจ้าง/สขร.1
- URL: https://www.step.cmu.ac.th/oit/oit-2026.php
- Publisher: STeP CMU
- Demo status: `STEP_OPERATIONAL_RECORD`
- Use: ตัวอย่าง transaction/วิธีจัดซื้อจัดจ้างจริงของ STeP
- Restriction: ใช้เป็น historical evidence ไม่ใช่ normative rule

## B. CMU Central Sources

### AFP-SRC-010 — กองคลัง มช.: Registry ด้านพัสดุ
- URL: https://finance.oou.cmu.ac.th/statute_procurement/
- Publisher: กองคลัง สำนักงานมหาวิทยาลัย มหาวิทยาลัยเชียงใหม่
- Contains:
  - พ.ร.บ.จัดซื้อจัดจ้างฯ 2560
  - ระเบียบกระทรวงการคลังฯ 2560
  - กฎกระทรวงที่เกี่ยวข้อง
  - ระเบียบ มช. ด้านการจัดซื้อจัดจ้างบางประเภท
  - ข้อบังคับการใช้ลายมือชื่ออิเล็กทรอนิกส์
  - คำสั่งมอบอำนาจด้านการจัดซื้อจัดจ้างและการเบิกจ่าย
- Demo status: `CMU_CENTRAL_REGISTRY`
- Applicability: `PENDING_AFP_CONFIRMATION` ต่อ transaction

### AFP-SRC-011 — คำสั่งสำนักงานมหาวิทยาลัย 1996/2567
- Title: มอบอำนาจเกี่ยวกับการจัดซื้อจัดจ้างและการบริหารพัสดุ
- URL: https://finance.oou.cmu.ac.th/statute_procurement/
- Demo status: `CMU_AUTHORITY_SOURCE`
- Use: Authority/escalation demo
- Applicability: `PENDING_AFP_CONFIRMATION`

### AFP-SRC-012 — คำสั่งสำนักงานมหาวิทยาลัย 1997/2567
- Title: มอบอำนาจช่วงให้เบิกจ่ายเงินเกี่ยวกับการจัดซื้อจัดจ้าง
- URL: https://finance.oou.cmu.ac.th/statute_procurement/
- Demo status: `CMU_AUTHORITY_SOURCE`
- Use: Decision authority / payment approval demo
- Applicability: `PENDING_AFP_CONFIRMATION`

### AFP-SRC-013 — ข้อบังคับ มช. ว่าด้วยการใช้ลายมือชื่ออิเล็กทรอนิกส์ พ.ศ. 2565
- URL: https://finance.oou.cmu.ac.th/statute_procurement/
- Demo status: `CMU_CENTRAL_RULE`
- Use: e-document / signature check
- Applicability: `PENDING_AFP_CONFIRMATION`

### AFP-SRC-014 — กองคลัง มช.: บริการรับ/จ่ายเงิน
- URL: https://finance.oou.cmu.ac.th/service_payment_receive/
- Publisher: กองคลัง มช.
- Key operational principle:
  - ตรวจความถูกต้องในสาระสำคัญของเอกสาร
  - ตรวจปีงบประมาณ
  - ตรวจหลักฐานใบสำคัญ
  - ตรวจจำนวนเงิน
  - ตรวจตามกฎหมาย ประกาศ ข้อบังคับ และระเบียบที่เกี่ยวข้อง
- Demo status: `CMU_CENTRAL_OPERATIONAL_GUIDANCE`
- Use: Receipt/finance pre-check model

### AFP-SRC-015 — กองคลัง มช.: แบบฟอร์มงานการเงิน
- URL: https://finance.oou.cmu.ac.th/doc_form/
- Examples found:
  - แบบฟอร์มเดินทาง
  - สัญญายืมเงิน
  - หลักเกณฑ์ค่าใช้จ่ายในการเดินทาง
  - เอกสารการเบิกจ่ายอื่น
- Demo status: `CMU_CENTRAL_FORM_REGISTRY`
- Applicability: `PENDING_AFP_CONFIRMATION`

### AFP-SRC-016 — แนวปฏิบัติ/นโยบายบัญชี มช. 2567
- Public source: กองคลัง มช.
- Includes guidance on เงินยืมทดรองจ่าย and related accounting practice
- Demo status: `CMU_CENTRAL_GUIDANCE`
- Applicability: `PENDING_AFP_CONFIRMATION`

## C. National / Ministry Sources

### AFP-SRC-020 — พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560
- Referenced directly by STeP OIT
- Also listed in CMU Finance procurement registry
- Demo status: `NATIONAL_LAW`

Key Demo principles:
- มาตรา 8: คุ้มค่า / โปร่งใส / มีประสิทธิภาพและประสิทธิผล / ตรวจสอบได้
- มาตรา 9: การกำหนดคุณลักษณะเฉพาะต้องคำนึงถึงคุณภาพ เทคนิค และวัตถุประสงค์ และต้องระวังการกำหนดที่เจาะจงยี่ห้อหรือผู้ขายโดยไม่มีเหตุรองรับตามกฎหมาย

### AFP-SRC-021 — ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560
- Referenced directly by STeP OIT
- Listed in CMU Finance procurement registry
- Demo status: `MINISTRY_REGULATION`

## D. Sources intentionally NOT treated as STeP Source of Truth

คู่มือ/Checklist ของคณะอื่นใน มช. สามารถใช้ศึกษา UX, format หรือหา test idea ได้ แต่ Demo นี้จะไม่อ้างเป็นกฎของ STeP จน AFP ยืนยัน

Examples:
- คู่มือคณะสังคมศาสตร์
- คู่มือคณะเทคนิคการแพทย์
- แนวปฏิบัติคณะเศรษฐศาสตร์

## Current gaps to ask AFP

1. AFP Internal Source of Truth / shared folder / master list
2. TOR checklist ที่ AFP ใช้จริง
3. Receipt/finance checklist ที่ AFP ใช้จริง
4. รายการ transaction type และ required documents
5. Top return reasons
6. Rule vs judgment boundary
7. Current delegation/authority mapping for STeP
8. Exception/escalation rules
9. Current forms/templates used by STeP
10. Known superseded documents

## Demo rule

ทุกผลลัพธ์ต้องแสดง:
- `SOURCE`
- `SOURCE STATUS`
- `RULE / EVIDENCE / JUDGMENT`
- `WHAT IS MISSING`
- `HUMAN AUTHORITY`

ถ้า source ยังไม่ได้ AFP confirm:
```text
Source status: PENDING_AFP_CONFIRMATION
AI may pre-check but must not issue a final compliance/approval decision.
```
