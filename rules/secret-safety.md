# Secret Safety

- ห้ามเขียน token, password, API key, private key, cookie หรือ recovery code ลง Skill, Rule, Doc, Learning, MCP หรือ Git history
- ใน `mcp/mcp.yaml` ให้ใช้ `${ENV_VAR}` เท่านั้น
- ก่อน commit ให้ตรวจ diff และรัน `python3 scripts/validate_repo.py`
- ถ้าพบ Secret ให้หยุดงาน แจ้งเจ้าของระบบ และเปลี่ยนหรือเพิกถอน Secret นั้นก่อนดำเนินการต่อ

