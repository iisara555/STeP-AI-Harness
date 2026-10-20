import { consentPreview } from './consent-preview';
import { tm } from './i18n';

/** Presentation uses only the privacy-reviewed payload; the host sends that same payload after consent. */
export function googleResultConsent(operation: string, reviewed: string, provider: string, account: string) {
  const value = JSON.parse(reviewed);
  const data = value?.data ?? value;
  const calendar =
    operation === 'calendar.events' && Array.isArray(data?.items) && data.items.every((item: unknown) => item && typeof item === 'object');
  const preview = calendar
    ? [
        tm('รายการในปฏิทิน {0} รายการ', data.items.length),
        ...data.items
          .slice(0, 30)
          .map((item: any, index: number) =>
            [
              `${index + 1}. ${item.summary || tm('ไม่ระบุชื่อ')}`,
              item.eventType === 'workingLocation' ? tm('สถานที่ทำงาน (ไม่ใช่นัดประชุม)') : '',
              item.start ? tm('เริ่ม: {0}', item.start.dateTime || item.start.date || '') : '',
              item.end ? tm('สิ้นสุด: {0}', item.end.dateTime || item.end.date || '') : '',
              item.location ? tm('สถานที่: {0}', item.location) : '',
              item.description ? tm('รายละเอียด: {0}', item.description) : '',
            ]
              .filter(Boolean)
              .join('\n'),
          ),
      ].join('\n\n')
    : consentPreview(JSON.stringify(data));
  return {
    body: tm('ข้อมูลและรายละเอียดประกอบจาก Google จะส่งให้ AI ที่ระบุเมื่อคุณอนุญาต ตรวจตัวอย่างก่อนส่งได้ด้านล่าง'),
    facts: [
      { label: tm('AI ปลายทาง'), value: provider },
      { label: tm('บัญชี Google'), value: account },
      { label: tm('งานที่ขอ'), value: operation === 'calendar.events' ? tm('อ่านรายการในปฏิทิน') : operation },
    ],
    preview: preview.slice(0, 8000) + '\n\n' + tm('ตัวอย่างอาจแสดงข้อมูลบางส่วน รายละเอียดประกอบอยู่ในรายละเอียดสำหรับผู้ดูแล'),
    technical: reviewed.slice(0, 16000),
  };
}
