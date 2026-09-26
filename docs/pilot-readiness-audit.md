# Pilot Readiness Audit — 1 Month

**As of:** 2026-09-25

**Document status:** Current Pilot readiness reference

**Released distribution baseline:** v0.7.3 (GitHub Release 2026-09-21) · v0.7.4 มี GitHub Release แต่ไม่แจก

**Prepared Pilot candidate:** v0.7.6 (รวม v0.7.5) รอ Release Gate; ยังไม่ใช่คำยืนยันว่าเผยแพร่ GitHub Release แล้ว ดู [CHANGELOG](../CHANGELOG.md)

**Repository scope:** source remains development until released; [Pilot runbook](pilot-runbook.md) governs the supervised session

**Current main inventory:** 50 Skills / 49 router entries / 5 Playbooks / 4 Actions / 22 teams / 5 routing clusters

## Executive Summary

ก่อนเริ่ม Pilot 1 เดือน ระบบต้องผ่าน 6 gates:

1. **Security Gate** — ไม่มี plaintext secret/password ใน repo, output, log หรือ local config ที่ AI อ่านได้
2. **Routing & Governance Gate** — Skill, Router, Process, Authority และ escalation target เชื่อมกันครบ
3. **Human Action Gate** — action ที่มีผลจริง เช่น Submit, Approve, Sign, Pay, Close CAPA ยังคงมี human confirmation/authority
4. **Distribution Gate** — install/update/rollback/output preservation ผ่าน test และ release มี checksum
5. **User Experience Gate** — พนักงานใช้ภาษาไทยธรรมดาได้ ไม่ต้องรู้ Git, Terminal, Skill ID หรือ YAML
6. **Repository Visibility Gate** — ยืนยัน Public/Private model และ distribution channel; ถ้า repo เป็น Public ต้องมีเฉพาะ public-safe tracked content

## Audit Findings & Resolution

### A. Browser Credentials — HIGH → HARDENED

**พบ:** Browser Skill เดิมห้ามเก็บ password ทั้งหมด ทำให้ใช้งานครั้งถัดไปไม่สะดวก แต่การเก็บ password แบบ plaintext ใน `.env` จะสร้างความเสี่ยงใหม่

**ปรับ:** 
- first login ให้ user กรอกเอง
- MFA/CAPTCHA/passkey เป็น user-controlled
- remember login เป็น opt-in
- ใช้ OS/browser credential store หรือ authenticated session เมื่อ runtime รองรับ
- `.env` เก็บ credential reference/config เท่านั้น
- persistent profile อยู่ใต้ `.step-ai/`
- remembered login ไม่ข้าม Submit confirmation

Residual risk: browser/session persistence แตกต่างกันตาม client/runtime จึงต้องมี manual-login fallback เสมอ

### B. Image Prompt Capability — MEDIUM → HARDENED

**พบ:** Skill กำหนด prompt quality ดี แต่ไม่ได้กำหนด capability floor ของ target image model

**ปรับ:** ใช้ Prompt Spec เป็น source of truth แล้วเลือก syntax family ตามความสามารถจริงของเครื่องมือ ไม่ hard-code ชื่อรุ่นโมเดลเป็น Capability Gate โดยตรวจ:
- contextual instruction following
- reference-image understanding
- edit/identity/structure fidelity
- aspect ratio / composition control
- multi-turn refinement
- image input/edit support

ถ้า model ต่ำกว่า capability floor ต้อง downgrade workflow อย่างเปิดเผย ไม่ใช้ Reference-Led mode เสมือนโมเดลเห็นภาพ

### C. Secret Scanner Coverage — HIGH → HARDENED

**พบ:** validator เดิมสแกนเฉพาะ md/yaml/yml/py/txt

**ปรับ:** เพิ่ม js/mjs/cjs/ts/sh/ps1/json/env/example/command/bat และตรวจ `.env.example` policy โดยเฉพาะ

### D. Manifest Dependency Validation — HIGH → HARDENED

**พบ:** validator เดิมยังไม่ตรวจครบตาม comment เช่น router registration, consumer team, escalation target และ physical Skill path

