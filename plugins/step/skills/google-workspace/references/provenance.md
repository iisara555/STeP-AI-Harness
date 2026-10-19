# ที่มาและการปรับสำหรับ STeP

ตรวจต้นฉบับ [NousResearch/hermes-agent Google Workspace](https://github.com/NousResearch/hermes-agent/tree/79651b71bd56efd76d06f3de1df64dde09b58ff3/skills/productivity/google-workspace) commit `79651b71bd56efd76d06f3de1df64dde09b58ff3` วันที่ 2026-10-14: SKILL.md, scripts/setup.py, scripts/google_api.py, scripts/gws_bridge.py, references/gmail-search-syntax.md และ references/daily-brief.md

Hermes ใช้ MIT © 2025 Nous Research ดู [MIT notice](hermes-MIT.txt) Daily brief ให้เครดิต workflow ของ Ben Barclay (benbarclay)

## สิ่งที่นำมาใช้เป็นตัวอย่าง

- Core Skill สั้นและแยก command/reference ตามงาน
- ตรวจ auth ก่อนใช้งาน ขอ scope ตามบริการ และอธิบาย failure ที่แก้ต่อได้
- Gmail query มีขอบเขต อ่านข้อความที่เกี่ยวข้องก่อนสรุป
- Daily brief แยกวันท้องถิ่น/timezone, coverage, นัดชน, preparation และเมลค้าง
- ยืนยันก่อน writes และให้ reference/ID ของผลจริง

## การปรับให้เหมาะกับแอป

เขียน Skill/references/fixtures/checker ใหม่สำหรับ native Google tool ของ STeP ไม่คัดลอก Python implementation หรือ OAuth backend ของ Hermes ไม่อ่าน `.hermes` และไม่ติดตั้ง gws/himalaya/MCP

OAuth, browser callback, token refresh, scope/domain checks และ Vault ใช้ host เดิม เครื่องมือ account handles ผูกกับ session/epoch มีอายุห้านาที AI ไม่ได้รับ token การอ่าน result ไป AI ยังผ่าน Privacy/transmission consent เดิม

เพิ่มการอ่าน reference ย่อยผ่าน `skill(args.resource)` เฉพาะ Markdown ภายใน routed Skill ผ่าน authority/path/privacy/hooks เดิม ไม่ทำให้ scripts เป็น executable tools

สคริปต์ `check-contract.mjs` เป็น offline developer check ตรวจ operation/reference/fixtures ตรงกับ source และ Desktop tests เรียก `googleInvocation` กับ fixtures ทุกตัว ไม่ติดต่อ Google ไม่เปิด token และไม่พิสูจน์ live OAuth หรือคุณภาพโมเดล

วันที่ 2026-10-18 ขยาย native catalog จาก 26 เป็น 76 operations ตาม 7 กลุ่มบริการที่ผู้ใช้ยก [openclaw/gogcli](https://github.com/openclaw/gogcli) เป็นตัวอย่าง: Gmail, Drive, Docs, Sheets, Slides, Forms และ Apps Script ใช้แนวคิด service-specific consent, typed operations และ structured results โดยไม่ได้คัดลอก Go implementation หรือเพิ่ม gog binary/shell bridge

ตรวจ endpoint/method/scope และชนิด batch request กับ Google API Discovery documents ทางการ แล้วเก็บ snapshot สาธารณะเฉพาะ metadata ใน `desktop/test/fixtures/google-api-methods.json` สำหรับการตรวจ offline การเพิ่ม scope ใน policy ไม่เพิ่ม grant ให้บัญชีเก่า และ host ตรวจเจตนาอ่าน/ร่าง/ส่งแยกจาก scope ที่กว้างกว่าของ Google

ขอบเขตที่ native catalog ไม่มีจะบอกตรง ๆ: โอนไฟล์ไบนารี/PDF/DOCX, Contacts, ส่ง draft ID เดิมโดยไม่ตรวจเนื้อหาใหม่ และ selector ของคำสั่ง append สำหรับ Docs หลาย tab ไม่มีการอ้างว่าเทียบเท่า Hermes หรือ gogcli ทุกคำสั่ง การตรวจจริงกับบัญชีและการตั้งค่า Google Cloud ขององค์กรยังต้องทำแยกต่างหาก
