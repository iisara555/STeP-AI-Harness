# Prompt Spec & Renderers

Prompt Spec เป็น source of truth สำหรับเนื้อหาภาพหนึ่งชิ้น: กรอกข้อมูลครั้งเดียว แล้ว render ออกตาม syntax family ของเครื่องมือปลายทาง

หลักการ:
- แก้ที่ Spec ไม่แก้ rendered prompt โดยตรง
- เปลี่ยนเครื่องมือได้โดย render ใหม่จาก Spec เดิม
- จัดกลุ่มตาม syntax family ไม่ผูกกับชื่อรุ่นหรือผู้ให้บริการ
- ถ้า syntax ของเครื่องมือไม่ตรงกับ family ใดอย่างชัดเจน ให้ถามรูปแบบการเขียน prompt ก่อน ไม่เดาจากชื่อเครื่องมือ

## 1. Prompt Spec

```yaml
# ---------- เนื้อหาภาพ ----------
SUBJECT:        # ใครหรืออะไรอยู่ในภาพ (บังคับ)
ACTION:         # กำลังทำอะไร มองไปทางไหน เพื่อหลีกเลี่ยงภาพ stock
SETTING:        # อยู่ที่ไหน บริบทอะไร

# ---------- การจัดภาพ ----------
SHOT:           # ระยะและมุม เช่น medium-wide at eye level
PLACEMENT:      # subject อยู่ตรงไหนของเฟรม
TEXT_SPACE:     # พื้นที่จริงที่ต้องปล่อยโล่ง เช่น entire left third kept clean
RATIO:          # 16:9 / 4:5 / 1:1 / 9:16

# ---------- แสงและสไตล์ ----------
LIGHT:          # ทิศทาง + คุณภาพ เช่น soft daylight from upper left
MEDIUM:         # photo / flat vector / hand-drawn ink / 3D render
STYLE:          # ขยาย MEDIUM เช่น documentary, naive folk-art
PALETTE:        # บรรยายเป็นคำ ไม่ใช้ hex เป็นค่าเริ่มต้น

# ---------- ข้อจำกัด ----------
MUST_KEEP:      # ใช้กับงานแก้ภาพ: สิ่งที่ต้องรักษา
CHANGE_ONLY:    # ใช้กับงานแก้ภาพ: สิ่งที่เปลี่ยนได้
EXCLUDE:        # สิ่งที่ไม่ต้องการ
```

### Baseline EXCLUDE

ใส่ baseline นี้เป็นค่าเริ่มต้นเมื่อผู้ใช้ไม่ได้ขอสิ่งเหล่านี้โดยตรง:

```yaml
EXCLUDE:
  - text, letters, typography, captions, signage lettering
  - logos, watermarks, brand marks
  - distorted hands, extra fingers, extra limbs
```

เหตุผล:
- ตัวอักษรและตราสัญลักษณ์ที่โมเดลสร้างขึ้นอาจคลาดเคลื่อนจากต้นฉบับ
- สำหรับ STeP/CMU logo ต้องใช้ Official Asset ไม่ให้ AI เลียนแบบขึ้นใหม่
- หากผู้ใช้ต้องการตัวอักษรหรือโลโก้จริง ให้แจ้งข้อจำกัดของเครื่องมือและนำรายการนั้นออกจาก EXCLUDE เฉพาะเมื่อผู้ใช้ยืนยัน

### กฎการกรอก

| ช่อง | ใช้แบบนี้ | หลีกเลี่ยง |
| --- | --- | --- |
| SUBJECT | `a researcher and a business owner` | `professional innovative people` |
| ACTION | `examining a prototype together, looking at the object not the camera` | เว้นว่างทั้งที่ action มีผลต่อภาพ |
| TEXT_SPACE | `entire left third kept clean` | `leave space for text` |
| PALETTE | `warm golden yellow accents on neutral base` | hex code เป็นค่าเริ่มต้น |

## 2. Syntax Families

ถามผู้ใช้ครั้งเดียวเมื่อยังไม่รู้ family:

> เครื่องมือที่จะใช้เขียน prompt แบบไหนครับ — พิมพ์เป็นประโยคยาว ๆ, ใส่ keyword คั่นจุลภาค, มีช่อง negative แยก, หรือใส่ flag ต่อท้ายเช่น `--ar`

| Family | ลักษณะ | Negative | Ratio |
| --- | --- | --- | --- |
| **A. Natural-language** | ประโยค/ย่อหน้าที่เข้าใจบริบท | เขียนเป็นประโยคข้อห้าม | บอกเป็นข้อความ |
| **B. Tag + weight** | positive/negative แยก ช่อง tag และอาจรองรับ weight | ช่อง Negative แยก | ตั้ง width/height |
| **C. Parameter-flag** | prompt ตามด้วย parameter เช่น `--ar` | parameter เช่น `--no` | `--ar 16:9` |
| **D. Edit / inpaint** | แนบภาพเดิมแล้วแก้เฉพาะส่วน | บอกข้อห้ามใน edit instruction | รักษาตามภาพเดิมเป็นค่าเริ่มต้น |

