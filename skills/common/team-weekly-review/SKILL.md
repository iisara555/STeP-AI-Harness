---
name: team-weekly-review
description: สกัดและจัดโครงสร้างข้อมูลจากบันทึกประชุม ตารางงาน Spreadsheet เอกสาร หรือภาพของทีม STeP ให้เป็น Weekly Review ที่ตรวจสอบย้อนกลับได้ โดยแยก Update, Action Item, Decision, Handoff, Dependency, Risk และ Milestone พร้อมระบุหลักฐาน ความไม่แน่นอน และข้อมูลที่ต้องให้มนุษย์ยืนยัน
---

# STeP Weekly Review

## Purpose

เปลี่ยนหลักฐานการทำงานของทีม STeP ให้เป็นรายงานสถานะที่อ่านง่าย
และสามารถตรวจสอบย้อนกลับไปยังต้นทางได้

Skill นี้มีหน้าที่ "อ่าน วิเคราะห์ และจัดโครงสร้าง"
ไม่ใช่ดำเนิน Action ในระบบภายนอก

## Inputs

รองรับ:
- Meeting notes
- Spreadsheet
- Weekly planning table
- Project update
- PDF / Document
- Screenshot / Image

## Core Workflow

1. ระบุทีม โครงการ ช่วงเวลา และแหล่งข้อมูล
2. ดึงเฉพาะข้อมูลที่มีหลักฐาน
3. จำแนกเป็น:
   - Information
   - Update
   - Action Item
   - Decision
   - Handoff
   - Dependency
   - Risk
   - Milestone
4. รักษาชื่อ วันที่ รหัส และตัวเลขตามต้นฉบับ
5. ระบุ Confidence:
   - สูง
   - ปานกลาง
   - ต่ำ
6. ถ้า Owner, Deadline, Status หรือข้อมูลสำคัญไม่มี
   ให้ใช้ "ยังไม่ระบุ" หรือ "รอยืนยัน"
7. แสดง Conflict เมื่อแหล่งข้อมูลขัดกัน
8. สรุปรายการที่ต้องให้มนุษย์ยืนยัน

## Required Output

### Review Context
- ทีม:
- โครงการ:
- ช่วงเวลา:
- แหล่งข้อมูล:
- ความมั่นใจโดยรวม:

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
- Missing owner:
- Missing deadline:
- Conflicting status:
- Unclear approval:
- Unclear text / OCR:
- Other unresolved items:

## Rules

- ห้ามแต่ง Owner
- ห้ามแต่ง Deadline
- ห้ามถือว่า Planning = Completed
- ห้ามถือว่า Mention = Decision
- ห้ามถือว่า Person Mentioned = Task Owner
- หากข้อมูลขัดกันให้แสดง Conflict
- หากอ่านไม่ชัดให้คงความไม่แน่นอน
- ทุกข้อสรุปสำคัญต้องย้อนกลับไปหาหลักฐานได้