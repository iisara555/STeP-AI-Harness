---
name: market-signal-radar
description: สแกนสัญญาณตลาดและบทสนทนาล่าสุดจากหลายแหล่ง แยก Trend, Anecdote, Competitor Signal และ Evidence เพื่อช่วย MI/PITI/ISI ตัดสินใจว่าจะตรวจอะไรต่อ
standardVersion: 2
---

# STeP Market Signal Radar

## Purpose

ช่วย MI, PITI, ISI, EIC, Tech Spin, LINC และทีมที่ต้องเข้าใจว่า "ตอนนี้ตลาดกำลังพูดอะไร" โดยเน้น **สัญญาณล่าสุด คุณภาพของแหล่ง และความไม่แน่นอน** ไม่ใช่สรุปเทรนด์จากความจำของโมเดล

หลักสำคัญ: **Recent does not mean representative. Popular does not mean proven.**

## เมื่อควรใช้

- ต้องการดู trend ล่าสุดก่อนทำ campaign, positioning หรือ product test
- อยากรู้ว่าลูกค้าหรือชุมชนออนไลน์พูดถึงปัญหาอะไร
- ต้องการ competitor หรือ category signal ก่อนสัมภาษณ์ตลาด
- ต้องการหลักฐานว่าแนวคิดหนึ่งมีคนสนใจจริงหรือไม่

**Anti-trigger:**
- การวิจัยลูกค้าเชิงลึก → `startup-discovery` หรือ `voice-of-customer`
- การจับคู่ผู้เชี่ยวชาญหรือทรัพยากร → `expert-resource-matching`

## Inputs

ขั้นต่ำ:
- หัวข้อหรือ category ที่ต้องการสแกน
- decision ที่ research ต้องช่วยสนับสนุน

ช่วยให้ผลตรงขึ้นถ้ามี:
- ช่วงเวลาที่สนใจ
- baseline หรือผลการสแกนครั้งก่อน

## Source

ใช้ข้อมูลปัจจุบันเมื่อมี web หรือ search tools และ **ระบุช่วงเวลาเสมอ**

**Source tiers:**

1. **Primary / First-party** — เว็บไซต์บริษัท เอกสารทางการ product page changelog
2. **Research / Reputable reporting** — งานวิจัย สมาคมอุตสาหกรรม สื่อที่มีมาตรฐาน
3. **Community / User conversation** — forum, review, social, comment
4. **Search / Aggregator signal** — ใช้ค้นหา lead แต่ไม่ควรเป็น evidence หลักเพียงตัวเดียว

ถ้า host ไม่มี web access ให้บอกชัดว่า `ยังไม่ได้ตรวจข้อมูลปัจจุบัน` แล้วสร้าง research plan แทน

## Workflow

จัดทุกสิ่งที่พบเป็น **Signal Types**: Demand signal (คนกำลังหา ขอ หรือบ่นเรื่องอะไร), Behavior signal (คนทำอะไรจริง ไม่ใช่แค่พูด), Competitor signal (คู่แข่งเปิดตัว เปลี่ยนราคา messaging หรือ feature), Technology signal (capability ใหม่ที่อาจเปลี่ยน feasibility), Policy/ecosystem signal (กฎ มาตรฐาน ทุน partner หรือ infrastructure ที่เปลี่ยนบริบท)

1. **Define the question** — อย่าค้นคำว่า trend กว้าง ๆ ให้ระบุ decision ที่ research ต้องช่วย
2. **Set timeframe** — ใช้ช่วงเวลาที่เหมาะ เช่น 30 วัน 90 วัน หรือ 12 เดือน และบอกเหตุผล
3. **Gather mixed evidence** — อย่าใช้ source type เดียวเพื่อสรุปทั้งตลาด
4. **Separate Signal from Noise** — **Strong** (หลายแหล่งอิสระ พร้อมพฤติกรรมหรือข้อมูลจริงรองรับ), **Moderate** (มี pattern ซ้ำแต่ sample จำกัด), **Weak** (anecdote, post เดียว, marketing claim หรือกระแสสั้น)
5. **What changed** — ระบุสิ่งใหม่เทียบกับ baseline ถ้าหาได้ ไม่เพียงสรุปสิ่งที่มีอยู่
6. **Actionable next check** — ทุก signal สำคัญต้องจบด้วยสิ่งที่ควร validate ต่อ เช่น interview, pricing test, prototype test หรือ source ที่ต้องหาเพิ่ม

## Output

```markdown
# Market Signal Radar — <หัวข้อ>

**Decision supported:** …
**Time window:** …
**Search date:** …

| Signal | Evidence | Source type | Strength | Why it matters | Next check |
|---|---|---|---|---|---|

## What appears to be changing

## What is still noise / uncertain

## Recommended validation
```

## Authority

AI ช่วยได้: สแกน จัดประเภทสัญญาณ ประเมินความแข็งแรงของหลักฐาน และเสนอสิ่งที่ควรตรวจต่อ

ต้องให้มนุษย์ตัดสิน:
- การตัดสินใจเชิงกลยุทธ์ การลงทุน หรือการเปลี่ยน positioning
- การเผยแพร่ข้อมูลตลาดในนามองค์กร

## Handoff

- การวิจัยลูกค้าเชิงลึก → `startup-discovery` หรือ `voice-of-customer`
- ต้องท้าทายสมมติฐานที่ได้จากสัญญาณ → `assumption-challenger`
- ต้องเสนอผู้บริหารเพื่อตัดสินใจ → `decision-memo`

พร้อมส่งต่อเมื่อ: ทุก signal ระบุ source type ความแข็งแรง และสิ่งที่ต้อง validate ต่อ

## Guardrails

- **ห้ามใช้ post เดียวหรือยอด view เดียวเป็นหลักฐานว่าตลาดต้องการ**
- ห้ามสร้างตัวเลข market size หาก source ไม่รองรับ
- แยก user sentiment ออกจาก actual purchase หรือ adoption behavior
- ระบุวันที่ของข้อมูลล่าสุดเสมอ
- ถ้าใช้ข้อมูลสาธารณะจากบุคคล ให้เคารพ privacy และหลีกเลี่ยงการรวบรวม PII ที่ไม่จำเป็น

## Method note

ได้แรงบันดาลใจจากแนวคิด recent multi-source research ของ `last30days-skill` (MIT) และเขียนใหม่ให้เหมาะกับ market sensing ของ STeP โดยไม่ผูกกับ platform ใด platform หนึ่ง
