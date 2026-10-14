export const credentialTitles: Record<string, readonly [string, string]> = {
  'Connect Google Workspace?': ['เชื่อมบัญชี Google Workspace นี้?', 'Connect Google Workspace?'],
  'Change Google data?': ['แก้ข้อมูลใน Google ตามรายการนี้?', 'Change Google data?'],
  'Read Google data?': ['อ่านข้อมูลจาก Google ในงานนี้?', 'Read Google data?'],
  'Revoke Google authorization?': ['เพิกถอนสิทธิ์ที่ Google?', 'Revoke Google authorization?'],
  'Disconnect locally?': ['เลิกเชื่อมบัญชีนี้ในเครื่อง?', 'Disconnect locally?'],
  'Fill account once?': ['กรอกบัญชีนี้ครั้งเดียว?', 'Fill account once?'],
  'Delete this account from this device?': ['ลบบัญชีนี้จากเครื่อง?', 'Delete this account from this device?'],
  'Resume reading this website?': ['กลับมาอ่านเว็บไซต์นี้ต่อ?', 'Resume reading this website?'],
  'Check the page for credentials and private information before allowing AI to read it.': [
    'ตรวจว่าหน้าเว็บไม่มีรหัสผ่านหรือข้อมูลส่วนบุคคลที่ไม่ต้องการส่ง ก่อนอนุญาตให้ AI อ่าน',
    'Check the page for credentials and private information before allowing AI to read it.',
  ],
  'Send this Google result to the selected AI?': [
    'ส่งข้อมูลจาก Google ชุดนี้ให้ AI ที่เลือก?',
    'Send this Google result to the selected AI?',
  ],
};
const errors: Record<string, readonly [string, string]> = {
  VAULT_LOGIN_ATTEMPT_CHANGED: [
    'หน้าล็อกอินสองขั้นต้องใช้บัญชีเดิม หากข้อมูลเปลี่ยนหรือหมดเวลา ให้เริ่มล็อกอินใหม่',
    'A two-step login must use the same account. Restart login if the credential changes or the attempt expires.',
  ],
  VAULT_SHARED_DEVICE: [
    'เครื่องนี้ถูกกำหนดว่าใช้ร่วมกัน จึงไม่อนุญาตให้จำข้อมูลบัญชี',
    'This device is designated as shared. Credential persistence is disabled.',
  ],
  VAULT_HOST_EXECUTION_BLOCKED: [
    'มีข้อมูลใน Vault จึงปิดการรันคำสั่งและเครื่องมือในเครื่องเพื่อป้องกันรหัสผ่าน การพัก Vault ไม่เปิดสิทธิ์กลับ',
    'Stored Vault data blocks host commands and local executable tools. Pausing Vault keeps that protection.',
  ],
  VAULT_EXECUTION_CONFLICT: [
    'จบงานที่กำลังรันก่อนเพิ่มข้อมูลใน Vault และให้ผู้ดูแลตรวจ command hooks หรือ MCP ที่รันในเครื่อง',
    'Finish active work before storing credentials, and ask the administrator to review command hooks or local MCP executables.',
  ],
  VAULT_UNAVAILABLE: [
    'ระบบกุญแจของเครื่องไม่พร้อม ข้อมูลที่เข้ารหัสยังถูกเก็บไว้',
    'The OS key store is unavailable. Encrypted data is preserved.',
  ],
  VAULT_SUSPENDED: ['พักการใช้ Vault อยู่ กลับมาเปิดใช้ใน Settings ก่อน', 'Vault is paused. Resume it in Settings.'],
  VAULT_ACCESS_DENIED: [
    'สิทธิ์ใช้ข้อมูลบัญชีหมดอายุหรือไม่ตรงกับงานนี้ กรุณาเลือกบัญชีใหม่',
    'The credential grant expired or does not match this task. Select the account again.',
  ],
  VAULT_ORIGIN_INVALID: [
    'ใช้เว็บไซต์แบบ HTTPS โดยระบุเฉพาะ origin ไม่มี path หรือข้อมูลบัญชีใน URL',
    'Use an HTTPS origin without a path or credentials in the URL.',
  ],
  VAULT_ORIGIN_CHANGED: [
    'เว็บไซต์หรือหน้าเข้าสู่ระบบเปลี่ยน กรุณาตรวจหน้าใหม่ก่อนกรอก',
    'The website or login page changed. Review it again before filling.',
  ],
  VAULT_FORM_UNSUPPORTED: [
    'ฟอร์มนี้ตรวจช่องหรือปลายทางไม่ได้แน่นอน กรุณาลงชื่อด้วยตัวเอง',
    'The form fields or destination cannot be verified. Sign in manually.',
  ],
  VAULT_REVISION_CHANGED: [
    'บัญชีหรือสิทธิ์เปลี่ยนระหว่างรอ กรุณาเลือกและยืนยันใหม่',
    'The account or permission changed while waiting. Select and confirm again.',
  ],
  VAULT_INTEGRITY_ERROR: [
    'ข้อมูลเข้ารหัสไม่ผ่านการตรวจ ข้อมูลเดิมยังอยู่ กรุณาให้ผู้ดูแลตรวจ',
    'Encrypted data failed integrity verification. It is preserved for administrator review.',
  ],
  VAULT_OUTCOME_UNKNOWN: [
    'ยังไม่ทราบว่ากรอกไปแล้วหรือไม่ ตรวจหน้าเว็บก่อนลองใหม่',
    'The fill outcome is unknown. Inspect the page before retrying.',
  ],
  BROWSER_VAULT_SENSITIVE: [
    'หยุดส่งภาพและเนื้อหาหน้านี้ให้ AI ระหว่างใช้บัญชี ตรวจหน้าเว็บแล้วกลับมาเปิดการอ่านใน Settings',
    'Page content and screenshots are withheld during credential use. Review the page and resume reading in Settings.',
  ],
  GOOGLE_NOT_CONFIGURED: [
    'รอผู้ดูแลตั้งค่า OAuth client ID และโดเมน Workspace ที่อนุญาต',
    'An administrator must configure the OAuth client ID and allowed Workspace domains.',
  ],
  GOOGLE_SCOPE_MISSING: [
    'บัญชียังไม่ได้อนุญาตสิทธิ์ที่บริการนี้ต้องใช้ กรุณาเชื่อมใหม่โดยเลือกบริการที่จำเป็น',
    'The required service scope is not granted. Reconnect with the services you need.',
  ],
  GOOGLE_ACCOUNT_CHANGED: [
    'บัญชีหรือการตั้งค่าเปลี่ยนระหว่างทำงาน กรุณาเลือกบัญชีและยืนยันใหม่',
    'The account or configuration changed. Select the account and confirm again.',
  ],
  GOOGLE_REAUTH_REQUIRED: [
    'สิทธิ์ Google หมดอายุหรือถูกเพิกถอน กรุณาลงชื่อใหม่',
    'Google authorization expired or was revoked. Sign in again.',
  ],
  GOOGLE_ACCESS_DENIED: [
    'Google ไม่อนุญาตให้เข้าถึงรายการนี้ ตรวจบัญชี สิทธิ์ไฟล์ และนโยบายขององค์กร',
    'Google denied access. Check the account, resource permissions and organization policy.',
  ],
  GOOGLE_ADMIN_BLOCKED: [
    'ผู้ดูแล Google Workspace ยังไม่อนุญาตแอปหรือบริการนี้',
    'The Workspace administrator has not allowed this app or service.',
  ],
  GOOGLE_CONSENT_DENIED: ['การเชื่อมบัญชีถูกยกเลิก ไม่ได้บันทึกสิทธิ์ใหม่', 'The connection was cancelled. No new grant was stored.'],
  GOOGLE_ORGANIZATION_DENIED: ['บัญชีไม่อยู่ในโดเมน Workspace ที่ผู้ดูแลอนุญาต', 'The account is outside the approved Workspace domains.'],
  GOOGLE_IDENTITY_INVALID: [
    'ตรวจยืนยันบัญชี Google ไม่สำเร็จ ไม่มีการบันทึกข้อมูลบัญชี',
    'Google identity verification failed. No account was stored.',
  ],
  GOOGLE_OUTCOME_UNKNOWN: [
    'ยังยืนยันผลการเปลี่ยนข้อมูลใน Google ไม่ได้ ตรวจต้นทางก่อนทำซ้ำ',
    'The Google write outcome is unknown. Check the source before retrying.',
  ],
  GOOGLE_REVOCATION_FAILED: [
    'เพิกถอนสิทธิ์ที่ Google ไม่สำเร็จ บัญชียังอยู่ ให้ลองใหม่หรือจัดการสิทธิ์ในบัญชี Google',
    'Remote revocation failed. The connection is retained; retry or manage access in Google Account.',
  ],
  GOOGLE_QUOTA_LIMIT: [
    'Google จำกัดการเรียกบริการชั่วคราว กรุณารอและลองใหม่',
    'Google temporarily limited requests. Wait before retrying.',
  ],
  GOOGLE_REQUEST_FAILED: [
    'เชื่อมบริการ Google ไม่สำเร็จ ไม่มีการแสดงข้อมูลส่วนตัวจากข้อผิดพลาด',
    'The Google request failed. Private upstream diagnostics are withheld.',
  ],
};
export const credentialErrorsTh = Object.fromEntries(Object.entries(errors).map(([code, [th]]) => [code, th]));
export const credentialErrorsEn = Object.fromEntries(Object.values(errors).map(([th, en]) => [th, en]));