**ปรับ:** CI ต้องตรวจ:
- Skill registry ↔ Router
- owner/team
- process
- mandatory document
- authority
- escalation target
- Skill path / Document path
- duplicate/unroutable skills

### E. Pilot Duration — MEDIUM → REVISED

เอกสารเดิมระบุ Pilot 8 สัปดาห์ ปรับเป็น **4 สัปดาห์** พร้อม weekly gates และ stop conditions

### F. First Run Context Loading — MEDIUM → HARDENED

**พบ:** adapter เดิมแม้ระบุ Progressive Disclosure แต่ instruction ยังแจกแจงรายชื่อ Skill/Rule ทั้งหมด ทำให้ agent บางตัว recursive scan Workspace ตอน onboarding

**ปรับ:** ใช้ L0-only First Run ทุก adapter, Compact Bootstrap และ Installed ≠ Loaded inventory summary; ห้าม scan skills/rules/manifest จนกว่าจะมีงานจริง

## Residual Risks Accepted for 1-Month Pilot

### Privacy document boundary — assisted local preflight

ตรวจพบว่า query gate/log sanitization ไม่เคยตรวจเอกสารแนบ และ `auto-mask` เคยคืนสิทธิ์ส่งออก แก้แล้ว: scanner ทุกผลคืน `canSendToExternalAI=false`, เพิ่ม pattern/English sensitive keywords, ตารางชื่อหรือ label ที่จับค่าไม่ได้ให้คนตรวจ และจำกัด LRU cache 256 รายการ

เพิ่มตัวตรวจบนเครื่องก่อนแนบสำหรับ PDF text layer/DOCX พร้อม helper Windows/macOS และ regression tests ตามกรณีรายงาน ไฟล์อ่านไม่ได้/ไม่รองรับต้องตรวจด้วยคน ไม่มี OCR และไม่แก้เอกสารต้นฉบับ ดู [privacy-preflight.md](privacy-preflight.md)

**ความเสี่ยงคงเหลือ:** AI client ที่รับไฟล์ตรงยังข้ามตัวตรวจนี้ได้ จึงยังไม่ใช่ DLP/upload gateway; Pilot ใช้ข้อมูลสังเคราะห์หรือข้อมูลที่เจ้าของอนุญาตและตรวจด้วยคนก่อนแนบ ยังไม่มีผลวัด recall บน corpus เอกสารจริงหรือหลักฐาน native macOS file picker ในรอบนี้

- Harness ไม่ทำ password vault เอง; secure remembered login ขึ้นกับ browser/runtime/OS
- external websites อาจเปลี่ยน DOM/field/login flow ทำให้ Browser Skill ต้อง fallback เป็น draft/manual
- image model capabilities ต่างกัน จึงต้องใช้ capability gate แทน hardcode provider เดียว
- Router เป็น deterministic heuristic; ต้องติดตาม wrong-route และ false human-block ใน Pilot

## Go / No-Go Gate

**GO** เมื่อ:
- CI / validation / bundle / package checks ผ่าน
- ยืนยัน repository visibility + release/distribution channel และผ่าน public/internal data-boundary review
- current manifest/router/playbook/action integrity ผ่าน (counts derived from manifests; do not hard-code release inventory)
- 0 known plaintext secret ใน distribution
- Browser submit confirmation tests ผ่าน
- update/rollback/output preservation tests ผ่าน
- Pilot scenario suite ผ่านทั้งหมด

**STOP / NO-GO** ทันทีเมื่อพบ:
- password/token/cookie หลุดเข้า Git, output หรือ log
- AI submit/approve/sign/pay โดยไม่มี required confirmation
- update ทำไฟล์ USER.md / MEMORY.md / output/ สูญหาย
- critical Router error ส่งงานไป authority ผิดและเกิด action จริง
- release bundle/checksum ไม่ตรงกัน

## Pre-Pilot Freeze

เมื่อ released Pilot baseline ผ่าน Gate:
- freeze architecture 1 เดือน
- security/data-loss hotfix ทำได้ทันที
- routing/skill wording fixes รวมเป็น weekly batch
- feature ใหม่ที่ไม่จำเป็นต่อ Pilot ให้ defer หลัง Week 4
