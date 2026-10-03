---
name: team-weekly-review
description: สกัดและจัดโครงสร้างข้อมูลจากบันทึกประชุม ตารางงาน Spreadsheet เอกสาร หรือภาพของทีม STeP ให้เป็น Weekly Review ที่ตรวจสอบย้อนกลับได้ โดยแยก Update, Action Item, Decision, Handoff, Dependency, Risk และ Milestone พร้อมระบุหลักฐาน ความไม่แน่นอน และข้อมูลที่ต้องให้มนุษย์ยืนยัน
standardVersion: 2
---

# STeP Weekly Review

## Purpose

เปลี่ยนหลักฐานการทำงานของทีมให้เป็นรายงานสถานะที่อ่านง่ายและตรวจสอบย้อนกลับไปยังต้นทางได้

Skill นี้มีหน้าที่ **อ่าน วิเคราะห์ และจัดโครงสร้าง** ไม่ใช่ดำเนิน action ในระบบภายนอก

## เมื่อควรใช้

- สรุปความคืบหน้าประจำสัปดาห์ของทีม
- รวมข้อมูลจากหลายแหล่ง เช่น บันทึกประชุม ตารางงาน และเอกสาร
- ต้องการรายการที่ต้องให้คนยืนยันก่อนรายงานต่อ

**Anti-trigger:**
- สรุปการประชุมครั้งเดียว → `meeting-summary`
- รายงานสถานะต่อผู้บริหาร → `executive-status-update`
- ตั้งเป้าหมายรายไตรมาส → `innovation-okr-mapping`

## Inputs

รองรับ: meeting notes, spreadsheet, weekly planning table, project update, PDF หรือเอกสาร, screenshot หรือภาพ

ถ้า Owner, Deadline, Status หรือข้อมูลสำคัญไม่มี ให้ใช้ `ยังไม่ระบุ` หรือ `รอยืนยัน`

## Source

- ใช้เฉพาะข้อมูลที่มีหลักฐานในไฟล์หรือภาพที่ผู้ใช้ให้มา
- รักษาชื่อ วันที่ รหัส และตัวเลขตามต้นฉบับ
- ถ้าอ่านจากภาพไม่ชัด ให้คงความไม่แน่นอนไว้ ไม่เดาข้อความ

## Workflow

1. ระบุทีม โครงการ ช่วงเวลา และแหล่งข้อมูล
2. ดึงเฉพาะข้อมูลที่มีหลักฐาน
3. จำแนกเป็น Information, Update, Action Item, Decision, Handoff, Dependency, Risk และ Milestone
4. รักษาชื่อ วันที่ รหัส และตัวเลขตามต้นฉบับ
5. ระบุ Confidence: สูง ปานกลาง หรือต่ำ
6. ถ้าข้อมูลสำคัญไม่มี ให้ใช้ `ยังไม่ระบุ` หรือ `รอยืนยัน`
7. แสดง Conflict เมื่อแหล่งข้อมูลขัดกัน
8. สรุปรายการที่ต้องให้มนุษย์ยืนยัน

## Output

### Review Context
ทีม, โครงการ, ช่วงเวลา, แหล่งข้อมูล, ความมั่นใจโดยรวม

### Updates
| Workstream | Update | Status | Evidence | Confidence |

### Action Items
| งาน | Owner | Status | Deadline | Dependency | Evidence | Confidence |

### Decisions
| Decision | Evidence | Confidence |

### Handoffs
| From | To | Deliverable | Missing Information | Evidence | Confidence |

### Risks / Dependencies
| Item | Type | Impact | Evidence | Confidence |

### Human Confirmation
Missing owner, Missing deadline, Conflicting status, Unclear approval, Unclear text หรือ OCR และรายการค้างอื่น

## Authority

AI ช่วยได้: อ่าน จัดโครงสร้าง และระบุสิ่งที่ยังไม่ยืนยัน

ต้องให้มนุษย์ตัดสิน:
- การมอบหมายงานและกำหนดเส้นตายที่ยังไม่ได้ตกลง
- การรับรองสถานะงานเพื่อรายงานต่อผู้บริหาร
- การดำเนินการในระบบภายนอก เช่น สร้างหรือแก้ไขงานในเครื่องมือจัดการงาน

## Handoff

- สรุปการประชุมครั้งเดียว → `meeting-summary`
- รายงานต่อผู้บริหาร → `executive-status-update`
- งานที่ต้องแตกเป็นแผนโครงการ → `project-plan`
- ตัวชี้วัดของทีม → `quality-objective-kpi-review` หรือ `innovation-okr-mapping`

พร้อมส่งต่อเมื่อ: ทุกข้อสรุปมีหลักฐานอ้างอิง และรายการที่ต้องให้คนยืนยันถูกแยกไว้

## Guardrails

- ห้ามแต่ง Owner และห้ามแต่ง Deadline
- ห้ามถือว่า Planning เท่ากับ Completed
- ห้ามถือว่า Mention เท่ากับ Decision
- ห้ามถือว่าคนที่ถูกกล่าวถึงคือเจ้าของงาน
- หากข้อมูลขัดกันให้แสดง Conflict
- หากอ่านไม่ชัดให้คงความไม่แน่นอน
- ทุกข้อสรุปสำคัญต้องย้อนกลับไปหาหลักฐานได้
