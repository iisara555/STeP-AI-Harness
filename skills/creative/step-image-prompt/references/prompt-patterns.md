# STeP Prompt Pattern Library

คลังรูปแบบ prompt ที่ใช้ซ้ำได้สำหรับงานภาพที่ STeP ทำบ่อย

**วิธีใช้:** เลือก pattern ที่ตรงกับ use case → เติมค่า Spec ที่ pattern กำหนด → render ตาม Family ของเครื่องมือปลายทาง ตาม `prompt-spec.md`

**สิ่งที่ไฟล์นี้ไม่ใช่:** ไม่ใช่ prompt สำเร็จรูปให้คัดลอกทั้งก้อน แต่ละงานมี subject, ข้อจำกัด และ brand context ต่างกัน pattern บอกว่า **ต้องล็อกอะไร ปล่อยอะไร และกันอะไร**

**กติกาที่ใช้กับทุก pattern:** ไม่สร้างโลโก้ ไม่สร้างข้อความไทยในภาพเป็นค่าเริ่มต้น ไม่สร้างข้อเท็จจริงหรือผลงานที่ไม่มี source และภาพจำลองต้องติดป้ายว่าเป็นภาพจำลอง

---

## 1. Profile / Portrait — ภาพบุคคลสำหรับสื่อองค์กร

**ใช้กับ:** ภาพผู้บริหารหรือทีมประกอบข่าว ภาพวิทยากร ภาพประกอบบทสัมภาษณ์

**ล็อก (Fixed):** identity ของบุคคล ทรงผม แว่น เครื่องแต่งกายที่ระบุ ท่าทางที่ตกลงไว้
**ปล่อย (Flexible):** แสง ฉากหลัง ระยะชัด โทนสี

**Spec ตั้งต้น**

```text
SUBJECT: บุคคล [บทบาท] ในชุด [ระบุ]
SHOT: medium close-up, eye-level, ระยะชัดตื้นพอแยกตัวแบบจากฉากหลัง
SETTING: พื้นหลังเรียบหรือบริบทที่ทำงานจริง ไม่รก
LIGHT: soft key light ด้านหน้าเฉียง ไม่มีเงาแข็งบนใบหน้า
PALETTE: neutral พร้อม warm amber accent เล็กน้อยในฉากหลัง
TEXT_SPACE: ด้านซ้ายหรือขวาของเฟรมสำหรับชื่อและตำแหน่ง
EXCLUDE: text, logo, wordmark, extra fingers, distorted face, heavy retouch
```

**ข้อควรระวัง:** ถ้าเป็นบุคคลจริงของ STeP **ห้ามสร้างใบหน้าขึ้นเอง** ใช้ภาพถ่ายจริงแล้วใช้ Family D แก้เฉพาะแสงหรือฉากหลัง และต้องได้รับความยินยอมตาม `data-privacy-compliance`

---

## 2. Social Post — ภาพประกอบข่าวและกิจกรรม

**ใช้กับ:** โพสต์ Facebook, Instagram, LinkedIn ของ STeP

**ล็อก:** สัดส่วนเฟรม พื้นที่วางข้อความ จุดเน้นเดียว
**ปล่อย:** มุมกล้อง พร็อพประกอบ ความลึกของฉาก

**Spec ตั้งต้น**

```text
SUBJECT: [วัตถุหรือกิจกรรมหลักของโพสต์]
SHOT: composition ที่เหลือพื้นที่ว่างอย่างน้อย 30%
PLACEMENT: subject เยื้องออกจากกึ่งกลางตามทิศที่ข้อความจะวาง
TEXT_SPACE: บล็อกว่างจริงด้าน [บน/ล่าง/ซ้าย/ขวา] สำหรับหัวข้อภาษาไทย
RATIO: 1:1 สำหรับฟีด, 4:5 สำหรับ IG portrait, 9:16 สำหรับ story
PALETTE: off-white หรือ deep charcoal เป็นพื้น warm amber เป็นจุดเน้นเดียว
EXCLUDE: text, Thai lettering, logo, watermark, cluttered background
```

