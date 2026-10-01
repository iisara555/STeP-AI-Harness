# OAuth แบบ Hermes: Claude, Gemini และ ChatGPT

ตรวจเอกสารต้นทางเมื่อ 1 ตุลาคม 2026; เป็นผลวิจัย ยังไม่ได้ล็อกอินหรือทดสอบกับบัญชีจริง

## สิ่งที่ Hermes รองรับจริง

| เส้นทาง | สถานะและข้อจำกัด |
|---|---|
| ChatGPT → `openai-codex` | Hermes มี device-code OAuth และ browser PKCE (`hermes auth add openai-codex --browser`); ใช้โมเดล Codex ไม่ใช่การเปิด ChatGPT web API ทั่วไป |
| Claude → provider `anthropic` | เอกสาร Hermes ระบุ Max พร้อม extra usage credits; เส้นทางนี้ไม่กิน allowance หลัก และไม่รองรับ Pro |
| Claude → DirectSDK plugin | คนละเส้นทางกับด้านบน ใช้ Claude Code executable ทางการกับ Pro/Max ผ่าน stream-json; เป็น experimental plugin |
| Gemini → direct consumer OAuth | ไม่มีใน Hermes ปัจจุบัน; `gemini` ใช้ API key และ `vertex` ใช้ GCP billing |
| Nous Portal → Claude/GPT/Gemini | OAuth ครั้งเดียวเข้าบัญชี Nous ได้หลายค่าย แต่ค่าใช้จ่ายอยู่ในสมาชิก Nous ไม่ได้ใช้โควตาสมาชิกสามค่ายเดิม |

