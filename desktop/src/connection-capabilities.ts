import type { Connection, PolicySnapshot } from './types';
import { takesImages } from './vision-transport';

export type Capability = {
  id: string;
  title: string;
  state: 'available' | 'conditional' | 'blocked' | 'unknown';
  reason: string;
  detail: string;
};
const entry = (id: string, title: string, state: Capability['state'], reason: string, detail: string): Capability => ({
  id,
  title,
  state,
  reason,
  detail,
});

/** Display eligibility only. Text connection tests do not establish image-model or external-service entitlement. */
export function connectionCapabilities(c: Connection, policy?: PolicySnapshot): Capability[] {
  const definitions = [
    ['chat', 'คุยและร่างเอกสาร'],
    ['web', 'ค้นเว็บและอ่านหน้าเว็บ'],
    ['vision', 'ให้ AI อ่านภาพ'],
    ['image', 'สร้างภาพ'],
  ];
  if (c.policyBlocked)
    return definitions.map(([id, title]) => entry(id, title, 'blocked', 'policy', 'ติดต่อ IT เพื่อเปิดสิทธิ์การเชื่อมต่อนี้'));
  if (!c.ready) return definitions.map(([id, title]) => entry(id, title, 'blocked', 'connection', 'เชื่อมต่อและทดสอบบัญชีนี้ก่อน'));
  const feature = (name: string) => policy?.features[name];
  const chat = entry('chat', definitions[0][1], 'available', 'tested', 'ผ่านการทดสอบข้อความสั้นแล้ว');
  const web =
    feature('toolLoop') === undefined
      ? entry('web', definitions[1][1], 'unknown', 'unknown', 'ยังไม่ทราบนโยบายเครื่องมือ ติดต่อ IT')
      : feature('toolLoop')
        ? entry('web', definitions[1][1], 'available', 'host', 'ค้นเว็บผ่านเครื่องมือของ STeP ได้หลังคุณอนุญาต')
        : entry('web', definitions[1][1], 'blocked', 'policy', 'ผู้ดูแลปิดเครื่องมือในแชต ติดต่อ IT');
  let vision: Capability;
  if (!takesImages(c.provider))
    vision = entry(
      'vision',
      definitions[2][1],
      'blocked',
      'transport',
      c.provider === 'antigravity'
        ? 'Gemini ผ่าน Antigravity ยังรับภาพไม่ได้ ภาพและ PDF สแกนจะใช้ข้อความ OCR ในเครื่องแทน ถ้าต้องให้ AI ดูภาพเอง เชื่อมต่อ Gemini ด้วย API key, ChatGPT หรือ Claude'
        : 'บัญชีนี้ใช้ข้อความ OCR แทนภาพได้ เลือกบัญชีที่รองรับภาพหากต้องการอ่านภาพ',
    );
  else if (feature('vision') === false) vision = entry('vision', definitions[2][1], 'blocked', 'policy', 'ผู้ดูแลปิดการอ่านภาพ ติดต่อ IT');
  else if (policy?.checks?.privacy)
    vision = entry('vision', definitions[2][1], 'blocked', 'privacy', 'โหมดตรวจข้อมูลขององค์กรไม่ส่งภาพ ใช้ OCR ในเครื่องแทน');
  else if (feature('vision') !== true || policy?.checks?.privacy !== false)
    vision = entry('vision', definitions[2][1], 'unknown', 'unknown', 'ยังไม่ทราบนโยบายการส่งภาพ ติดต่อ IT');
  else
    vision = entry(
      'vision',
      definitions[2][1],
      'conditional',
      'model',
      'เลือกโมเดลที่รองรับภาพ และยินยอมส่งภาพก่อนใช้ ผลทดสอบแชตยังไม่ยืนยันการอ่านภาพ',
    );
  const image =
    c.mode !== 'api' || !['openai', 'gemini'].includes(c.provider)
      ? entry(
          'image',
          definitions[3][1],
          'blocked',
          'api-required',
          'ใช้ OpenAI หรือ Gemini API และโมเดลภาพที่บัญชีมีสิทธิ์ OAuth อย่างเดียวใช้ไม่ได้',
        )
      : !policy
        ? entry('image', definitions[3][1], 'unknown', 'unknown', 'ยังไม่ทราบโหมดการทำงาน ติดต่อ IT')
        : policy.mode === 'plan'
          ? entry('image', definitions[3][1], 'blocked', 'plan', 'ออกจากโหมดวางแผนก่อนสร้างภาพ')
          : entry('image', definitions[3][1], 'conditional', 'model', 'เลือกโมเดลภาพที่บัญชีมีสิทธิ์ การสร้างภาพอาจมีค่าใช้จ่าย API');
  return [chat, web, vision, image];
}