**ข้อควรระวัง:** อย่าให้โมเดลเขียนหัวข้อภาษาไทยลงภาพ ให้เว้น `TEXT_SPACE` แล้ววางตัวอักษรจริงในขั้นออกแบบ

---

## 3. Poster / Event Key Visual — โปสเตอร์กิจกรรมและงานสัมมนา

**ใช้กับ:** โปสเตอร์อบรม งานเปิดตัว นิทรรศการ

**ล็อก:** ลำดับชั้นข้อมูล พื้นที่หัวเรื่อง พื้นที่โลโก้ผู้ร่วมจัด
**ปล่อย:** ภาษาภาพ พื้นผิว องค์ประกอบกราฟิก

**Spec ตั้งต้น**

```text
SUBJECT: key visual สื่อ [แก่นของงาน] แบบไม่ใช้ตัวอักษร
SHOT: vertical composition, จุดนำสายตาอยู่ครึ่งบน
TEXT_SPACE: แถบว่างครึ่งล่างสำหรับชื่องาน วันเวลา สถานที่ และแถบโลโก้ผู้ร่วมจัด
MEDIUM: [photographic / illustration / isometric] ตามผู้ชม
PALETTE: ตาม brand-visual-context.md โดยใช้ accent จุดเดียว
RATIO: 3:4 หรือ A-series portrait
EXCLUDE: text, logo, sponsor mark, fake award badge
```

**ข้อควรระวัง:** แถบโลโก้ผู้ร่วมจัดต้องเว้นว่างไว้เสมอ **ห้ามให้โมเดลสร้างโลโก้หรือตราสัญลักษณ์ใด ๆ** และลำดับการวางโลโก้ต้องยืนยันกับ `step-brand`

---

## 4. Report Cover / Executive Visual — ภาพปกรายงานและสไลด์ผู้บริหาร

**ใช้กับ:** ปกรายงานประจำปี ปก proposal ภาพเปิดสไลด์ผู้บริหาร

**ล็อก:** ความสงบของภาพ พื้นที่หัวเรื่อง ความน่าเชื่อถือ
**ปล่อย:** abstraction level, พื้นผิว, มุมมอง

**Spec ตั้งต้น**

```text
SUBJECT: ภาพเชิงแนวคิดของ [ธีมรายงาน] แบบ restrained ไม่ดราม่า
STYLE: corporate minimal หรือ editorial swiss, negative space กว้าง
LIGHT: even, low contrast, ไม่มี lens flare
PALETTE: off-white หรือ charcoal พร้อม amber accent บาง ๆ
TEXT_SPACE: ครึ่งบนหรือหนึ่งในสามของเฟรมสำหรับชื่อรายงานและปี
RATIO: 3:4 หรือ 16:9 ตามปลายทาง
EXCLUDE: text, logo, stock-photo cliché, glowing AI aesthetic
```

---

## 5. Service / Facility Visual — ภาพบริการ ห้องแล็บ และโรงงานต้นแบบ

**ใช้กับ:** ภาพประกอบบริการ LES, FOODFABR, IQI, IFU และการสื่อสารกับผู้ประกอบการ

**ล็อก:** ความถูกต้องของอุปกรณ์และกระบวนการ ความปลอดภัยที่ปรากฏในภาพ
**ปล่อย:** มุมกล้อง แสง บรรยากาศ

**Spec ตั้งต้น**

```text
SUBJECT: [กระบวนการหรือเครื่องมือ] ในสภาพแวดล้อมทำงานจริง
SHOT: wide หรือ medium ที่เห็นบริบทการทำงาน
SETTING: พื้นที่ปฏิบัติงานสะอาด เป็นระเบียบ อุปกรณ์ความปลอดภัยครบ
MEDIUM: photographic, believable material response
EXCLUDE: text, logo, unsafe practice, missing PPE, impossible machinery
```

**ข้อควรระวังสูงสุด:** ภาพต้องไม่แสดงการทำงานที่ผิดหลักความปลอดภัย และ **ห้ามสร้างภาพเครื่องมือหรือผลการทดสอบที่ทำให้เข้าใจว่า STeP มีขีดความสามารถที่ยังไม่มีจริง** ถ้าไม่แน่ใจให้ยืนยันกับเจ้าของบริการก่อน

