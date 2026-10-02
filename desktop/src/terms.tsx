import { t } from './i18n';

/**
 * The usage terms each employee accepts once, on the last setup step or at the first send. With the organization's
 * checks off (the default), these terms are what keeps personal data and approvals with people.
 */
export function Terms({
  privacyChecks,
  accepted,
  onChange,
}: {
  privacyChecks: boolean;
  accepted: boolean;
  onChange: (accepted: boolean) => void;
}) {
  return (
    <div className="terms" aria-label={t('ข้อตกลงการใช้งาน')}>
      <p className="terms-title">{t('ข้อตกลงการใช้งาน')}</p>
      <ul>
        <li>
          {t('ข้อความ ไฟล์ และรูปที่คุณส่งจะไปถึงผู้ให้บริการ AI ที่เชื่อมไว้ (เช่น Google, OpenAI, Anthropic) ตามที่พิมพ์')}
          {privacyChecks
            ? t(' ระบบช่วยบล็อกรหัสผ่านและปิดบังเลขบัตรประชาชนที่ตรวจพบ แต่ตรวจไม่ได้ทุกกรณี')
            : t(' ระบบไม่ได้ตรวจหรือปิดบังข้อมูลให้')}
        </li>
        <li>
          {t(
            'ห้ามส่งรหัสผ่าน API key เลขบัตรประชาชน เลขบัญชี ข้อมูลสุขภาพ เงินเดือน หรือข้อมูลส่วนบุคคลของผู้อื่นที่ไม่จำเป็นต่องาน ตาม PDPA และระเบียบของมหาวิทยาลัย ผู้ส่งรับผิดชอบข้อมูลที่ส่งเอง',
          )}
        </li>
        <li>
          {t(
            'AI ช่วยร่าง สรุป และค้นข้อมูลเท่านั้น การอนุมัติ ลงนาม ส่งเอกสาร ออกเลขหนังสือ หรือโอนเงิน ต้องทำเองผ่านระบบและผู้มีอำนาจตามระเบียบ',
          )}
        </li>
        <li>{t('ตรวจข้อเท็จจริง ตัวเลข ชื่อ และการอ้างอิงในคำตอบทุกครั้งก่อนนำไปใช้ คุณเป็นผู้รับผิดชอบงานที่ส่งออกไป')}</li>
        <li>{t('ประวัติการสนทนาเก็บในเครื่องนี้ ส่วนข้อมูลที่ส่งให้ผู้ให้บริการ AI อยู่ภายใต้เงื่อนไขของบัญชีที่เชื่อมไว้')}</li>
      </ul>
      <label className="terms-accept">
        <input type="checkbox" checked={accepted} onChange={e => onChange(e.target.checked)} />
        <span>{t('ฉันอ่านและรับทราบข้อตกลงการใช้งาน')}</span>
      </label>
    </div>
  );
}
