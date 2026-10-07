(function (scope) {
  "use strict";

  // Operational pre-check fields used by the STeP Desktop receipt workflow.
  // This is a mapping schema, not a statement of AFP finance-policy requirements.
  const afpFieldSchema = {
    merchant: {
      label: "ผู้ออกใบเสร็จ / ร้านค้า",
      requiredForPrecheck: true,
      aliases: /ผู้ออก(?:ใบเสร็จ|เอกสาร)?|ผู้ขาย|ผู้จำหน่าย|ร้านค้า|merchant|seller|vendor|supplier/i,
    },
    receiptNumber: {
      label: "เลขที่ใบเสร็จ",
      requiredForPrecheck: false,
      aliases: /เลขที่ใบเสร็จ(?:รับเงิน)?|เลขที่ใบกำกับ(?:ภาษี)?|เลขที่เอกสาร|เลขที่บิล|receipt\s*(?:no\.?|number|#)|invoice\s*(?:no\.?|number|#)|document\s*(?:no\.?|number)|bill\s*(?:no\.?|number|#)|inv\s*(?:no\.?|#)|เลขที่(?!\s*(?:ผู้เสียภาษี|ประจำตัว|บัญชี|สาขา))|^(?:no\.|no\s*:|no\s+(?=\d)|#)/i,
    },
    date: {
      label: "วันที่",
      requiredForPrecheck: true,
      aliases: /วันที่(?:ออกเอกสาร)?|receipt\s*date|invoice\s*date|document\s*date|\bdate\b/i,
    },
    taxId: {
      label: "เลขผู้เสียภาษีของผู้ออก",
      requiredForPrecheck: false,
      aliases: /เลข(?:ประจำตัว)?ผู้เสียภาษี|เลขประจำตัวผู้เสียภาษี|tax\s*(?:id|no\.?|number)|taxpayer\s*(?:id|no\.?|number)|\btin\b/i,
    },
    subtotal: {
      label: "ยอดก่อนภาษี",
      requiredForPrecheck: false,
      aliases: /ยอดก่อนภาษี|มูลค่าก่อนภาษี|ราคาไม่รวมภาษี|ยอดก่อน vat|sub\s*total|before\s*tax/i,
    },
    vat: {
      label: "ภาษีมูลค่าเพิ่ม",
      requiredForPrecheck: false,
      aliases: /ภาษีมูลค่าเพิ่ม|ภาษีมูลค่าเพิ่ม\s*7%|vat\s*7%|\bvat\b|tax\s*amount/i,
    },
    total: {
      label: "ยอดรวมที่ชำระ",
      requiredForPrecheck: true,
      aliases: /ยอดเงินสุทธิ|ยอดสุทธิ|รวมทั้งสิ้น|ยอดชำระ|ยอดรวม|รวมเงิน|จำนวนเงิน|grand\s*total|\btotal\b|net\s*amount|amount\s*due|^รวม$/i,
    },
  };
  const fieldKeys = Object.keys(afpFieldSchema);
  // Words that name the amount actually paid; plain ยอดรวม / รวมเงิน / จำนวนเงิน are often the pre-VAT sum or a column header.
  const strongTotal = /ยอดเงินสุทธิ|ยอดสุทธิ|รวมทั้งสิ้น|ยอดชำระ|ยอดที่ต้องชำระ|grand\s*total|net\s*(?:amount|total)|amount\s*due|total\s*(?:amount|due|paid)|(?:รวม|incl\.?|including)\s*(?:vat|ภาษี)/i;
  const notVatAmount = /ไม่รวม|ก่อน|excl|before|(?:รวม|incl\.?|including)\s*(?:vat|ภาษี)|vat\s*(?:reg|no\.?\b|id)|ผู้เสียภาษี/i;
  // Abbreviations need a space before them so "บจ." (a company) is not read as "จ." (a province).
  const addressWords = /หมู่(?:ที่)?\s|ถนน|ซอย|ตำบล|อำเภอ|จังหวัด|แขวง|เขต|(?:^|\s)[ถซตอจ]\.|\b(?:road|soi|moo)\b/i;
  const requiredKeys = fieldKeys.filter((key) => afpFieldSchema[key].requiredForPrecheck);
  const buyerMarker = /ชื่อลูกค้า|นามลูกค้า|ชื่อผู้ซื้อ|ข้อมูลผู้ซื้อ|ข้อมูลลูกค้า|เลข(?:ประจำตัว)?(?:ผู้เสียภาษี)?(?:ของ)?(?:ผู้ซื้อ|ลูกค้า)|\bcustomer\b|\bbuyer\b|\bbill\s*to\b/i;
  const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";

  function normalizeDigits(value) {
    return String(value ?? "").replace(/[๐-๙]/g, (digit) => String(thaiDigits.indexOf(digit)));
  }

  function normalizeText(value) {
    return normalizeDigits(value).replace(/\s+/g, " ").trim();
  }

  const thaiLetter = /[\u0E00-\u0E7F]/;

  // Thai OCR often splits a word with a space ("ยอด รวม", "วัน ที่"), so labels are matched with the spaces
  // between Thai letters ignored. Returns where the label sits in the original text.
  function labelMatch(value, regex) {
    const text = String(value ?? "");
    let compact = "";
    const at = [];
    for (let index = 0; index < text.length; index++) {
      if (/\s/.test(text[index]) && thaiLetter.test(text[index - 1] || "")) {
        let next = index;
        while (next < text.length && /\s/.test(text[next])) next++;
        if (thaiLetter.test(text[next] || "")) {
          index = next - 1;
          continue;
        }
      }
      compact += text[index];
      at.push(index);
    }
    const match = compact.match(regex);
    if (!match) return null;
    const end = match.index + match[0].length;
    return { index: at[match.index] ?? text.length, end: end < at.length ? at[end] : text.length };
  }

  function hasLabel(value, key) {
    return Boolean(labelMatch(normalizeText(value), afpFieldSchema[key].aliases));
  }

  function isAnyLabel(value) {
    return fieldKeys.some((key) => hasLabel(value, key));
  }

  // A value on the same line ends where another field's label starts ("IV-001 วันที่ 06/10/2569").
  function cutAtOtherLabel(value, ownKey) {
    let end = value.length;
    for (const key of fieldKeys) {
      if (key === ownKey) continue;
      const match = labelMatch(value, afpFieldSchema[key].aliases);
      if (match && match.index > 0 && match.index < end) end = match.index;
    }
    return value.slice(0, end).trim();
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
            records.push({
              text: String(line.text).trim(),
              page: page.page,
              confidence: line.confidence ?? null,
              box: line.box || null,
              polygon: line.polygon || null,
              needsReview: Boolean(line.needs_review),
              crosscheckCandidate: line.crosscheck_candidate || "",
              crosscheckConfidence: line.crosscheck_confidence ?? null,
              crosscheckStatus: line.crosscheck_status || null,
              tesseractCandidate: line.tesseract_candidate || "",
              tesseractConfidence: line.tesseract_confidence ?? null,
              tesseractStatus: line.tesseract_status || null,
              handwritingCandidate: line.handwriting_candidate || "",
              textKind: line.text_kind || "uncertain",
              fusionCandidates: Array.isArray(line.fusion_candidates) ? line.fusion_candidates : [],
              tileCandidates: Array.isArray(line.tile_candidates) ? line.tile_candidates : [],
              engine: "paddle",
            });
          }
        }
      }
    }
    if (!records.length && result?.text) {
      for (const text of String(result.text).split(/\r?\n/)) {
        if (text.trim()) records.push({ text: text.trim(), page: 1, confidence: null });
      }
    }
    return records.map((record, index) => ({ ...record, index }));
  }

  function engineWeight(record) {
    if (record?.engine === "native") return 1;
    if (record?.engine === "tesseract") return record?.textKind === "printed-likely" ? 1 : 0.92;
    if (record?.engine === "thai-trocr") return record?.textKind === "handwriting-likely" ? 0.96 : 0.72;
    if (record?.engine === "easyocr") return 0.85;
    if (record?.engine === "paddle" && record?.textKind === "handwriting-likely") return 0.78;
    return 1;
  }

  function mappingRecords(records) {
    const expanded = [];
    for (const record of records) {
      expanded.push(record);
      const alternatives = [
        ...(record.tileCandidates || []).map((item) => ({ engine: "paddle-overlap", text: item.text || "", confidence: item.confidence ?? null, usable: Boolean(item.text) })),
        {
          engine: "tesseract",
          text: record.tesseractCandidate || "",
          confidence: record.tesseractConfidence ?? null,
          usable: record.tesseractStatus && record.tesseractStatus !== "error",
        },
        {
          engine: "easyocr",
          text: record.crosscheckCandidate || "",
          confidence: record.crosscheckConfidence ?? null,
          usable: Boolean(record.crosscheckCandidate),
        },
        {
          engine: "thai-trocr",
          text: record.handwritingCandidate || "",
          confidence: null,
          usable: Boolean(record.handwritingCandidate),
        },
      ];
      for (const alternative of alternatives) {
        if (!alternative.usable || !normalizeText(alternative.text)) continue;
        if (normalizeText(alternative.text) === normalizeText(record.text)) continue;
        expanded.push({
          ...record,
          text: alternative.text,
          confidence: alternative.confidence,
          engine: alternative.engine,
          sourceTexts: [record.text, alternative.text],
          virtualCandidate: true,
        });
      }
    }
    return expanded;
  }

  function candidate(value, record, extras = {}) {
    const normalized = normalizeText(value);
    return {
      value: normalized,
      page: record?.page ?? null,
      confidence: record?.confidence ?? null,
      evidence: extras.evidence ?? record?.text ?? "",
      crosscheckCandidate: record?.crosscheckCandidate ?? "",
      crosscheckStatus: record?.crosscheckStatus ?? null,
      handwritingCandidate: record?.handwritingCandidate ?? "",
      mappingStatus: extras.mappingStatus || (normalized ? "mapped" : "unmapped"),
      mappingMethod: extras.mappingMethod || "",
      sourceTexts: extras.sourceTexts || (record?.text ? [record.text] : []),
      candidates: extras.candidates || [],
      engine: extras.engine || record?.engine || "paddle",
    };
  }

  // OCR often puts a space beside a separator ("1, 070.00"). Letters inside numbers ("1O7.00") are left
  // unreadable on purpose so a person compares them with the receipt.
  function cleanAmountText(value) {
    return normalizeDigits(value).replace(/(\d)\s*([,.])\s*(?=\d)/g, "$1$2");
  }

  function amountTokens(value) {
    const text = cleanAmountText(value);
    // A percentage ("VAT 7%") is a rate, not an amount.
    const matches = [...text.matchAll(/(?<![A-Za-z\d.,/+-])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![A-Za-z\d.,/%]|\s*%)/g)];
    return matches.map((match) => match[1]).filter((token) => token.replace(/\D/g, "").length < 11);
  }

  function parseMoney(value) {
    const text = normalizeDigits(value).replace(/[฿\s]/g, "");
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) return null;
    const amount = Number(text.replace(/,/g, ""));
    return Number.isFinite(amount) ? amount : null;
  }

  const thaiMonths = [
    ["ม.ค.", "มกราคม"], ["ก.พ.", "กุมภาพันธ์"], ["มี.ค.", "มีนาคม"], ["เม.ย.", "เมษายน"],
    ["พ.ค.", "พฤษภาคม"], ["มิ.ย.", "มิถุนายน"], ["ก.ค.", "กรกฎาคม"], ["ส.ค.", "สิงหาคม"],
    ["ก.ย.", "กันยายน"], ["ต.ค.", "ตุลาคม"], ["พ.ย.", "พฤศจิกายน"], ["ธ.ค.", "ธันวาคม"],
  ];
  // "ต.ค." also arrives from OCR as "ต.ค", "ตค." or "ต. ค.".
  const looseAbbreviation = (short) => short.replace(/\./g, "").split("").join("\\.?\\s?") + "\\.?";
  const monthPattern = [
    ...thaiMonths.map(([, full]) => full),
    ...thaiMonths.map(([short]) => looseAbbreviation(short)),
    "jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "june?", "july?", "aug(?:ust)?",
    "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?",
  ].join("|");
  const era = "(?:พ\\.?\\s?ศ\\.?|ค\\.?\\s?ศ\\.?)";
  const namedDate = new RegExp(`(?:^|[^\\d])(\\d{1,2})\\s*(${monthPattern})\\s*(?:${era}\\s*)?((?:19|20|25)\\d{2}|\\d{2})(?=$|[^\\d])`, "i");
  const englishDate = new RegExp(`(?:^|[^a-z])(${monthPattern})\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})(?=$|[^\\d])`, "i");

  function canonicalMonth(word) {
    const compact = word.replace(/[.\s]/g, "");
    const thai = thaiMonths.find(([short, full]) => full === word || short.replace(/\./g, "") === compact);
    return thai ? (thai[1] === word ? word : thai[0]) : word;
  }

  function dateValue(value) {
    const text = normalizeText(value);
    const pattern = /(?:^|[^\d])((?:19|20|25)\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-](?:\d{4}|\d{2}))(?=$|[^\d])/;
    const numeric = text.match(pattern)?.[1];
    if (numeric) return numeric;
    const named = text.match(namedDate);
    if (named) return `${named[1]} ${canonicalMonth(named[2])} ${named[3]}`;
    const english = text.match(englishDate);
    return english ? `${english[2]} ${english[1]} ${english[3]}` : "";
  }

  function taxIdValue(value) {
    const match = normalizeDigits(value).match(/(?:^|[^\d])((?:\d[\s-]?){12}\d)(?=$|[^\d])/);
    return match ? match[1].replace(/\D/g, "") : "";
  }

  function receiptNumberValue(value) {
    const text = normalizeText(value).replace(/^[\s:#.\-]+/, "").trim();
    if (!text || text.length > 48 || /^(?:receipt|invoice|document|เลขที่)$/i.test(text)) return "";
    // A document number has a digit; "เลขที่ 99/1 หมู่ 3 ต.สุเทพ" is an address.
    if (!/\d/.test(text) || addressWords.test(text)) return "";
    return text;
  }

  function amountValue(value) {
    const tokens = amountTokens(value);
    // Prefer an amount written with satang ("85.00") over a count on the same line ("3 รายการ").
    const money = tokens.filter((token) => /\.\d{2}$/.test(token));
    const pool = money.length ? money : tokens;
    return pool.length ? pool[pool.length - 1] : "";
  }

  function centerY(box) {
    return box ? (box[1] + box[3]) / 2 : null;
  }

  function rowSlope(record) {
    const points = record.polygon;
    if (!Array.isArray(points) || points.length !== 4 || points.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v)))) return null;
    const dx = points[1][0] + points[2][0] - points[0][0] - points[3][0];
    const dy = points[1][1] + points[2][1] - points[0][1] - points[3][1];
    const slope = dx > 0 ? dy / dx : NaN;
    return Number.isFinite(slope) && Math.abs(slope) <= 0.2 ? slope : null;
  }

  function sameRowCandidates(records, labelRecord, parseValue) {
    if (!labelRecord?.box) return [];
    const labelY = centerY(labelRecord.box);
    return records
      .filter((record) => {
        if (record === labelRecord || record.page !== labelRecord.page || !record.box || record.box[0] < labelRecord.box[2] - 12) return false;
        if (isAnyLabel(record.text)) return false;
        const shift = (rowSlope(labelRecord) ?? rowSlope(record) ?? 0) *
          ((record.box[0] + record.box[2] - labelRecord.box[0] - labelRecord.box[2]) / 2);
        const otherY = centerY(record.box) - shift;
        const height = Math.min(labelRecord.box[3] - labelRecord.box[1], record.box[3] - record.box[1]);
        const overlap = Math.min(labelRecord.box[3], record.box[3] - shift) - Math.max(labelRecord.box[1], record.box[1] - shift);
        return height > 0 && overlap / height >= 0.45 && Math.abs(labelY - otherY) <= Math.max(labelRecord.box[3] - labelRecord.box[1], record.box[3] - record.box[1]) * 0.6;
      })
      .map((record) => ({ value: parseValue(record.text), record }))
      .filter((item) => item.value)
      .sort((a, b) => b.record.box[0] - a.record.box[0]);
  }

  function followingCandidates(records, labelIndex, parseValue) {
    const labelRecord = records[labelIndex];
    const results = [];
    for (let offset = 1; offset <= 2; offset++) {
      const record = records[labelIndex + offset];
      if (!record || record.page !== labelRecord.page) break;
      // Stop at another recognized field label before parsing it as a value.
      if (isAnyLabel(record.text)) break;
      if (labelRecord.box && record.box) {
        const height = Math.max(labelRecord.box[3] - labelRecord.box[1], record.box[3] - record.box[1]);
        const gap = record.box[1] - labelRecord.box[3];
        // Same-row values use geometry above. Following values must actually
        // be nearby on the next row, rather than a distant table/footer number.
        if (gap < 0 || gap > height * 3) continue;
      }
      const value = parseValue(record.text);
      if (value) results.push({ value, record, offset });
    }
    return results;
  }

  // labelWeight(text) scales a label line's candidates; 0 skips the line (e.g. "Sub Total" is not the total).
  // key names a schema field, or is a label pattern of its own (e.g. เล่มที่).
  function labeledCandidates(records, key, parseValue, labelWeight = () => 1) {
    const labelRegex = typeof key === "string" ? afpFieldSchema[key].aliases : key;
    const found = [];
    for (let index = 0; index < records.length; index++) {
      const labelRecord = records[index];
      const text = normalizeText(labelRecord.text);
      const match = labelMatch(text, labelRegex);
      if (!match) continue;
      const weight = labelWeight(text);
      if (!weight) continue;

      let trailing = cutAtOtherLabel(text.slice(match.end).replace(/^[\s:#]+/, "").trim(), key);
      // Bilingual labels repeat themselves: "เลขที่ BILL NO. 042".
      for (let again = labelMatch(trailing, labelRegex); again?.index === 0 && again.end > 0; again = labelMatch(trailing, labelRegex)) {
        trailing = trailing.slice(again.end).replace(/^[\s:#]+/, "").trim();
      }
      const sameLine = parseValue(trailing);
      if (sameLine) {
        found.push({
          value: sameLine,
          record: labelRecord,
          score: weight * engineWeight(labelRecord),
          method: "same-line",
          engine: labelRecord.engine || "paddle",
          evidence: labelRecord.text,
          sourceTexts: labelRecord.sourceTexts || [labelRecord.text],
        });
      }

      for (const item of sameRowCandidates(records, labelRecord, parseValue)) {
        found.push({
          value: item.value,
          record: item.record,
          score: 0.95 * weight * engineWeight(item.record),
          method: "same-row",
          engine: item.record.engine || "paddle",
          evidence: `${labelRecord.text} ↔ ${item.record.text}`,
          sourceTexts: [
            ...(labelRecord.sourceTexts || [labelRecord.text]),
            ...(item.record.sourceTexts || [item.record.text]),
          ],
        });
      }

      for (const item of followingCandidates(records, index, parseValue)) {
        found.push({
          value: item.value,
          record: item.record,
          score: (item.offset === 1 ? 0.86 : 0.78) * weight * engineWeight(item.record),
          method: "next-line",
          engine: item.record.engine || "paddle",
          evidence: `${labelRecord.text} → ${item.record.text}`,
          sourceTexts: [
            ...(labelRecord.sourceTexts || [labelRecord.text]),
            ...(item.record.sourceTexts || [item.record.text]),
          ],
        });
      }
    }

    const unique = new Map();
    for (const item of found.sort((a, b) => b.score - a.score)) {
      const key = normalizeText(item.value);
      if (!unique.has(key)) unique.set(key, item);
    }
    return [...unique.values()];
  }

  function selectCandidate(candidates, fallback = null) {
    const options = [...(candidates || [])];
    if (fallback?.value && !options.some((item) => normalizeText(item.value) === normalizeText(fallback.value))) options.push(fallback);
    options.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!options.length) return candidate("", null, { candidates: [] });
    const top = options[0];
    const second = options.find((item) => normalizeText(item.value) !== normalizeText(top.value));
    const independentConflict = Boolean(
      second &&
      (top.engine || top.record?.engine) !== (second.engine || second.record?.engine) &&
      (second.score || 0) >= (top.score || 0) * 0.85,
    );
    const handwritingOnly = Boolean(
      (top.engine || top.record?.engine) === "thai-trocr" &&
      !options.some(
        (item) =>
          (item.engine || item.record?.engine) !== "thai-trocr" &&
          normalizeText(item.value) === normalizeText(top.value),
      ),
    );
    const ambiguous = Boolean(
      handwritingOnly ||
      independentConflict ||
      (second && Math.abs((top.score || 0) - (second.score || 0)) < 0.08),
    );
    const mappedOptions = options.slice(0, 5).map((item) => ({
      value: normalizeText(item.value),
      evidence: item.evidence || item.record?.text || "",
      page: item.record?.page ?? null,
      confidence: item.record?.confidence ?? null,
      method: item.method || "pattern",
      engine: item.engine || item.record?.engine || "paddle",
      score: item.score ?? 0,
    }));

    if (ambiguous) {
      return candidate("", null, {
        mappingStatus: "ambiguous",
        mappingMethod: "multiple-candidates",
        candidates: mappedOptions,
        evidence: top.evidence || "",
        sourceTexts: [...new Set(options.flatMap((item) => item.sourceTexts || []))],
        engine: top.engine || top.record?.engine || "paddle",
      });
    }

    return candidate(top.value, top.record, {
      mappingStatus: "mapped",
      mappingMethod: top.method || "pattern",
      candidates: mappedOptions,
      evidence: top.evidence || top.record?.text || "",
      sourceTexts: top.sourceTexts || (top.record?.text ? [top.record.text] : []),
      engine: top.engine || top.record?.engine || "paddle",
    });
  }

  function findDate(records) {
    const labeled = labeledCandidates(records, "date", dateValue);
    const ranked = [...records].sort((a, b) => Number(hasLabel(b.text, "date")) - Number(hasLabel(a.text, "date")));
    let fallback = null;
    for (const record of ranked) {
      const value = dateValue(record.text);
      if (value) {
        fallback = { value, record, score: 0.70, method: "date-pattern", evidence: record.text, sourceTexts: [record.text] };
        break;
      }
    }
    return selectCandidate(labeled, fallback);
  }

  function findTaxId(records) {
    const buyerStart = records.findIndex((record) => buyerMarker.test(record.text));
    const sellerRecords = buyerStart < 0 ? records : records.slice(0, buyerStart);
    const buyerRecords = buyerStart < 0 ? [] : records.slice(buyerStart);
    const buyerIdExcluded = buyerRecords.some((record) => Boolean(taxIdValue(record.text)));

    const labeled = labeledCandidates(sellerRecords, "taxId", taxIdValue);
    let fallback = null;
    for (const record of sellerRecords) {
      const value = taxIdValue(record.text);
      if (!value) continue;
      fallback = {
        value,
        record,
        score: hasLabel(record.text, "taxId") ? 0.92 : 0.60,
        method: hasLabel(record.text, "taxId") ? "tax-label-pattern" : "seller-13-digit-pattern",
        evidence: record.text,
        sourceTexts: [record.text],
      };
      break;
    }
    return { field: selectCandidate(labeled, fallback), buyerIdExcluded };
  }

  const amountWeights = {
    subtotal: () => 1,
    vat: (text) => (notVatAmount.test(text) && !/^(?:ภาษีมูลค่าเพิ่ม|vat)\b/i.test(text) ? 0 : 1),
    // Sub Total / ยอดก่อนภาษี lines are never the amount paid; a plain ยอดรวม ranks below ยอดสุทธิ / รวมทั้งสิ้น.
    total: (text) => (hasLabel(text, "subtotal") && !strongTotal.test(text) ? 0 : strongTotal.test(text) ? 1 : 0.8),
  };

  function findAmount(records, key) {
    return selectCandidate(labeledCandidates(records, key, amountValue, amountWeights[key]));
  }

  function findTotal(records) {
    return findAmount(records, "total");
  }

  function findReceiptNumber(records) {
    // A bare "เลขที่" or "No." is weaker evidence than "เลขที่ใบเสร็จ"; it also labels addresses.
    const bare = /^(?:no\.?|#|เลขที่)$/i;
    const bill = selectCandidate(
      labeledCandidates(records, "receiptNumber", receiptNumberValue, (text) => {
        const match = labelMatch(text, afpFieldSchema.receiptNumber.aliases);
        return match && bare.test(text.slice(match.index, match.end).replace(/\s+/g, "").trim()) ? 0.9 : 1;
      }),
    );
    const book = selectCandidate(labeledCandidates(records, /เล่มที่(?:\s*book\s*(?:no\.?|number|#))?|book\s*(?:no\.?|number|#)/i, receiptNumberValue));
    if (!bill.value || !book.value) return bill;
    return {
      ...bill,
      value: `เล่ม ${book.value} เลขที่ ${bill.value}`,
      evidence: `${book.evidence} ↔ ${bill.evidence}`,
      mappingMethod: "book-and-bill",
      sourceTexts: [...new Set([...(book.sourceTexts || []), ...(bill.sourceTexts || [])])],
      candidates: bill.candidates.map(item => ({ ...item, value: `เล่ม ${book.value} เลขที่ ${item.value}`, evidence: `${book.evidence} ↔ ${item.evidence}` })),
    };
  }

  // Subtotal + VAT = total: when one amount is missing or two totals compete, the arithmetic settles it.
  function reconcileAmounts(fields, records) {
    const vat = parseMoney(fields.vat.value);
    if (vat === null || vat <= 0) return;
    const close = (a, b) => Math.abs(a - b) <= 0.02;
    const optionRecord = (option) => ({ text: option.evidence, page: option.page, confidence: option.confidence });
    const pick = (option, method, sourceTexts) =>
      candidate(option.value, optionRecord(option), {
        mappingStatus: "mapped",
        mappingMethod: method,
        candidates: [option],
        evidence: option.evidence,
        sourceTexts,
        engine: option.engine,
      });

    if (fields.total.mappingStatus === "ambiguous") {
      const subtotal = parseMoney(fields.subtotal.value);
      const options = fields.total.candidates || [];
      for (const top of options) {
        const total = parseMoney(top.value);
        if (total === null) continue;
        const base = subtotal !== null ? subtotal : options.map((item) => parseMoney(item.value)).find((value) => value !== null && close(value + vat, total));
        if (base === undefined || base === null || !close(base + vat, total)) continue;
        fields.total = pick(top, "subtotal-plus-vat", fields.total.sourceTexts);
        if (subtotal === null) {
          const option = options.find((item) => close(parseMoney(item.value) ?? NaN, base));
          fields.subtotal = pick(option, "subtotal-plus-vat", [option.evidence]);
        }
        return;
      }
    }

    const total = parseMoney(fields.total.value);
    if (fields.subtotal.value || total === null) return;
    for (const record of records) {
      if (record.virtualCandidate) continue;
      for (const token of amountTokens(record.text)) {
        const value = parseMoney(token);
        if (value !== null && value < total && close(value + vat, total)) {
          fields.subtotal = candidate(token, record, { mappingMethod: "subtotal-plus-vat", sourceTexts: [record.text] });
          return;
        }
      }
    }
  }

  function findMerchant(records) {
    // A buyer can be another company. Its name and the table below it are never seller-header evidence.
    const buyerStart = records.findIndex(record => buyerMarker.test(record.text));
    if (buyerStart >= 0) records = records.slice(0, buyerStart);
    const labeled = labeledCandidates(records, "merchant", (value) => {
      const text = normalizeText(value);
      if (text.length < 3 || text.length > 85) return "";
      return text;
    });
    if (labeled.length) return selectCandidate(labeled);

    // Document titles alone ("ใบกำกับภาษี/ใบเสร็จรับเงิน (ต้นฉบับ)") are not a shop name.
    const titleWords = /ใบกำกับภาษีอย่างย่อ|ใบกำกับภาษี|ใบเสร็จรับเงิน|ใบรับเงิน|ใบส่งของ|บิลเงินสด|cash\s*sale|cash\s*bill|tax\s*invoice|receipt|invoice|abb|ต้นฉบับ|สำเนา|original|copy/gi;
    const isTitle = (text) => !text.replace(titleWords, "").replace(/[\s/()\-|,.:]/g, "");
    const label = /วันที่|date|เลขที่|เล่มที่|book\s*no|bill\s*no|ผู้เสียภาษี|tax\s*id|vat|subtotal|total|ยอดรวม|ยอดสุทธิ|โทร|tel\.?|www\.|http|sample|test only|ข้อมูลสมมติ|ห้ามใช้เบิกจ่าย|ลูกค้า|ผู้ซื้อ|customer|buyer|cash|change|เงินสด|เงินทอน|pos\b|cashier|พนักงาน/i;
    const merchantHint = /ร้าน|บริษัท|ห้างหุ้นส่วน|หจก\.?|จำกัด|\b(?:co\.?|ltd\.?|company|store|shop)\b/i;
    const plausible = [];
    for (const record of records.slice(0, 8)) {
      const text = normalizeText(record.text);
      if (text.length < 3 || text.length > 85 || isTitle(text) || label.test(text) || addressWords.test(text)) continue;
      // An amount or a date is not a name; "7-Eleven" still is.
      if (/\d[.,]\d{2}\b/.test(text) || (/^\d/.test(text) && (text.match(/[A-Za-zก-๙]/g) || []).length < 3)) continue;
      plausible.push(record);
    }
    const chosen = plausible.find((record) => merchantHint.test(normalizeText(record.text))) || plausible[0];
    return chosen
      ? selectCandidate([{ value: chosen.text, record: chosen, score: merchantHint.test(chosen.text) ? 0.72 : 0.60, method: "header-heuristic", evidence: chosen.text, sourceTexts: [chosen.text] }])
      : candidate("", null);
  }

  function buildAfpMapping(fields, records) {
    const used = new Set(fieldKeys.flatMap((key) => fields[key]?.sourceTexts || []));
    const fieldLike = records.filter((record) => isAnyLabel(record.text));
    return {
      schema: "step-afp-receipt-precheck-mapping/v1",
      notice: "Operational field mapping for AFP pre-check; not a controlled finance-policy requirement list.",
      fields: Object.fromEntries(fieldKeys.map((key) => [
        key,
        {
          label: afpFieldSchema[key].label,
          required_for_desktop_precheck: afpFieldSchema[key].requiredForPrecheck,
          status: fields[key]?.mappingStatus || "unmapped",
          method: fields[key]?.mappingMethod || "",
          selected_value: fields[key]?.value || "",
          evidence: fields[key]?.evidence || "",
          candidates: fields[key]?.candidates || [],
        },
      ])),
      unresolved_field_lines: fieldLike.filter((record) => !used.has(record.text)).map((record) => ({
        text: record.text,
        page: record.page,
        confidence: record.confidence ?? null,
      })),
      unmapped_ocr_lines: records.filter((record) => !used.has(record.text)).map((record) => ({
        text: record.text,
        page: record.page,
        confidence: record.confidence ?? null,
      })),
    };
  }

  function extractReceipt(result) {
    const records = lineRecords(result);
    const mappedRecords = mappingRecords(records);
    const taxId = findTaxId(mappedRecords);
    const fields = {
      merchant: findMerchant(mappedRecords),
      receiptNumber: findReceiptNumber(mappedRecords),
      date: findDate(mappedRecords),
      taxId: taxId.field,
      subtotal: findAmount(mappedRecords, "subtotal"),
      vat: findAmount(mappedRecords, "vat"),
      total: findTotal(mappedRecords),
    };
    reconcileAmounts(fields, mappedRecords);
    return {
      fields,
      records,
      buyerTaxIdExcluded: taxId.buyerIdExcluded,
      afpMapping: buildAfpMapping(fields, records),
    };
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
    const reviewLineCount = options.reviewLineCount ?? options.lowConfidenceCount ?? 0;
    const reviewLinesChecked = options.reviewLinesChecked ?? options.lowConfidenceReviewed ?? false;
    if (reviewLineCount > 0 && !reviewLinesChecked) {
      issues.push({ code: "review_lines", severity: "blocking", count: reviewLineCount });
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

  const api = {
    fieldKeys,
    requiredKeys,
    afpFieldSchema,
    normalizeDigits,
    lineRecords,
    parseMoney,
    extractReceipt,
    reviewIssues,
  };
  if (scope) scope.ReceiptReview = api;
})(typeof window === "undefined" ? null : window);