ที่มา: [Hermes providers](https://hermes-agent.nousresearch.com/docs/integrations/providers/). เอกสาร Hermes ยังไม่ระบุรายละเอียดโควตา ChatGPT ทุกแผน จึงต้องยืนยัน entitlement ผ่านบัญชีและเอกสาร OpenAI แยกต่างหาก

## Claude: จุดเปลี่ยนที่ต้องแยกให้ถูก

[DirectSDK plugin ของ NousResearch](https://hermes-agent.nousresearch.com/docs/plugins/claude-subscription-directsdk) รุ่นที่อ่านอัปเดต 27 กันยายน 2026 ต้องการ Hermes 0.21.4+ และ Claude Code ที่ติดตั้งและล็อกอินแล้ว รองรับ Windows และไม่ต้องติดตั้ง Python Agent SDK เพิ่ม ชื่อ provider คือ `claude-subscription-directsdk-experimental`

```text
hermes plugins install claude-subscription-directsdk
claude auth login
hermes model
```

เลือก “Claude Subscription DirectSDK (Experimental)” โดย plugin ให้ CLI จัดการบัญชี ไม่เปิดหรือคัดลอกไฟล์ credential ทั้งนี้ความเข้ากันได้ขึ้นกับรุ่น CLI และสิทธิ์โมเดลในบัญชี; ค่าประเมินราคาที่ CLI แสดงไม่ใช่หลักฐานการตัดเงินจริง

[เงื่อนไข Anthropic ปัจจุบัน](https://code.claude.com/docs/en/legal-and-compliance) อธิบายการรัน Claude Code ที่ไม่ดัดแปลงในผลิตภัณฑ์ ภายใต้ Commercial Terms โดยต้องคงวิธี authentication ของ binary ให้ครบ ผู้ใช้ลงชื่อด้วยสิทธิ์ของตนและรับผิดชอบค่าใช้จ่ายเอง ข้อความนี้ไม่ได้รับรอง direct-token integration ของแอปอื่น

อย่างไรก็ตาม [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) ยังระบุว่าการเสนอ claude.ai login หรือ rate limits ในผลิตภัณฑ์ third-party ต้องได้รับอนุมัติก่อน จึงต้องแยกการรัน binary ทางการตามเงื่อนไขข้างต้นออกจากการเสนอระบบสมาชิกผ่าน SDK และไม่ถือว่าการมี plugin เป็นการรับรองผลิตภัณฑ์ STeP โดย Anthropic

## Gemini: เส้นทางปัจจุบันคือ Antigravity CLI

Hermes ลบ `google-gemini-cli` และ `google-antigravity` inference providers ผ่าน [PR #50492](https://github.com/NousResearch/hermes-agent/pull/50492) ซึ่ง merge 22 มิถุนายน 2026 จึงไม่ควรใช้คำแนะนำเก่าที่ให้เลือก provider เหล่านี้

[Google FAQ](https://geminicli.com/docs/resources/faq/) ระบุว่าการนำ OAuth ของ Gemini CLI ไปใช้เรียก backend จาก third-party software อาจทำให้บัญชีถูกระงับ; เส้นทางที่ Google ระบุสำหรับ third-party coding agents คือ AI Studio/Vertex API

[ประกาศ Google ที่อัปเดต 2 กันยายน 2026](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals) ระบุว่าตั้งแต่ 18 มิถุนายน 2026 Gemini CLI หยุดรองรับ consumer tiers รวม Google AI Pro/Ultra ผ่าน Login with Google และให้ย้ายไป Antigravity; Standard/Enterprise ยังใช้ได้ เอกสาร authentication ทั่วไปยังมีข้อความตรงข้าม จึงไม่ควรใช้หน้านั้นรับรอง consumer login

[Community plugin antigravity-oauth](https://hermes-agent.nousresearch.com/docs/plugins/antigravity-oauth) ที่เพิ่ม 28 กันยายน 2026 ใช้ `agy` binary ทางการกับบัญชี Antigravity ของผู้ใช้ เป็นคนละวิธีกับ direct OAuth provider ที่ถูกลบ:

```text
hermes plugins install antigravity-oauth
hermes auth add antigravity-oauth
hermes auth status antigravity-oauth
```

Catalog pin คือ `466fafb9b6e8099735d79ed32f97005a477ba144` และระบุว่ารัน native tool ผ่าน Hermes approvals โดย map ชื่อเครื่องมือและ block ตัวที่ไม่มี mapping แต่รอบนี้ยังตรวจโค้ด pin ไม่สำเร็จ จึงยังรับรองไม่ได้ว่าการ block เกิดก่อน native tool ทำงานจริง

ข้อความ credential ใน catalog ขัดกันเอง: กล่าวว่าห้ามคัดลอก แต่ disclosure ระบุ symlink, hardlink หรือ fallback copy token เข้า temporary HOME ไม่ควรยกวิธีจัดการ credential นี้มาใช้ทั้งชุดโดยยังไม่ตรวจ ไม่ได้ล็อกอิน ติดตั้ง หรือทดสอบ plugin กับบัญชีจริงในรอบนี้

## ข้อเสนอสำหรับ STeP

โค้ดปัจจุบันมี adapters แล้ว ไม่ต้องเริ่มใหม่: [Claude follow-up](claude-oauth-followup.md) บันทึก generation ที่เคยผ่าน แต่ feature ยังปิดโดยค่าเริ่มต้น (`STEP_CLAUDE_SUBSCRIPTION`); [ChatGPT follow-up](chatgpt-gemini-oauth-followup.md) บันทึกการตอบจริงผ่าน Codex app-server; [Antigravity adapter](antigravity-adapter.md) ยังหยุดก่อนส่ง prompt เพราะ init ไม่ยืนยันว่า native tools ถูกปิด จุดพัฒนาหลักของ Gemini คือพิสูจน์ enforcement ของ permissions หรือ tool interception ก่อนปรับ gate ไม่ใช่เพียงทำ OAuth ใหม่

ถ้าต้องใช้บัญชีสมาชิกเดิม ให้ใช้ local CLI adapters ที่แยกจาก API-key providers: Claude Code, Codex และ Antigravity (`agy`) เจ้าของบัญชีล็อกอินกับเครื่องมือทางการเอง การเลือก OAuth ต้องไม่เงียบเปลี่ยนไป API billing เมื่อผิดพลาด ก่อนใช้งานจริงต้องพิสูจน์ข้อความทดสอบสั้น, JSON/streaming, cancel, native-tool isolation และ rate-limit ของ CLI รุ่นที่ติดตั้ง โดยไม่บันทึก credential ใน repo ประวัติการทดสอบใน STeP ต้องแยกจากการยืนยันกับบริการปัจจุบัน; รายงานนี้ไม่ได้ทำ live acceptance ใหม่

หากต้องการ OAuth หนึ่งบัญชีเข้าถึงโมเดลทั้งสามค่ายใน Hermes โดยตรง ให้พิจารณา [Nous Portal](https://hermes-agent.nousresearch.com/docs/integrations/nous-portal) ซึ่งเป็นสมาชิกแยก
