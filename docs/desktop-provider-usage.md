# Usage ของบัญชี AI ใน STeP Desktop

เปิด **การใช้งาน AI** จากเมนูเดิม หรือพิมพ์ `/usage` ในแชต ดูบัญชีที่ตั้งค่าไว้แล้วกด **รีเฟรช Usage** ของบัญชีที่ต้องการ ตัวเลขรายบัญชีเป็นข้อมูลจาก provider ณ เวลาที่ระบุ ส่วน **การใช้ใน STeP Desktop** เป็น ledger ของแอป ทั้งสองยอดมีขอบเขตต่างกันและไม่ต้องตรงกัน

## ช่องทางที่รองรับ

| การเชื่อมต่อ | ข้อมูลจากบัญชี | ช่องทางอ่าน |
| --- | --- | --- |
| OpenAI / Codex สมาชิก | เปอร์เซ็นต์ใช้ของแต่ละ quota bucket, ระยะเวลา window, เวลา reset, plan และเครดิตที่ส่งมา | Codex app-server `account/rateLimits/read` ผ่าน runtime/profile ของบัญชีที่เลือก |
| Claude สมาชิก | 5h, 7 วัน, window ของโมเดลที่ส่งมา และ extra usage ของรอบบิล | Claude Agent SDK `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` — experimental; runtime เก่าหรือ scope ไม่พออาจอ่านไม่ได้ |
| GitHub Copilot เมื่อ policy อนุญาต | request entitlement, ใช้แล้ว, เปอร์เซ็นต์และเวลา reset ที่ส่งมา | Copilot SDK `rpc.account.getQuota` — experimental; ไม่เปิด feature นี้ให้เอง |
| OpenRouter API | ยอดใช้ของ key วันนี้/สัปดาห์/เดือน/สะสม UTC, BYOK แยกต่างหาก, วงเงิน key, เครดิตบัญชีเมื่อมีสิทธิ์อ่าน | `GET /api/v1/key` และ `GET /api/v1/credits` |
| DeepSeek API | balance แยก USD/CNY และสถานะใช้ได้ที่รายงาน | `GET /user/balance` |
| OpenAI API, Claude API/Console OAuth, Gemini, Antigravity, Qwen, MiniMax, Groq, Mistral, xAI, custom compatible | ยังไม่มี account-usage reader ใน Desktop รุ่นนี้; แสดง ledger ในแอปและลิงก์ provider เมื่อมี | ไม่ดึงข้อมูลจาก cookie/browser และไม่ตีความว่าเครดิตเป็นศูนย์ |
| Ollama | ledger ในแอป; ไม่มีโควตาสมาชิกหรือเครดิต cloud ที่อ่าน | ไม่เรียก account API |

ป้าย 5h และ 1W แสดงเฉพาะ window ที่มีระยะเวลานั้นจริง สำหรับ Codex ไม่สมมติว่า primary ต้องเป็น 5h หรือ secondary ต้องเป็น 1W เสมอ Copilot แสดง entitlement ตามที่อ่านได้ ไม่แปลงเป็นโควตา 5h/1W

เครดิต Codex ใช้หน่วย `credits` ไม่แปลงเป็น USD ยอดเงินที่ provider ระบุสกุลเงินจะแสดงแยก USD/CNY Claude extra usage ใช้หน่วยย่อยของสกุลเงินตาม SDK แล้วหาร 100 เฉพาะเมื่อระบุ USD/CNY; หากไม่ระบุสกุลเงิน คงเป็นหน่วยย่อย ไม่เดาว่าเป็นดอลลาร์ วงเงิน OpenRouter API key ที่ไม่ได้ตั้ง **ไม่ใช่** เครดิตบัญชีไม่จำกัด ยอดสัปดาห์ OpenRouter เป็นจันทร์–อาทิตย์ UTC ไม่ใช่ rolling 7 วัน

## Ledger ของแอป

