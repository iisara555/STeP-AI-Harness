# Secret Safety

- ห้ามเขียน token, password, API key, private key, cookie, MFA code หรือ recovery code ลง Skill, Rule, Doc, Learning, MCP, USER.md, MEMORY.md, output/, log หรือ Git history
- `.env` ใช้เก็บ **non-secret configuration และ credential reference เท่านั้น** ไม่ใช้เก็บ plaintext password/token
- Secret สำหรับ Browser ให้เก็บใน OS/browser credential store เมื่อรองรับ และให้ `.env` อ้างด้วย `STEP_BROWSER_CREDENTIAL_REF`
- local browser profile/session ต้องอยู่ใต้ `.step-ai/` หรือพื้นที่ local ที่ gitignore และห้าม export โดยพลการ
- ใน `mcp/mcp.yaml` ให้ใช้ `${ENV_VAR}` เท่านั้น
- ก่อน commit ให้ตรวจ diff และรัน `python3 scripts/validate_repo.py`
- ถ้าพบ Secret ให้หยุดงาน แจ้งเจ้าของระบบ และเปลี่ยนหรือเพิกถอน Secret นั้นก่อนดำเนินการต่อ

ดูเพิ่ม: `rules/browser-credential-safety.md`
