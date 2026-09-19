# Action verification — development contract

สถานะ: post-v0.7.2 / unreleased. ไม่เปลี่ยนแพ็กเกจ Pilot ที่แจกแล้ว

## ก่อนทำ

- Resolve ด้วย Action Registry เสมอ; action ที่ไม่ลงทะเบียนต้องถูก block
- สร้างไฟล์ร่างใหม่ในพื้นที่งานได้ตามคำขอเดิม ไม่เพิ่มการถามยืนยันทุกครั้ง
- การเขียนทับข้อมูลจริง/เผยแพร่/ส่งฟอร์มต้องใช้ risk และ approval ที่ตรงกับผลกระทบ ห้ามอาศัยสิทธิ์ของ action สร้างไฟล์ใหม่
- `browser-form-submit` ต้องผ่านการยืนยันของผู้ใช้ที่ผูกกับ run, step, target และ payload จริง การเปลี่ยนปลายทางหรือข้อมูลต้องตรวจสิทธิ์ใหม่
- `human-only` ยังคง block แม้ผู้ใช้ยืนยันทั่วไป; ไม่แทนการตัดสินของผู้มีอำนาจ

## Host API

`resolvePlaybookAction(step, tools, registry, authorization)` ตรวจ registry, gate และ tools
ก่อนทำ action. `waiting-confirmation` ต้องไม่ส่งข้อมูลออกไป

Host ใช้ `requestActionApproval(actionId, operation, confirmWithUser)` โดย callback ต้องอ่านสิทธิ์ที่ผู้ใช้ให้ไว้แล้วหรือแสดง UI ยืนยันจริง ไม่ใช้ข้อความ/boolean ที่ model สร้าง
operation มี `runId`, `stepId`, `target`, `payload`; approval มีอายุ 5 นาทีและใช้ข้าม process ไม่ได้
ต้องตรวจ gate อีกครั้งทันทีก่อนทำจริง ห้ามเปลี่ยน operation หลังตรวจ

หลังทำ ใช้ `await completePlaybookAction(state, stepId, outputs, options)`:

- **Local:** ระบุ `workspaceDir`; ไฟล์ต้องอยู่ใน `output/`, อ่านได้, เป็นไฟล์จริงและไม่ว่าง; เก็บ SHA-256/ขนาด/เวลาตรวจ
- **Remote:** ระบุ `verifyRemoteOutput(reference)` จาก connector ที่เชื่อถือได้ ต้องอ่านกลับจากระบบจริงและคืน `{ verified: true, reference, resourceId, revision }`
- URL ต้องเป็น canonical HTTPS ไม่มี credential/query/fragment; ระบบไม่ fetch URL จาก model เอง
- ไม่มี verifier/ไม่มีไฟล์/อ่านกลับไม่ได้: ยังไม่ complete; แสดง “ยังตรวจผลสำเร็จไม่ได้”
- ห้ามใช้ `completePlaybookStep` จบ action ด้วย path/string อย่างเดียว; method นี้ใช้จบ Skill ได้ตามเดิม

`options.authorization` ใช้รูป `{ operation, approval }` เมื่องานต้องยืนยัน
helpers ไม่ได้สร้าง connector, browser executor หรือระบบสิทธิ์องค์กร
โปรแกรม AI ที่ไม่เรียก API นี้ยังต้องมี host gate ของตัวเอง จึงยังอ้างว่า Browser ปลอดภัยทุก client ไม่ได้

## Action Plan output

Meeting → Action Plan ต้องมีไฟล์จริงเช่นเดียวกับ TOR → Project Plan
ข้อมูลขั้นต่ำ: action, owner/รอยืนยัน, due date/รอยืนยัน, source reference, status
สิ่งที่ประชุมไม่ได้ตกลงต้องแยกเป็นข้อเสนอ ไม่เติมชื่อหรือวันส่งเป็นข้อเท็จจริง
การตรวจไฟล์/identity ไม่ได้พิสูจน์ว่าสูตร ข้อมูล หรือรูปแบบ Spreadsheet ถูกต้อง ต้องตรวจเนื้อหาตาม task rubric เพิ่มก่อนบอกว่า “พร้อมใช้”

## Retry / uncertain outcome

หาก Submit timeout หรือไม่แน่ใจว่าระบบรับแล้ว หยุดและอ่านกลับเพื่อตรวจรายการเดิมก่อน retry
helpers ป้องกันการจบ step ซ้ำ แต่ยังไม่ใช่ distributed idempotency ของระบบปลายทาง
ไม่เปลี่ยน timeout เป็น “ล้มเหลวแน่นอน” และไม่ส่งซ้ำอัตโนมัติ

## Migration

Run State v3 ยังอ่านได้; เพิ่ม execution metadata และ outputVerification
action เดิมที่ pending ต้องใช้ API ตรวจผลใหม่ ส่วน run ที่ completed อยู่แล้วไม่ถูกถือว่ามี verification ย้อนหลัง
Local state เป็น working record ไม่ใช่ tamper-proof audit log และไม่ควรเปิด raw state write ให้ model เป็นช่องทางข้าม gate