Token มาจาก provider สำหรับ Chat, Draft และ Web Search ที่แอปรับรายงานได้ ค่า USD เป็นประมาณการจากราคาใน policy ไม่ใช่ใบแจ้งหนี้ ไม่รวมการใช้จากแอปอื่น รูปภาพและค่าสมาชิก ข้อมูลใหม่แยกตาม connection และ mode; ยอดเก่าที่ไม่มี connection id ยังอยู่ในยอดรวม แต่ไม่ย้ายไปให้บัญชีใดย้อนหลัง บัญชีที่ใช้ API key เดียวกันอาจเห็นยอดบัญชีซ้ำกัน ห้ามบวกรวมเครดิตรายบัญชีให้เป็นเครดิตรวมขององค์กร

API key ปกติไม่ได้ให้สิทธิ์อ่าน billing/usage ของทั้งองค์กรเสมอ โดยเฉพาะ OpenAI/Anthropic ซึ่งมีช่องทางองค์กรที่ต้องใช้สิทธิ์ admin เพิ่ม งานนี้ไม่เพิ่ม admin key หรือขยายสิทธิ์ key

## Privacy และทรัพยากร

- อ่านเมื่อผู้ใช้กดรีเฟรช ไม่ poll เบื้องหลัง ใช้ snapshot ในหน่วยความจำไม่เกินหนึ่งครั้งต่อนาทีต่อบัญชี แสดงเวลาอ่านทุกครั้ง; รีสตาร์ต/แก้ key/เชื่อมต่อใหม่/ออกจากระบบล้าง snapshot
- การเปิดหน้าผู้ให้บริการเปิด browser ของเครื่องด้วย URL ที่แอปกำหนด ไม่มี key แนบใน URL
- ใช้ secret/profile ของ connection เดิมใน main process ไม่ส่ง key, raw response, account id ของ provider หรือ terminal output ไป renderer/telemetry/repo ไม่อ่าน transcript เพื่อวิเคราะห์พฤติกรรม
- HTTP ใช้เฉพาะ origin/path ทางการที่กำหนดไว้ ปฏิเสธ redirect, endpoint ปลอมและ body เกิน 64 KiB; custom endpoint ไม่มีสิทธิ์ใช้ balance reader จากชื่อ preset อย่างเดียว
- ไม่ส่ง prompt, ไม่สร้าง generation session, ไม่ใช้ token เพื่ออ่าน quota เรียก runtime ทีละบัญชีและปิดเมื่อเสร็จ พร้อม timeout ไม่เพิ่ม dependency/model ใหม่ อย่างไรก็ดี runtime ต้องใช้ RAM ขณะเริ่มงาน; ยังไม่ได้วัดบน Windows 2 core หรือ macOS M1 RAM 4 GB
- ถ้าอ่านไม่สำเร็จ แสดงข้อผิดพลาดแทนตัวเลขเก่าที่ดูเหมือนยังใช้ได้ หากไม่มีข้อมูล ไม่แทนด้วย 0 หรือ unlimited

## หลักฐานการตรวจ

`desktop/test/provider-usage.test.ts` อยู่ใน `desktop/package.json` script `test` ผ่าน glob เดิม ทดสอบ schema สังเคราะห์, หน่วยเงิน/credits, ค่า unknown, endpoint/auth/body boundaries, cache/queue/invalidation, runtime cleanup และ ledger ข้ามบัญชี

`desktop/test/provider-usage-smoke.mjs` ใช้ Electron, preload, IPC, SQLite และ UI จริงกับ Codex fixture สังเคราะห์ ตรวจรีเฟรช/cache, ไม่มี prompt/login, provider URL และหน้าต่างเล็ก อยู่ใน script `test:electron` ไม่มีข้อมูลบัญชีจริงหรือคำอ้างว่าแต่ละ provider อ่านผ่านกับบัญชีจริงแล้ว

อ้างอิง implementation contract: Codex app-server JSON schema ที่สร้างจาก dependency `@openai/codex` 0.158.0, Claude Agent SDK type declarations 0.3.284, Copilot SDK 1.0.16, [OpenRouter SDK](https://github.com/OpenRouterTeam/python-sdk) (`getcurrentkey`, `getcredits`) และ [DeepSeek balance API](https://api-docs.deepseek.com/api/get-user-balance) Schema ของ Claude/Copilot experimental อาจเปลี่ยน; ค่า missing ต้องคงเป็น unknown และแสดง unavailable/error เมื่อ runtime ไม่รองรับ
