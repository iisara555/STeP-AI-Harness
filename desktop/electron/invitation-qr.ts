import QRCode from 'qrcode';
import { resolveInvitation, type InvitationPresentation } from '../src/invitation';

export type InvitationQr = { label: string; bytes: Buffer };
export async function invitationQrs(value: InvitationPresentation): Promise<InvitationQr[]> {
  const links = resolveInvitation(value);
  const result: InvitationQr[] = [];
  for (const [key, label] of [
    ['rsvpUrl', 'ตอบรับเข้าร่วมงาน'],
    ['venueUrl', 'แผนที่สถานที่จัดงาน'],
  ] as const) {
    if (!links[key]) continue;
    const data = await QRCode.toDataURL(links[key], { errorCorrectionLevel: 'M', margin: 4, width: 512 });
    result.push({ label, bytes: Buffer.from(data.slice(data.indexOf(',') + 1), 'base64') });
  }
  return result;
}
