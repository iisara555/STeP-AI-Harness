import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryStepRouter } from '../src/modules/router/service.js';

const route = async (query, conversational = false) =>
  (await queryStepRouter(query, { team: 'cc', conversational })).routingContract;

test('a request to work in STeP MIS becomes general help for the host browser, in chat and in drafts', async () => {
  for (const query of ['เปิด STeP MIS ให้หน่อย', 'ช่วยหาแบบฟอร์ม ISO ล่าสุดใน STeP MIS', 'เข้า MIS ดูรายงานขอความเห็นชอบของฉัน']) {
    for (const conversational of [false, true]) {
      const contract = await route(query, conversational);
      assert.equal(contract.mode, 'GENERAL', `${query} (${conversational ? 'chat' : 'draft'})`);
      assert.equal(contract.authority.status, 'ALLOW');
    }
  }
});

test('approving in MIS is still blocked', async () => {
  assert.equal((await route('อนุมัติรายการใน MIS ให้หน่อย')).authority.status, 'BLOCK');
});