ถ้าผู้ใช้ไม่ทราบ:
- ใช้ **Family A**
- ระบุสั้น ๆ ว่าอาจต้อง render ใหม่หากเครื่องมือปลายทางใช้ syntax คนละ family
- ห้ามเดา family จากชื่อเครื่องมือที่ระบบไม่รู้จัก

## 3. Renderers

### Family A — Natural-language

เรียงลำดับเนื้อหาให้คงที่เพื่อให้แก้และเปรียบเทียบง่าย:

```text
{SUBJECT} {ACTION}, {SETTING}.

{SHOT}, {PLACEMENT}, {TEXT_SPACE}.

{LIGHT}.

{MEDIUM}, {STYLE}.

{PALETTE}.

Aspect ratio {RATIO}.

Do not include: {EXCLUDE}.
```

กติกา:
- ใช้ภาษาธรรมชาติแบบ self-contained
- คงลำดับ section เพื่อให้ prompt รุ่นต่าง ๆ เปรียบเทียบกันได้
- ข้อห้ามเขียนเป็นประโยคชัดเจน ไม่ซ่อนในคำอธิบายยาว

### Family B — Tag + weight

**Positive**

```text
{SUBJECT}, {ACTION}, {SETTING}, {SHOT}, {PLACEMENT},
{LIGHT}, {MEDIUM}, {STYLE}, {PALETTE},
(clean empty area {TEXT_SPACE}:1.2)
```

**Negative**

```text
{EXCLUDE}, text, watermark, signature, blurry, lowres,
bad anatomy, extra fingers, jpeg artifacts
```

กติกา:
- เปลี่ยนประโยคยาวเป็นวลีสั้นคั่นจุลภาค
- ใช้ weight เฉพาะเมื่อเครื่องมือรองรับ syntax แบบ `(phrase:1.2)`
- อย่าเร่งน้ำหนักสูงโดยไม่มีเหตุผล; ถ้าเครื่องมือให้ผลไม่เสถียรให้ลด weight ก่อน
- `RATIO` ไม่อยู่ใน prompt family นี้ ให้บอกผู้ใช้ตั้ง width/height แยก

**Ratio handoff:** ระบุ width × height ที่มีสัดส่วนใกล้เคียงกับ Spec เช่น 16:9 → 1344 × 768 เมื่อเครื่องมือรองรับขนาดนั้น; หากไม่รู้ข้อจำกัดของเครื่องมือ ให้ระบุเฉพาะอัตราส่วนและบอกว่าต้องตั้ง width/height ใน UI

### Family C — Parameter-flag

```text
{SUBJECT} {ACTION}, {SETTING}, {SHOT}, {PLACEMENT},
{TEXT_SPACE}, {LIGHT}, {MEDIUM}, {STYLE}, {PALETTE}
--ar {RATIO} --no {EXCLUDE ต่อด้วยจุลภาค}
```

กติกา:
- ใช้วลีสั้น กระชับ
- ใช้ `--no` เฉพาะเมื่อเครื่องมือรองรับ parameter นี้
- ratio ใช้รูปแบบ `16:9` ตาม family convention
- หากเครื่องมือใช้ flag คนละชื่อ ให้เปลี่ยน renderer token แต่ไม่เปลี่ยน Prompt Spec

### Family D — Edit / inpaint

ลำดับสำคัญ: เริ่มด้วยสิ่งที่ต้องรักษา

```text
Using the provided image, keep {MUST_KEEP} exactly as they are.

Change only: {CHANGE_ONLY}.

Match the existing lighting direction ({LIGHT}) so the result is
consistent with the shadows already in the image.

Keep the original framing, aspect ratio, and color grading unless the user explicitly requested a change.

Do not alter {MUST_KEEP}. Do not add: {EXCLUDE}.
```

กติกา:
- ต้องมี `MUST_KEEP` ก่อน render
- ถ้า `CHANGE_ONLY` ไม่ชัด ให้ถามเฉพาะจุดนั้นก่อน
- อย่าอ้างว่ารักษาได้ 100% หากเครื่องมือปลายทางรับประกัน fidelity ไม่ได้
- ถ้าผู้ใช้ขอเปลี่ยน framing / ratio / grading ให้ย้ายสิ่งนั้นเข้า `CHANGE_ONLY` ไม่ใช้ค่า default ด้านบน

## 4. ตัวอย่าง: Spec เดียว render หลาย family

### Spec

