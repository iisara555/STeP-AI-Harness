# Syntax Family Quick Reference — Prompt Spec Rendering

แนวทางย่อสำหรับการ render `Prompt Spec` ไปเป็นคำสั่งเฉพาะของ Family A/B/C/D โดยยึดกฎใน `references/prompt-spec.md` และ `references/model-families.md`

---

## Family A — Natural-language
- เขียนเป็นย่อหน้าภาษาธรรมชาติที่อ่านลื่น เรียงลำดับจาก Subject & Action → Setting & Shot → Lighting & Composition → Style & Palette (คำบรรยายสี) → Text Space & Constraints
- ไม่ใส่ weight/tag เชิงเทคนิคหรือ `--ar` flag; หากระบบรองรับ parameter ใน UI แยก ให้แนะนำตั้ง Ratio ผ่าน UI

## Family B — Tag + weight
- แยกออกเป็น **Positive** และ **Negative** ชัดเจน
- ส่งค่า **Ratio handoff / width × height** แยกต่างหาก (ดูตารางขนาดแนะนำใน `references/prompt-spec.md` เช่น `1344 × 768` สำหรับ 16:9)
- ใส่ baseline Negative สำหรับ `text, letters, typography, captions, signage lettering`, `logos, watermarks, brand marks`, และ `distorted hands, extra fingers, extra limbs`

## Family C — Parameter-flag
- จัดข้อความ Subject/Scene ก่อน แล้วต่อท้ายด้วย parameter flags (เช่น `--ar`, `--style`) ตามเอกสารปลายทางที่ยืนยันแล้ว

## Family D — Edit / inpaint
- ใช้ได้เฉพาะเมื่อ **เครื่องมือปลายทางรับ image input ได้จริง** (ห้ามทำเหมือนระบบเห็นภาพที่ไม่ได้รับมา)
- เริ่มคำสั่งด้วย **MUST_KEEP** (องค์ประกอบเดิมที่ห้ามเปลี่ยน) ตามด้วย **CHANGE_ONLY** (จุดที่ต้องการปรับ) และ **EXCLUDE** เพื่อคุมความเพี้ยน
- ไม่รับรอง `preserve 100%` หากเครื่องมือปลายทางรับประกันความเที่ยงตรงระดับพิกเซลไม่ได้
