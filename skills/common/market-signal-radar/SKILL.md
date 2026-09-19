---
name: market-signal-radar
description: สแกนสัญญาณตลาดและบทสนทนาล่าสุดจากหลายแหล่ง แยก Trend, Anecdote, Competitor Signal และ Evidence เพื่อช่วย MI/PITi/ISI ตัดสินใจว่าจะตรวจอะไรต่อ
---

# STeP Market Signal Radar

Skill นี้ช่วย MI, PITi, ISI, EIC, TECH-SPIN, LINC และทีมที่ต้องเข้าใจ “ตอนนี้ตลาดกำลังพูดอะไร” โดยเน้น **recent signals + source quality + uncertainty** ไม่ใช่สรุปเทรนด์จากความจำของโมเดล

> **Recent does not mean representative. Popular does not mean proven.**

## เมื่อควรใช้
- ต้องการดู trend ล่าสุดก่อนทำ campaign / positioning / product test
- อยากรู้ว่าลูกค้า/ชุมชนออนไลน์พูดถึงปัญหาอะไร
- ต้องการ competitor / category signal ก่อนสัมภาษณ์ตลาด
- ต้องการหลักฐานประกอบว่าสูตร/แนวคิด/ข้อความหนึ่ง “มีคนสนใจจริงไหม”

## Source Strategy
หากมี web/search tools ให้ใช้ข้อมูลปัจจุบัน และระบุช่วงเวลาเสมอ

### Source tiers
1. **Primary / First-party** — เว็บไซต์บริษัท เอกสารทางการ product page changelog
2. **Research / Reputable reporting** — งานวิจัย สมาคมอุตสาหกรรม สื่อที่มีมาตรฐาน
3. **Community / User conversation** — Reddit, forum, review, social, YouTube comments
4. **Search / Aggregator signal** — ใช้ค้นหา lead แต่ไม่ควรเป็น evidence หลักเพียงตัวเดียว

ถ้า host ไม่มี web access ให้บอกชัดว่า `ยังไม่ได้ตรวจข้อมูลปัจจุบัน` แล้วสร้าง research plan แทน

## Signal Types
จัดทุกสิ่งที่พบเป็น:
- **Demand signal** — คนกำลังหา/ขอ/บ่นเกี่ยวกับอะไร
- **Behavior signal** — คนทำอะไรจริง ไม่ใช่แค่พูด
- **Competitor signal** — คู่แข่งเปิดตัว เปลี่ยนราคา เปลี่ยน messaging หรือ feature
- **Technology signal** — capability ใหม่ที่อาจเปลี่ยน feasibility
- **Policy / ecosystem signal** — กฎ มาตรฐาน ทุน partner หรือ infrastructure ที่เปลี่ยนบริบท

## Radar Workflow

### 1. Define the question
อย่าค้นคำว่า “trend” กว้าง ๆ ให้ระบุ decision ที่ research ต้องช่วย

### 2. Set timeframe
ใช้ช่วงเวลาที่เหมาะ เช่น 30 วัน / 90 วัน / 12 เดือน และบอกเหตุผล

### 3. Gather mixed evidence
อย่าใช้ source type เดียวเพื่อสรุปทั้งตลาด

### 4. Separate Signal from Noise
ประเมินเชิงคุณภาพ:
- **Strong:** หลายแหล่งอิสระ + พฤติกรรม/ข้อมูลจริงรองรับ
- **Moderate:** มี pattern ซ้ำแต่ sample ยังจำกัด
- **Weak:** anecdote, post เดียว, marketing claim หรือกระแสสั้น

### 5. What changed?
ระบุสิ่งใหม่เทียบกับ baseline ถ้าหาได้ ไม่เพียงสรุปสิ่งที่ “มีอยู่”

### 6. Actionable next check
ทุก signal สำคัญต้องจบด้วยสิ่งที่ควร validate ต่อ เช่น interview, pricing test, prototype test หรือ source ที่ต้องหาเพิ่ม

## Output เริ่มต้น

# Market Signal Radar — <หัวข้อ>

**Decision supported:** …  
**Time window:** …  
**Search date:** …

| Signal | Evidence | Source type | Strength | Why it matters | Next check |
|---|---|---|---|---|---|

## What appears to be changing
- …

## What is still noise / uncertain
- …

## Recommended validation
1. …

## Guardrails
- ห้ามใช้ post เดียวหรือยอด view เดียวเป็นหลักฐานว่า “ตลาดต้องการ”
- ห้ามสร้างตัวเลข market size หาก source ไม่รองรับ
- แยก user sentiment ออกจาก actual purchase/adoption behavior
- ระบุวันที่ของข้อมูลล่าสุด
- หากเป็นการวิจัยลูกค้าเชิงลึก ให้ส่งต่อ `startup-discovery` หรือ `voice-of-customer`
- ถ้าใช้ข้อมูลสาธารณะจากบุคคล ให้เคารพ privacy และหลีกเลี่ยงการรวบรวม PII ที่ไม่จำเป็น

---

**Method note:** ได้แรงบันดาลใจจากแนวคิด recent multi-source research ของ `last30days-skill` (MIT) และเขียนใหม่ให้เหมาะกับ market sensing ของ STeP โดยไม่ผูกกับ platform ใด platform หนึ่ง