---

## 6. Concept / Prototype Visual — ภาพแนวคิดและต้นแบบ

**ใช้กับ:** ข้อเสนอโครงการ ภาพ concept ของผลิตภัณฑ์หรือพื้นที่ที่ยังไม่เกิดขึ้น

**ล็อก:** ข้อจำกัดทางกายภาพที่ทราบ สัดส่วนที่เป็นไปได้จริง
**ปล่อย:** วัสดุ แสง มุมมอง

**Spec ตั้งต้น**

```text
SUBJECT: concept visual ของ [ผลิตภัณฑ์ / พื้นที่ / ระบบ]
STYLE: architectural หรือ product visualization
EXCLUDE: text, logo, fabricated certification mark, unsupported technical claim
```

**บังคับ:** ทุกภาพในกลุ่มนี้ต้องติดป้าย `ภาพจำลอง` หรือ `Concept Image` เมื่อเผยแพร่ เพราะผู้รับสารอาจเข้าใจว่าเป็นของที่มีอยู่แล้ว

---

## 7. Infographic Base — พื้นหลังและองค์ประกอบสำหรับอินโฟกราฟิก

**ใช้กับ:** ภาพพื้นหลังหรือ element ประกอบ ไม่ใช่ตัวอินโฟกราฟิกที่มีตัวเลข

**Spec ตั้งต้น**

```text
SUBJECT: พื้นหลังเชิงเรขาคณิตหรือ isometric ที่สื่อ [หัวข้อ] โดยไม่มีตัวอักษรและตัวเลข
STYLE: flat หรือ isometric, ระบบเส้นสม่ำเสมอ
TEXT_SPACE: พื้นที่ว่างเป็นบล็อกสำหรับวางข้อมูลจริงภายหลัง
EXCLUDE: text, numbers, chart labels, fake data, fake percentage
```

**บังคับ:** **ห้ามให้โมเดลสร้างตัวเลข กราฟ หรือเปอร์เซ็นต์** ข้อมูลทุกตัวต้องมาจากแหล่งจริงและวางในขั้นออกแบบ

---

## เลือก pattern อย่างไร

จับคู่จากปลายทางของภาพก่อนเสมอ ไม่ใช่จากความสวย:

| ผู้ใช้พูดว่า | เริ่มที่ pattern |
| --- | --- |
| ภาพโปรไฟล์ ภาพผู้บริหาร ภาพวิทยากร | 1 Profile / Portrait |
| ลงเพจ ลงไอจี โพสต์ข่าว | 2 Social Post |
| โปสเตอร์ งานอบรม งานเปิดตัว นิทรรศการ | 3 Poster / Event Key Visual |
| ปกรายงาน ปกข้อเสนอ สไลด์เปิด | 4 Report Cover / Executive Visual |
| ภาพแล็บ เครื่องมือ โรงงานต้นแบบ บริการ | 5 Service / Facility Visual |
| ภาพต้นแบบ ภาพสิ่งที่ยังไม่มี | 6 Concept / Prototype Visual |
| พื้นหลังอินโฟกราฟิก | 7 Infographic Base |

ถ้าไม่ตรง pattern ใดเลย ให้สร้าง Prompt Spec จากศูนย์ตาม `prompt-spec.md` แล้วแจ้งผู้ใช้ว่าไม่ได้ใช้ pattern สำเร็จรูป

## Method note

โครงคิดเรื่องคลัง prompt แบบจัดหมวดตาม use case และการแยก template ออกจากการปรับแต่งเฉพาะงาน ได้แรงบันดาลใจจาก community prompt library สาธารณะ แล้วเขียนใหม่ทั้งหมดให้เป็น pattern ของ STeP ตามกติกาใน `docs/skill-authoring-standard.md` ที่ห้ามคัดลอก third-party skill แบบ verbatim

ไม่ดึงข้อมูลหรือภาพตัวอย่างจากบริการภายนอกตอนใช้งาน เพราะ repository นี้เป็น public และต้องใช้ได้แบบ offline
