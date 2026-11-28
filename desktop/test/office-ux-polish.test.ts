import test from 'node:test';
import assert from 'node:assert/strict';
import { isClarifyingQuestionReply } from '../electron/answer-review';
import { shouldRunModelSkillSelection } from '../electron/skill-selection';
import { shouldOfferChartHint } from '../electron/service';

test('[P0-3] isClarifyingQuestionReply skips redundant review on short intake questions while keeping drafts reviewed', () => {
  assert.equal(isClarifyingQuestionReply('ขอข้อมูลเพิ่มเติมก่อนเริ่มร่างครับ: กิจกรรมจัดวันที่เท่าไร และมีผู้เข้าร่วมกี่คนครับ?'), true);
  assert.equal(isClarifyingQuestionReply('ต้องการให้สรุปแบบสั้นหรือแบบรายงานการประชุมเต็มฉบับดีครับ'), true);

  // Real deliverables / partial drafts must NEVER be skipped
  assert.equal(isClarifyingQuestionReply('บรีฟร่างแรก ยังไม่มีขนาดชิ้นงาน'), false);
  assert.equal(isClarifyingQuestionReply('## บรีฟงานออกแบบ\n- กลุ่มเป้าหมาย: ผู้ประกอบการ\nต้องการปรับเพิ่มเติมไหมครับ?'), false);
  assert.equal(isClarifyingQuestionReply('| รายการ | งบประมาณ |\n| --- | --- |\n| ค่าวิทยากร | 3,600 |\nถูกต้องไหมครับ?'), false);
});

test('[P0-3] shouldRunModelSkillSelection fast-paths trivial acknowledgements and public lookups without deliverable cues', () => {
  const weakRoute = { ranked: [{ score: 0.25 }], candidateSkills: [{ score: 0.25 }] };
  assert.equal(shouldRunModelSkillSelection(weakRoute, 'ขอบคุณครับ', '', false), false);
  assert.equal(shouldRunModelSkillSelection(weakRoute, 'วันหยุดราชการเดือนธันวาคมมีวันไหนบ้าง', '', false), false);
  assert.equal(shouldRunModelSkillSelection(weakRoute, 'พยากรณ์อากาศวันนี้เชียงใหม่', '', false), false);
  // Real work requests still run selection
  assert.equal(shouldRunModelSkillSelection(weakRoute, 'ช่วยร่างบันทึกข้อความขออนุมัติจัดอบรม', '', false), true);
  assert.equal(shouldRunModelSkillSelection(weakRoute, 'ช่วยสรุปไฟล์นี้หน่อย', 'แนบไฟล์แล้ว', false), true);
});

test('[P1-2] shouldOfferChartHint triggers for spreadsheet files, host-computed stats, and chart/trend queries', () => {
  assert.equal(shouldOfferChartHint('สรุปข้อมูลให้หน่อย', [{ name: 'งบประมาณ_2569.xlsx' }]), true);
  assert.equal(shouldOfferChartHint('ดูยอดรวมที', [{ name: 'sales.csv' }]), true);
  assert.equal(shouldOfferChartHint('ช่วยดูหน่อย', [], 'สรุปสถิติตัวเลขที่ระบบคำนวณจากข้อมูลจริง\n- งบ: 250,000'), true);
  assert.equal(shouldOfferChartHint('ช่วยทำกราฟเปรียบเทียบยอดขายรายไตรมาส', []), true);
  assert.equal(shouldOfferChartHint('เปรียบเทียบงบประมาณแต่ละเดือนให้หน่อย', []), true);
  // Ordinary text questions do not get chart clutter
  assert.equal(shouldOfferChartHint('ขอวันลาพักร้อนของพนักงานประจำ', []), false);
  assert.equal(shouldOfferChartHint('ช่วยแปลประโยคนี้เป็นภาษาอังกฤษ', []), false);
});
