# คลังแอนิเมชันและเอฟเฟกต์การเคลื่อนไหว (Animation Patterns Reference)

แอนิเมชันใน Presentation ควรมีเป้าหมายเพื่อ **"ชี้นำสายตา (Guide Focus)"** ไม่ใช่เพื่อความหวือหวาจนรบกวนการรับสาร โดยใช้ CSS Transitions และ Micro-interactions ที่ไหลลื่นระดับ 60 FPS

---

## 1. Entrance Reveal Animations (เมื่อสลับมาที่สไลด์นั้น)

ทำงานร่วมกับคลาส `.slide.visible .reveal`:

```css
/* การโผล่ขึ้นแบบเลื่อนขึ้นและค่อยๆ ชัด (มาตรฐานที่แนะนำที่สุด) */
.reveal {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 0.65s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible .reveal {
    opacity: 1;
    transform: translateY(0);
}

/* การหน่วงเวลาเป็นลำดับชั้น (Staggered Sequence) */
.reveal:nth-child(1) { transition-delay: 0.08s; }
.reveal:nth-child(2) { transition-delay: 0.16s; }
.reveal:nth-child(3) { transition-delay: 0.24s; }
.reveal:nth-child(4) { transition-delay: 0.32s; }
.reveal:nth-child(5) { transition-delay: 0.40s; }

/* ขยายขึ้นจากตรงกลาง (สำหรับตัวเลขสถิติ หรือ Badge โลโก้) */
.reveal-scale {
    opacity: 0;
    transform: scale(0.92);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible .reveal-scale {
    opacity: 1;
    transform: scale(1);
}

/* เลื่อนเข้ามาจากซ้าย (สำหรับ Timeline หรือ Process Step) */
.reveal-left {
    opacity: 0;
    transform: translateX(-40px);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide.visible .reveal-left {
    opacity: 1;
    transform: translateX(0);
}
```

---

## 2. Interactive Micro-Interactions (เอฟเฟกต์ตอบสนองเมาส์)

### 2.1 Card Hover Lift (ยกการ์ดขึ้นเบาๆ)
```css
.feature-card {
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1),
                border-color 0.3s ease;
}

.feature-card:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 40px rgba(43, 51, 61, 0.08);
    border-color: var(--step-yellow, #F9AE3B);
}
```

### 2.2 3D Card Tilt (สำหรับสไลด์แนว Startup / Creative Voltage)
```javascript
function attachTilt(cardElement) {
    cardElement.addEventListener('mousemove', (e) => {
        const rect = cardElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        cardElement.style.transform = `perspective(1000px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-6px)`;
    });

    cardElement.addEventListener('mouseleave', () => {
        cardElement.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0)';
    });
}
```

---

## 3. Background Patterns & Atmospheres

### 3.1 Subtle Tech Grid (เส้นกริดบางเบา)
```css
.grid-backdrop {
    background-image:
        linear-gradient(rgba(43, 51, 61, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(43, 51, 61, 0.04) 1px, transparent 1px);
    background-size: 60px 60px;
}
```

### 3.2 Innovation Amber Glow (ประกายแสงสีเหลือง STeP นุ่มนวล)
```css
.glow-backdrop {
    background: radial-gradient(circle at 85% 15%, rgba(249, 174, 59, 0.15) 0%, transparent 55%),
                radial-gradient(circle at 15% 85%, rgba(43, 51, 61, 0.05) 0%, transparent 50%),
                #FFFFFF;
}
```
