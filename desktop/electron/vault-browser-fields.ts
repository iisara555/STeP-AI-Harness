/** Runs only in the isolated browser host world. This is not a model evaluation primitive. */
export const vaultFieldsScript = `
const visible = el => el.isConnected && !el.disabled && !el.readOnly && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
const candidates = [...document.querySelectorAll('input,textarea,select')].filter(visible);
const patterns = kind === 'address' ? {
  address_line1: /address-line1|address.?line.?1|street-address|\\bstreet\\b/i, address_line2: /address-line2|address.?line.?2|\\b(apt|suite|unit)\\b/i,
  city: /address-level2|city|town/i, state: /address-level1|state|province/i,
  postal_code: /postal-code|postal.?code|zip/i, country: /country/i
} : { code: /one-time-code|otp|totp|verification.?code|security.?code|(^|[ _-])code($|[ _-])/i };
const fields = [];
for (const [name, pattern] of Object.entries(patterns)) {
  const matches = candidates.filter(el => pattern.test([el.autocomplete,el.name,el.id,el.getAttribute('aria-label'),el.getAttribute('placeholder'),...[...(el.labels||[])].map(label=>label.textContent)].join(' ')));
  if (kind === 'code' && matches.length > 1) {
    const form = matches[0].form;
    if (![6,7,8].includes(matches.length) || matches.some((el,index) => el.maxLength !== 1 || el.form !== form || candidates.indexOf(el)!==candidates.indexOf(matches[0])+index)) throw new Error('VAULT_FORM_UNSUPPORTED');
    matches.forEach((el,index) => fields.push({name:'code',el,index}));
  } else if (matches.length === 1) fields.push({name,el:matches[0]});
  else if (matches.length > 1) throw new Error('VAULT_FORM_UNSUPPORTED');
}
if (!fields.length || fields.some(({el}) => el.form && new URL(el.form.action || location.href,location.href).origin !== location.origin)) throw new Error('VAULT_FORM_UNSUPPORTED');
const fingerprint = JSON.stringify(fields.map(({name,el,index}) => [name,index,el.outerHTML,el.form?.action]));
`;
