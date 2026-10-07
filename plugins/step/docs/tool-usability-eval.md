# Tool usability evaluation

ตรวจ interface ของ Harness ไม่ใช่จัดอันดับความฉลาดของโมเดล ใช้วิธี WITH/WITHOUT tools, isolated sessions และ counterbalanced order จาก SerpApi agent-usability-test; เขียน protocol/scorer ใหม่ ไม่คัดลอก skill ต้นทาง

## Controlled local checks

```sh
npm run desktop:eval:office
npm run eval:tool-usability -- --recordings desktop/release/qa/office/recordings.json
```

สร้างไฟล์ Excel/PPTX สังเคราะห์จริง ตรวจ leading zeros/สูตร/ค่าหลังแก้/ZIP parts/table/chart/notes ด้วย worker เดิม และรัน missing-sheet recovery แบบ scripted รายงาน evidenceKind=controlled-contract และ modelBenefitEstablished=false เสมอ ผลต่างกับ negative control เป็นการตรวจ scorer ไม่ใช่หลักฐานว่า skill ทำให้ AI เก่งขึ้น

## Model-side experiment

```sh
npm run eval:tool-usability -- --plan 42
npm run eval:tool-usability -- --recordings /private/synthetic-model-recordings.json
```

ใช้ prompts ใน evals/tool-usability/office.json และเปิด trial ตาม plan แยก session ใหม่ทุก arm/task; WITHOUT ไม่มี tools/schema/examples ที่รั่วจาก WITH ใช้ model/provider/version/config และ prompt input เดียวกัน ยกเว้น tool availability สลับลำดับเพื่อไม่ให้ arm หนึ่งได้ประโยชน์จาก cache/order

Host บันทึก tool request, tool/result schema, errors, duration และตรวจ artifacts อิสระก่อนใส่ artifactVerified ห้ามใช้ข้อความ "เสร็จแล้ว" ของโมเดลเป็น success ถ้า WITHOUT ตอบโจทย์ข้อมูลได้ ให้ evaluator ตรวจและใส่ verifiedResult แยกจาก answer

Recordings: {suite:"office-tools-v1",synthetic:true,kind:"recorded-model-run",provider,model,recordedAt,seed,trials:[{taskId,arm,sessionId,calls:[{tool,result?,error?}],verifiedResult?}]} รายงานแยก success, discovery, wrong selection, parameter errors และ recovery ผลตอบ malformed/auth/quota ต้องเก็บ code ไม่เก็บ credentials; ผลอ่านเป็น untrusted data

ตัวอย่าง failure modes ที่ต้องทดลองเพิ่มเมื่อ connector พร้อม: ไม่พบ tool, เลือกผิด, copy parameter ผิด, มองข้าม result schema, auth/timeout recovery ห้าม retry งานเขียนโดยไม่ทราบว่าครั้งก่อนมีผลหรือยัง

มีเพียง 5 tasks ในชุดแรก จึงไม่ใช้เป็นตัวเลขรับรองผล production บันทึก samples/model/config และ paired outcomes ก่อนขยาย sample size ห้ามเลือกเฉพาะรอบที่สำเร็จ ห้ามรวม scripted results กับ model runs หรือกับเอกสารจริง

ไม่เรียก provider อัตโนมัติ ไม่เพิ่ม OCR เข้า Router และไม่มี credential/setup side effect รายงานจริงที่อาจมีข้อมูลส่วนบุคคลต้องอยู่นอก repository ตาม repository-data-boundary

## Skill benefit is a separate experiment

การเปรียบเทียบ WITH/WITHOUT tools ด้านบนไม่ใช่ WITH/WITHOUT Skill. สำหรับ Skill ให้คง provider/model/config, prompt สังเคราะห์, source และเครื่องมือเหมือนกันทั้งสอง arm; เพิ่มเฉพาะ Skill และ references ที่จำเป็นใน WITH. ใช้ session ใหม่ที่ไม่รับ memory/history ของอีก arm และสลับลำดับตาม seed. ตรวจ antiTrigger/collision จาก Router แยกจากคุณภาพคำตอบเมื่อบังคับโหลด Skill.

ขอบเขตที่ผู้ใช้อนุมัติวันที่ 2026-10-07: ทุก connection/โมเดลที่พร้อมใช้งาน สูงสุด 3 รอบ; ก่อนเรียกจริงให้บันทึก matrix และจำนวนคำขอรวม (แต่ละคู่ WITH/WITHOUT ใช้สองคำขอตอบ และ model judge ใช้โควตาเพิ่ม). จำกัด retry และ tool turns ในงบเดียวกัน ไม่เรียกบัญชีที่ยังไม่ได้ตั้งค่า และไม่เปลี่ยนโมเดลแทนโดยไม่บันทึก. ใช้ fixtures/outputAssertions ใน `evals/skills/` และตรวจ XLSX/PPTX อิสระ ไม่ใช้คำว่า “สร้างแล้ว” ของโมเดลเป็นหลักฐานไฟล์.

ตัวรัน ChatGPT/Codex OAuth อยู่ใน source แล้ว: `npm run desktop:eval:skill-benefit -- --self-test`, `--list`, `--connection 1 --probe` และ `--connection 1 --live --prior-calls gpt-6-astra=2` สำหรับงบงานรอบนี้ ใช้ model catalog ของบัญชีและสามคู่ Excel/PPTX/decision memo ไม่ใช้ model judge และอ่าน positive prompts จาก evals/skills โดยตรง เครื่องมือเหมือนกันทั้งสอง arm; native CLI tools ปิด; results และ ledger อยู่นอก repo

หลังเปิด network destinations แล้ว OAuth cloud ยังตอบ 401 และ refresh ไม่ผ่าน จึงยังไม่มีผลคุณภาพจากโมเดลจริง ไม่เติม API key แทนการล็อกอิน OAuth ผล live และ coauthoring/receipt cases ที่ยังไม่ได้รันคง `modelSideRun: not-yet-run`; Skill draft ไม่เลื่อนเองจาก unit checks `scripts/skill-eval-compare.mjs` เดิมเป็น old/new Skill พร้อม judge จึงไม่ใช้แทน WITH/WITHOUT Skill

คำสั่ง Windows/macOS, ledger/resume, privacy และความต่างของตัวประเมิน: [Office OAuth evaluation setup](cloud-model-eval-setup.md)
