(function (scope) {
  "use strict";

  const fieldKeys = ["merchant", "receiptNumber", "date", "taxId", "subtotal", "vat", "total"];
  const requiredKeys = ["merchant", "date", "total"];
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";

  function normalizeDigits(value) {
    return String(value ?? "").replace(/[๐-๙]/g, (digit) => String(thaiDigits.indexOf(digit)));
  }

  function normalizeText(value) {
    return normalizeDigits(value).replace(/\s+/g, " ").trim();
  }

  function lineRecords(result) {
    const records = [];
    for (const page of result?.pages || []) {
      if (page.source === "native_pdf_text") {
        for (const text of String(page.text || "").split(/\r?\n/)) {
          if (text.trim()) records.push({ text: text.trim(), page: page.page, confidence: null });
        }
      } else {
        for (const line of page.lines || []) {
          if (String(line.text || "").trim()) {
            records.push({ text: String(line.text).trim(), page: page.page, confidence: line.confidence ?? null, box: line.box || null });
          }
        }
      }
    }
    if (!records.length && result?.text) {
      for (const text of String(result.text).split(/\r?\n/)) {
        if (text.trim()) records.push({ text: text.trim(), page: 1, confidence: null });
      }
    }
    return records;
  }

  function candidate(value, record) {
    return {
      value: normalizeText(value),
      page: record?.page ?? null,
      confidence: record?.confidence ?? null,
      evidence: record?.text ?? "",
    };
  }

  function amountTokens(value) {
    const text = normalizeDigits(value);
    const matches = [...text.matchAll(/(^|[^\d])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?=$|[^\d])/g)];
    return matches.map((match) => match[2]).filter((token) => token.replace(/\D/g, "").length < 11);
  }

  function parseMoney(value) {
    const text = normalizeDigits(value).replace(/[฿\s,]/g, "");
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const amount = Number(text);
    return Number.isFinite(amount) ? amount : null;
  }

  function findAmount(records, include, exclude) {
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      const text = normalizeText(record.text);
      if (!include.test(text) || (exclude && exclude.test(text))) continue;
      const tokens = amountTokens(text);
      if (tokens.length) return candidate(tokens[tokens.length - 1], record);
    }
    return candidate("", null);
  }

  function findDate(records) {
    const pattern = /(?:^|[^\d])((?:19|20|25)\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))(?=$|[^\d])/;
    const ranked = [...records].sort((a, b) => Number(/วันที่|date/i.test(b.text)) - Number(/วันที่|date/i.test(a.text)));
    for (const record of ranked) {
      const match = normalizeText(record.text).match(pattern);
      if (match) return candidate(match[1], record);
    }
    return candidate("", null);
  }

  function findTaxId(records) {
    const buyerMarker = /ชื่อลูกค้า|ชื่อผู้ซื้อ|ข้อมูลผู้ซื้อ|ข้อมูลลูกค้า|\bcustomer\b|\bbuyer\b|\bbill\s*to\b/i;
    const buyerStart = records.findIndex((record) => buyerMarker.test(record.text));
    const sellerRecords = buyerStart < 0 ? records : records.slice(0, buyerStart);
    const buyerRecords = buyerStart < 0 ? [] : records.slice(buyerStart);
    const taxIdPattern = /(?:^|[^\d])((?:\d[\s-]?){12}\d)(?=$|[^\d])/;
    const ranked = [...sellerRecords].sort((a, b) => Number(/ผู้เสียภาษี|tax\s*(id|no)/i.test(b.text)) - Number(/ผู้เสียภาษี|tax\s*(id|no)/i.test(a.text)));
    const buyerIdExcluded = buyerRecords.some((record) => taxIdPattern.test(normalizeDigits(record.text)));
    for (const record of ranked) {
      const normalized = normalizeDigits(record.text);
      const match = normalized.match(taxIdPattern);
      if (match) return { field: candidate(match[1].replace(/\D/g, ""), record), buyerIdExcluded };
    }
    return { field: candidate("", null), buyerIdExcluded };
  }

  function findTotal(records) {
    const marker = /ยอดสุทธิ|รวมทั้งสิ้น|ยอดรวม|รวมเงิน|จำนวนเงิน|grand\s*total|\btotal\b|net\s*amount|amount\s*due|^รวม$/i;
    for (let index = records.length - 1; index >= 0; index--) {
      const record = records[index];
      const text = normalizeText(record.text);
      if (!marker.test(text) || /subtotal|sub\s*total|vat|ภาษีมูลค่าเพิ่ม/i.test(text)) continue;
      const tokens = amountTokens(text);
      if (tokens.length) return candidate(tokens[tokens.length - 1], record);

      const box = record.box;
      if (!box) continue;
      const centerY = (box[1] + box[3]) / 2;
      const matches = records.filter((other) => {
        if (other === record || other.page !== record.page || !other.box || parseMoney(other.text) === null) return false;
        const otherCenterY = (other.box[1] + other.box[3]) / 2;
        const tolerance = Math.max(30, (Math.max(box[3] - box[1], other.box[3] - other.box[1]) * 1.25));
        return Math.abs(centerY - otherCenterY) <= tolerance && other.box[0] >= box[2] - 12;
      });
      if (matches.length) {
        const amount = matches.sort((a, b) => b.box[0] - a.box[0])[0];
        return candidate(amount.text, amount);
      }
    }
    return candidate("", null);
  }

  function findReceiptNumber(records) {
    const marker = /เลขที่ใบเสร็จ|เลขที่เอกสาร|receipt\s*(?:no\.?|number|#)|invoice\s*(?:no\.?|number|#)/i;
    for (const record of records) {
      const text = normalizeText(record.text);
      const match = text.match(marker);
      if (!match) continue;
      const trailing = text.slice(match.index + match[0].length).replace(/^[\s:#.-]+/, "").trim();
      if (trailing && trailing.length <= 48) return candidate(trailing, record);
    }
    return candidate("", null);
  }

  function findMerchant(records) {
    const generic = /^(ใบเสร็จรับเงิน|ใบกำกับภาษี|ใบรับเงิน|receipt|tax invoice|invoice|ต้นฉบับ|สำเนา)$/i;
    const label = /วันที่|date|เลขที่|ผู้เสียภาษี|tax\s*id|vat|subtotal|total|ยอดรวม|ยอดสุทธิ|โทร|tel\.?|www\.|http|sample|test only|ข้อมูลสมมติ|ห้ามใช้เบิกจ่าย|ลูกค้า|ผู้ซื้อ|customer|buyer/i;
    const merchantHint = /ร้าน|บริษัท|ห้างหุ้นส่วน|หจก\.?|จำกัด|\b(?:co\.?|ltd\.?|company|store|shop)\b/i;
    const plausible = [];
    for (const record of records.slice(0, 8)) {
      const text = normalizeText(record.text);
      if (text.length < 3 || text.length > 85 || generic.test(text) || label.test(text) || /^\d/.test(text)) continue;
      plausible.push(record);
    }
    const chosen = plausible.find((record) => merchantHint.test(normalizeText(record.text))) || plausible[0];
    if (chosen) return candidate(chosen.text, chosen);
    return candidate("", null);
  }

  function extractReceipt(result) {
    const records = lineRecords(result);
    const taxId = findTaxId(records);
    const fields = {
      merchant: findMerchant(records),
      receiptNumber: findReceiptNumber(records),
      date: findDate(records),
      taxId: taxId.field,
      subtotal: findAmount(records, /ยอดก่อนภาษี|มูลค่าก่อนภาษี|ราคาไม่รวมภาษี|sub\s*total/i),
      vat: findAmount(records, /ภาษีมูลค่าเพิ่ม|\bvat\b/i),
      total: findTotal(records),
    };
    return { fields, records, buyerTaxIdExcluded: taxId.buyerIdExcluded };
  }

  function reviewIssues(values, confirmed, options = {}) {
    const issues = [];
    for (const key of requiredKeys) {
      if (!String(values[key] || "").trim()) issues.push({ code: `missing_${key}`, severity: "blocking" });
    }

    const total = parseMoney(values.total || "");
    if (String(values.total || "").trim() && (total === null || total <= 0)) {
      issues.push({ code: "invalid_total", severity: "blocking" });
    }
    const subtotal = parseMoney(values.subtotal || "");
    const vat = parseMoney(values.vat || "");
    if (values.subtotal && subtotal === null) issues.push({ code: "invalid_subtotal", severity: "blocking" });
    if (values.vat && vat === null) issues.push({ code: "invalid_vat", severity: "blocking" });
    if (subtotal !== null && vat !== null && total !== null && Math.abs(subtotal + vat - total) > 0.02) {
      issues.push({ code: "amount_mismatch", severity: "blocking" });
    }
    if (values.taxId && normalizeDigits(values.taxId).replace(/\D/g, "").length !== 13) {
      issues.push({ code: "tax_id_length", severity: "blocking" });
    }

    const pending = fieldKeys.filter((key) => String(values[key] || "").trim() && !confirmed[key]);
    if (pending.length) issues.push({ code: "unconfirmed_fields", severity: "blocking", count: pending.length });
    if (options.lowConfidenceCount > 0 && !options.lowConfidenceReviewed) {
      issues.push({ code: "low_confidence", severity: "blocking", count: options.lowConfidenceCount });
    }
    if (options.resized) issues.push({ code: "resized_image", severity: "advisory" });
    if (options.buyerTaxIdExcluded) issues.push({ code: "buyer_tax_id_excluded", severity: "advisory" });

    return {
      issues,
      complete: !issues.some((issue) => issue.severity === "blocking"),
      confirmedCount: fieldKeys.filter((key) => confirmed[key] && String(values[key] || "").trim()).length,
      filledCount: fieldKeys.filter((key) => String(values[key] || "").trim()).length,
    };
  }

  const api = { fieldKeys, requiredKeys, normalizeDigits, lineRecords, parseMoney, extractReceipt, reviewIssues };
  if (scope) scope.ReceiptReview = api;
})(typeof window === "undefined" ? null : window);