```yaml
SUBJECT: a researcher and a business owner
ACTION: examining a small prototype device together on a workbench, both looking at the object not the camera
SETTING: modern university laboratory, background softly out of focus
SHOT: medium-wide shot at eye level
PLACEMENT: subjects on the right third
TEXT_SPACE: entire left third kept clean and uncluttered
RATIO: 16:9
LIGHT: bright natural daylight from a large window on the left, soft shadows
MEDIUM: photorealistic, 50mm lens, f/2.8
STYLE: documentary, candid, authentic not posed
PALETTE: warm neutral base with warm golden yellow accents in the environment
MUST_KEEP:
CHANGE_ONLY:
EXCLUDE: text, letters, logos, watermark, glowing holograms, floating UI panels, circuit-board brain imagery
```

### Family A

```text
A researcher and a business owner examining a small prototype device together on a workbench, both looking at the object not the camera, in a modern university laboratory with the background softly out of focus.

Medium-wide shot at eye level, subjects on the right third, entire left third kept clean and uncluttered.

Bright natural daylight from a large window on the left, soft shadows.

Photorealistic, 50mm lens, f/2.8, documentary, candid, authentic not posed.

Warm neutral base with warm golden yellow accents in the environment.

Aspect ratio 16:9.

Do not include: text, letters, logos, watermark, glowing holograms, floating UI panels, circuit-board brain imagery.
```

### Family B

**Positive**

```text
a researcher and a business owner, examining a small prototype device on a workbench,
looking at the object not the camera, modern university laboratory, background bokeh,
medium-wide shot, eye level, subjects on right third, natural daylight from left window,
soft shadows, photorealistic, 50mm, f/2.8, documentary candid, warm neutral palette,
golden yellow accents, (clean empty area on left third:1.2)
```

**Negative**

```text
text, letters, logos, watermark, glowing holograms, floating UI panels,
circuit board brain, signature, blurry, lowres, bad anatomy, extra fingers, jpeg artifacts
```

**Ratio handoff:** 16:9 — ตั้ง width/height ในเครื่องมือ เช่น 1344 × 768 หากรองรับ

### Family C

```text
a researcher and a business owner examining a small prototype device on a workbench,
looking at the object not the camera, modern university laboratory, soft bokeh background,
medium-wide eye-level shot, subjects on right third, clean empty left third,
natural daylight from left window, photorealistic 50mm f/2.8, documentary candid,
warm neutral with golden yellow accents
--ar 16:9 --no text, letters, logos, watermark, holograms, floating UI, circuit board brain
```

### Family D

```text
Using the provided image, keep the two people, their poses, clothing, facial features,
and the prototype on the table exactly as they are.

Change only: the background behind them to a modern university laboratory with soft depth of field.

Match the existing lighting direction (daylight from the left) so the replaced background
is consistent with the shadows already on the subjects.

Keep the original framing, aspect ratio, and color grading.

Do not alter the people or the prototype. Do not add: text, letters, logos, watermark,
holograms, floating UI panels.
```

## 5. Revision & Series Workflow

### แก้ภาพเดิม

1. แก้ Prompt Spec
2. render ใหม่ตาม family เดิม
3. ห้าม patch rendered prompt โดยตรงเป็น source of truth
4. ถ้าจำเป็นต้องแก้ rendered prompt ชั่วคราว ให้สะท้อนการแก้นั้นกลับเข้า Spec ก่อนรอบถัดไป

### ทำภาพเป็นชุด

ล็อกช่อง:

```yaml
LOCK:
  - MEDIUM
  - STYLE
  - PALETTE
  - LIGHT
  - SHOT
  - RATIO
  - EXCLUDE
```

เปลี่ยนได้:

```yaml
VARIABLE:
  - SUBJECT
  - ACTION
```

ถ้าฉากจำเป็นต้องเปลี่ยนตามเนื้อหา ให้เพิ่ม `SETTING` เป็น VARIABLE โดยตั้งใจ ไม่ปล่อยให้เปลี่ยนอัตโนมัติ

ความสม่ำเสมอมาจาก Spec ที่ล็อกเหมือนกัน ไม่ใช่คำว่า “แบบเดิม”

### เปลี่ยนเครื่องมือ

ใช้ Spec เดิม แล้วเลือก renderer family ใหม่ ไม่คิดเนื้อหาภาพใหม่หากข้อกำหนดเดิมยังใช้ได้

## 6. Brand Visual Context

เมื่อมี Controlled CI Guideline หรือ Official Brand Visual Guideline:
- เก็บคำอธิบาย `PALETTE`, logo/asset rules และ visual constraints ที่ยืนยันแล้วใน `references/brand-visual-context.md`
- อย่า hard-code mutable brand rule ไว้ใน SKILL.md
- ถ้ายังไม่มี controlled source ให้ใช้เฉพาะ brand context ที่ผู้ใช้ให้หรือ official asset ที่ resolve ได้
- ห้ามสร้าง hex, logo geometry, co-branding rule หรือ claim จากความจำ
