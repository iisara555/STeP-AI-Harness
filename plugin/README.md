# STeP AI Skills (Claude plugin)

Skills และกติกาการทำงานของ STeP สำหรับ Claude Code และ Claude Desktop

## ติดตั้ง

ใน Claude Code พิมพ์:

```text
/plugin marketplace add iisara555/STeP-AI-Harness
/plugin install step@step-ai
```

แล้วเริ่มแชตใหม่ เรียก Skill ด้วย `/step:<ชื่อ>` เช่น `/step:meeting-summary` หรือพิมพ์งานตามปกติ Claude จะเลือก Skill ที่ตรงกับงานเอง

ทุกแชตเริ่มด้วยกติกาของ STeP (การอนุมัติโดยมนุษย์ ข้อมูลส่วนบุคคล ความลับ และการเขียน) จาก `session-brief.md`

## อัปเดต

`/plugin marketplace update step-ai` แล้วเริ่มแชตใหม่

## ใช้ร่วมกับ step-ai installer

ถ้าโฟลเดอร์งานเคยติดตั้งด้วย `step-ai install` แล้ว (มี `CLAUDE.md` และโฟลเดอร์ `skills/` ของ STeP) ไม่ต้องติดตั้ง plugin นี้ในโฟลเดอร์นั้น เพื่อไม่ให้ Skill ซ้ำสองชุด
