import { generateKeyPairSync, sign, createHash } from 'node:crypto';
export function httpsFixture() {
  // A generated one-use certificate, trusted only by this isolated test app and origin.
  const der = (tag, value) => {
    const b = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const length =
      b.length < 128
        ? Buffer.from([b.length])
        : (() => {
            const bytes = [];
            let n = b.length;
            while (n) {
              bytes.unshift(n & 255);
              n >>= 8;
            }
            return Buffer.from([128 + bytes.length, ...bytes]);
          })();
    return Buffer.concat([Buffer.from([tag]), length, b]);
  };
  const seq = (...items) => der(0x30, Buffer.concat(items));
  const algorithm = Buffer.from('300d06092a864886f70d01010b0500', 'hex');
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const name = seq(der(0x31, seq(Buffer.from('0603550403', 'hex'), der(0x0c, 'synthetic.local'))));
  const validity = seq(der(0x17, '240101000000Z'), der(0x17, '300101000000Z'));
  const extensions = der(0xa3, seq(seq(Buffer.from('0603551d11', 'hex'), der(0x04, seq(der(0x87, Buffer.from([127, 0, 0, 1])))))));
  const tbs = seq(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    algorithm,
    name,
    validity,
    name,
    pair.publicKey.export({ type: 'spki', format: 'der' }),
    extensions,
  );
  const certDer = seq(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), sign('RSA-SHA256', tbs, pair.privateKey)])));
  const cert =
    '-----BEGIN CERTIFICATE-----\n' +
    certDer
      .toString('base64')
      .match(/.{1,64}/g)
      .join('\n') +
    '\n-----END CERTIFICATE-----\n';
  const fingerprint = createHash('sha256').update(certDer).digest('hex').toUpperCase().match(/../g).join(':');
  return { cert, fingerprint, key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
