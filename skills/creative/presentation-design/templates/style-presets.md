# คลังชุดสไตล์และธีมนำเสนอ (Style Presets Reference)

ชุดสไตล์สำหรับงานนำเสนอ STeP; สีดิจิทัลอ้างอิง [CI manual digest reference](../../../common/step-brand/references/ci-manual-digest.md) และคำยืนยันผู้ใช้ 2026-09-20: Yellow `#FFC709`, Dark `#231F20`.

**ขอบเขต:** ฟอนต์ สีพื้นรอง กราฟิก และธีมทางเลือกด้านล่างเป็น design suggestions ไม่ใช่ข้อกำหนดองค์กรจาก digest. ธีมสีอื่นต้องไม่เปลี่ยนสี official logo; ใช้ logo variant ตามพื้นหลังและตรวจ `step-brand` ก่อนเผยแพร่. สี CMYK และสถานะฉบับควบคุมปัจจุบันยังรอ CC ยืนยัน.

---

## 1. STeP Signature Innovation (ชุดสไตล์เริ่มต้นด้วยสี STeP)
**Vibe:** ทันสมัย อบอุ่น มีพลัง สะท้อนค่านิยม Simple • Service • Sincere  
**เหมาะสำหรับ:** Executive Deck, รายงานผลการดำเนินงาน, Pitching ทุนวิจัย, สไลด์แนะนำองค์กร STeP

- **Display Font:** `Prompt` (Google Fonts, 600/700) หรือ `Space Grotesk`
- **Body Font:** `Prompt` (Google Fonts, 300/400/500)
- **Palette:**
```css
:root {
    --bg-primary: #FFFFFF;
    --bg-secondary: #F8F9FA;
    --stage-bg: #141821;
    --text-primary: #231F20;    /* STeP Dark */
    --text-secondary: #4A5568;
    --accent-primary: #FFC709;  /* STeP Yellow */
    --accent-secondary: #FFC709; /* reuse confirmed yellow; not a second brand colour */
    --accent-light: #FFF6E5;
    --border: rgba(35, 31, 32, 0.12);
}
```
- **Signature Elements:** ป้ายหัวข้อสไตล์แคปซูล (Pill Badge), กรอบการ์ดโค้งมน (Border radius 20px) พร้อมเงาสีเหลืองจางๆ, ตัวเลขสถิติขนาดใหญ่แบบ Space Grotesk

---

## 2. Executive Slate & Silver (สไตล์ผู้บริหาร / ทางการระดับสูง)
**Vibe:** สุขุม น่าเชื่อถือ หนักแน่น ทรงอำนาจและแม่นยำ  
**เหมาะสำหรับ:** บอร์ดบริหารมหาวิทยาลัย, สำนักงบประมาณ, หน่วยงานภาครัฐ, แผนการเงิน

- **Display Font:** `Sarabun` (Google Fonts, 700) หรือ `Inter` (700)
- **Body Font:** `Sarabun` (Google Fonts, 400/500)
- **Palette:**
```css
:root {
    --bg-primary: #0F172A;      /* Deep Slate Blue */
    --bg-secondary: #1E293B;
    --stage-bg: #020617;
    --text-primary: #F8FAFC;
    --text-secondary: #94A3B8;
    --accent-primary: #38BDF8;  /* Sky Blue Accent */
    --accent-gold: #FCD34D;
    --border: rgba(255, 255, 255, 0.1);
}
```
- **Signature Elements:** เลย์เอาต์ตารางเปรียบเทียบข้อมูลที่ชัดเจน, เส้นแบ่ง Grid เส้นบางเฉียบ (Subtle hairline), การ์ดสถิติไฮไลต์ด้วยสีฟ้าสว่างหรือทองนุ่ม

---

## 3. 🇨🇭 Swiss Minimal Clean (สไตล์สวิสโมเดิร์น เรียบง่ายทรงพลัง)
**Vibe:** สะอาดตา สบายตา ตัวหนังสือคมชัด จัดวางตามระบบ Grid สวิสแท้  
**เหมาะสำหรับ:** งานสัมมนาวิชาการ, บรรยายเชิงเทคนิค (Tech Tutorial), แถลงข่าว

