# Worked Example — Prompt Spec & Rendered Prompt งาน Technology Hero (Synthetic)

**บริบทคำขอ (สังเคราะห์):** "ขอ prompt ภาพแนว photorealistic technology hero สำหรับประชาสัมพันธ์ศูนย์นวัตกรรมของ STeP บนแบนเนอร์เว็บ 16:9 ขอโทนเรียบหรู ไม่เอาภาพ hologram ลอย และยังไม่มีโลโก้ไฟล์ส่งให้ในภาพ"

---

## Prompt Spec (Source of Truth)

```text
SUBJECT: An engineer examining a metallic circular prototype beside an optical measuring device on a matte worktable
ACTION: Adjusting precision calipers carefully with steady hands
SETTING: Quiet clean prototyping laboratory with shallow depth of field and uncluttered equipment wall
SHOT: Medium wide shot from eye-level three-quarter angle
PLACEMENT: Subject positioned on the right two-thirds of the frame
TEXT_SPACE: Clean uncluttered dark matte background spanning the left third for headline layout outside the generated image
RATIO: 16:9
LIGHT: Soft directional natural daylight from upper left casting crisp micro-highlights on brushed metal
MEDIUM: Editorial documentary photograph, 50mm lens, f/2.8
STYLE: Calm, authoritative, grounded engineering aesthetics without sci-fi clichés
PALETTE: Deep charcoal slate foundation, warm off-white highlights, single warm amber indicator accent
MUST_KEEP: Realistic human hand proportions and calm workshop environment
CHANGE_ONLY: N/A (new generation)
EXCLUDE: Thai text, letters, typography, captions, signage lettering, logos, watermarks, brand marks, floating holograms, HUD graphics, distorted hands, extra fingers, extra limbs
```

---

## Rendered Prompt
`Renderer: A · Ratio: 16:9` (สมมติฐานเบื้องต้นใช้ Family A — Natural-language เนื่องจากยังไม่ระบุชื่อเครื่องมือปลายทาง; หากใช้เครื่องมือสาย Family B สามารถ render จาก Spec นี้ใหม่ได้ทันทีโดยส่ง ratio handoff `1344 × 768` แยก)

> Editorial documentary medium wide photograph from a three-quarter angle showing an engineer carefully adjusting precision calipers next to a brushed metal prototype and optical measuring gauge on a clean matte lab table. Positioned in the right two-thirds of a 16:9 frame, leaving the entire left third as calm, uncluttered deep charcoal slate background space suitable for external typography. Lit by soft directional natural daylight creating clean highlights on metal surfaces. Grounded modern palette of deep slate grey, warm off-white, and a subtle warm amber light indicator accent on the instrument. High realism, 50mm lens f/2.8, sharp focus on the hands and prototype, completely free of text, letters, logos, watermarks, floating holograms, or UI overlays.

---

## เหตุผลที่ตัวอย่างนี้ตรงมาตรฐาน STeP
- ใช้ **Prompt Spec เป็น source of truth** และเปิดเผย assumption เมื่อยังไม่ทราบเครื่องมือปลายทาง
- เว้น `TEXT_SPACE` จริงในเฟรม, ตั้ง `EXCLUDE` สำหรับข้อความภาษาไทยและ Official Logo (ตาม `references/brand-visual-context.md`), และใช้คำบรรยายสีแทน hex ใน image prompt
- หากภาพนี้ใช้เผยแพร่ควรกำกับป้าย `Concept Image` / `ภาพจำลอง` ไม่แอบอ้างเป็นภาพสถานที่หรือผลทดสอบจริง
