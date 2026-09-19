# Skill Quality Baseline — 2026-09-20

สถานะ: development baseline หลังเพิ่ม `step-skill-authoring`

## Scope

- Registered Skills: **45**
- Lifecycle evidence: **approved 0 / pilot 44 / draft 1**
- `approvedBy` is treated as the required approval role, not proof that owner approval occurred
- Routable user-facing Skills: **44** + `step-router`
- Directly represented in model-side 30-task benchmark: **26**
- Not directly represented in that benchmark: **19**

การอยู่ในกลุ่ม 19 ตัว **ไม่ได้แปลว่าไม่มี test**; หลายตัวมี routing/authority regression อยู่แล้ว แต่ยังไม่มี direct model-side benchmark case ใน `pilot-30-v1`.

Machine-readable source: `manifest/skill-evals.json`

## Hardening completed in this change

- เพิ่ม STeP-native `step-skill-authoring`
- เพิ่ม `skill-to-pilot` Playbook
- Source-drive `tor-review`, `tor-government-writing`, `receipt-audit`
- เสริม contract ให้ `meeting-summary`, `github-workflow`, `vercel-deploy`
- เพิ่ม local Skill dependency validation
- ระบุ missing current finance source แทนการ hard-code policy

## Next evaluation work

ขยาย model-side benchmark แบบ incremental โดยเริ่มจาก:
1. step-skill-authoring
2. meeting-summary
3. innovation-okr-mapping
4. github-workflow / vercel-deploy
5. creative-art-director / step-image-prompt
6. industry-problem-discovery / expert-resource-matching / market-signal-radar

ไม่จำเป็นต้องเพิ่ม 19 เคสในครั้งเดียว; ให้เพิ่มจาก usage จริงและ regression ที่พบ