- **Display Font:** `Kanit` (Google Fonts, 600/700)
- **Body Font:** `Kanit` (Google Fonts, 300/400)
- **Palette:**
```css
:root {
    --bg-primary: #FAFAFA;
    --bg-secondary: #FFFFFF;
    --stage-bg: #E4E4E7;
    --text-primary: #09090B;
    --text-secondary: #71717A;
    --accent-primary: #FFC709;  /* แซมจุดเด่นสีเหลือง STeP */
    --border: #E4E4E7;
}
```
- **Signature Elements:** พื้นที่ว่างสีขาวสูง (Negative Space $\ge 40\%$), การจัดวางแบบอสมมาตรแต่สมดุล, เลขลำดับสไลด์ตัวใหญ่ชิดมุม

---

## 4. Creative Voltage & Startup Pitch (สไตล์สตาร์ทอัพ / พลังงานสูง)
**Vibe:** ตื่นเต้น ท้าทาย เปี่ยมพลัง คอนทราสต์รุนแรงแบบสตาร์ทอัพรุ่นใหม่  
**เหมาะสำหรับ:** Demo Day, การแข่งขัน Hackathon, Pitching ดึงดูด VC / Angel Investors

- **Display Font:** `Space Grotesk` (700) + `Prompt` (700)
- **Body Font:** `Prompt` (400)
- **Palette:**
```css
:root {
    --bg-primary: #0B0F19;
    --bg-secondary: #111827;
    --stage-bg: #030712;
    --text-primary: #FFFFFF;
    --text-secondary: #9CA3AF;
    --accent-primary: #D4FF00;  /* Volt Lime */
    --accent-secondary: #0066FF;/* Electric Blue */
    --border: rgba(212, 255, 0, 0.2);
}
```
- **Signature Elements:** ป้ายนีออนเรืองแสง, แถบสีเฉียงตัดกัน, การ์ดเอียง 3D Tilt เมื่อเอาเมาส์ชี้, กราเดียนต์ไฟฟ้าเรืองแสง

---

## 5. DeepTech & Ecosystem (สไตล์ห้องแล็บและวิทยาศาสตร์ขั้นสูง)
**Vibe:** ไฮเทค ล้ำสมัย สะท้อนความเป็นอุทยานวิทยาศาสตร์และแล็บทดสอบ  
**เหมาะสำหรับ:** นำเสนองานวิจัย DeepTech, โครงการพัฒนาหุ่นยนต์/AI, การแถลงความร่วมมืออุตสาหกรรม

- **Display Font:** `Prompt` (600) + `Space Grotesk`
- **Body Font:** `Prompt` (300/400)
- **Palette:**
```css
:root {
    --bg-primary: #0A1128;
    --bg-secondary: #101F42;
    --stage-bg: #000411;
    --text-primary: #E2E8F0;
    --text-secondary: #8892B0;
    --accent-primary: #FFC709;  /* STeP Yellow */
    --accent-tech: #00F5D4;     /* Cyber Cyan */
    --border: rgba(0, 245, 212, 0.15);
}
```
- **Signature Elements:** ลวดลายตารางแบบ Circuit/Grid บางเบา, แผนผังไดอะแกรมความเชื่อมโยงของระบบนิเวศ (Ecosystem Map)

---

## 6. Warm Editorial (สไตล์วารสารวิชาการ / สตอรี่เทลลิงอบอุ่น)
**Vibe:** ประณีต ละเมียดละไม เหมือนเปิดอ่านนิตยสารธุรกิจชั้นนำระดับโลก  
**เหมาะสำหรับ:** Case Study ความสำเร็จของผู้ประกอบการ, เรื่องเล่าแรงบันดาลใจ, รายงานประจำปี

- **Display Font:** `IBM Plex Sans Thai` (Google Fonts, 600)
- **Body Font:** `IBM Plex Sans Thai` (Google Fonts, 300/400)
- **Palette:**
```css
:root {
    --bg-primary: #FDFBF7;      /* Warm Paper */
    --bg-secondary: #F5EFEB;
    --stage-bg: #2C2621;
    --text-primary: #2B231D;
    --text-secondary: #6E6259;
    --accent-primary: #D97706;  /* Warm Amber */
    --border: rgba(43, 35, 29, 0.12);
}
```
- **Signature Elements:** ตัวพิมพ์แบบ Editorial สวยงาม, เครื่องหมายคำพูด (Pull Quote) ขนาดใหญ่, บล็อกข้อความสรุปมุมมอง (Callout Box)