export function organizationCapabilities(policy?: PolicySnapshot): Capability[] {
  const definitions = [
    ['routing', 'ให้ AI เลือก Skill อัตโนมัติ', 'autoRouting'],
    ['mcp', 'เครื่องมือ MCP ขององค์กร', 'mcp'],
    ['coordinator', 'แบ่งงานให้ AI หลายงานย่อย', 'coordinator'],
    ['cron', 'ร่างงานตามรอบ', 'cron'],
    ['privacy', 'การตรวจข้อมูลเพิ่มเติมขององค์กร', 'privacy'],
    ['authority', 'การตรวจอำนาจเพิ่มเติมขององค์กร', 'authority'],
  ];
  return definitions.map(([id, title, flag]) => {
    if (id === 'routing') {
      const tools = policy?.features.toolLoop;
      const routing = policy?.features.autoRouting;
      if (tools === true) return entry(id, title, 'available', 'tools', 'AI ค้นหาและเลือก Skill ที่ตรงกับงาน แล้วโหลดคำแนะนำเมื่อจำเป็น');
      if (routing === true) return entry(id, title, 'available', 'policy', 'ระบบเลือก Skill ที่ตรงกับงานให้ก่อนเริ่มร่าง');
      if (tools !== false || routing !== false) return entry(id, title, 'unknown', 'unknown', 'ยังไม่ทราบนโยบายองค์กร ติดต่อ IT');
    }
    const enabled = ['privacy', 'authority'].includes(id) ? policy?.checks?.[flag as 'privacy' | 'authority'] : policy?.features[flag];
    if (enabled === undefined) return entry(id, title, 'unknown', 'unknown', 'ยังไม่ทราบนโยบายองค์กร ติดต่อ IT');
    if (!enabled)
      return entry(
        id,
        title,
        'blocked',
        'policy',
        id === 'routing'
          ? 'ยังไม่เลือกให้อัตโนมัติ เลือก Skill เองได้จากศูนย์รวม Skill'
          : 'ผู้ดูแลยังไม่เปิดฟังก์ชันนี้ ติดต่อ IT หากต้องใช้',
      );
    if (id === 'mcp') {
      if (policy?.mcpServers === undefined) return entry(id, title, 'unknown', 'unknown', 'ยังไม่ทราบการตั้งค่า MCP server ติดต่อ IT');
      if (!policy.mcpServers) return entry(id, title, 'blocked', 'server-missing', 'ให้ IT ตั้งค่า MCP server ขององค์กรก่อน');
      return entry(id, title, 'conditional', 'consent', 'ทดสอบ server ในงานตามรอบและเครื่องมือเพิ่มเติม สิทธิ์เอกสารต้องยืนยันตอนเรียกใช้');
    }
    if (id === 'coordinator')
      return entry(id, title, 'conditional', 'draft-only', 'ใช้ในโหมดร่างและยืนยันแผนก่อน งานย่อยยังไม่ใช้เครื่องมือ');
    if (id === 'cron') return entry(id, title, 'conditional', 'draft-only', 'ตั้งค่าและยืนยันบัญชีก่อน เป็นงานร่างและทำงานขณะเปิดแอป');
    return entry(id, title, 'available', 'policy', 'เปิดตามนโยบายองค์กรแล้ว');
  });
}
