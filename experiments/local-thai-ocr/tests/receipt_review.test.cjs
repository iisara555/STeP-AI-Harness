const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../web/receipt-review.js"), "utf8"), context);
const review = context.window.ReceiptReview;

function sampleResult() {
  const texts = [
    "ใบเสร็จรับเงิน",
    "ร้านตัวอย่าง จำกัด",
    "เลขที่ใบเสร็จ RC-1024",
    "วันที่ 23/09/2569",
    "เลขประจำตัวผู้เสียภาษี 0105559999999",
    "ยอดก่อนภาษี 100.00",
    "ภาษีมูลค่าเพิ่ม 7.00",
    "ยอดสุทธิ 107.00",
  ];
  return {
    pages: [{ page: 1, source: "ocr", lines: texts.map((text) => ({ text, confidence: 0.94 })) }],
    summary: { needs_review: 0 },
  };
}

test("extracts receipt candidates from Thai OCR lines", () => {
  const { fields } = review.extractReceipt(sampleResult());
  assert.equal(fields.merchant.value, "ร้านตัวอย่าง จำกัด");
  assert.equal(fields.receiptNumber.value, "RC-1024");
  assert.equal(fields.date.value, "23/09/2569");
  assert.equal(fields.taxId.value, "0105559999999");
  assert.equal(fields.subtotal.value, "100.00");
  assert.equal(fields.vat.value, "7.00");
  assert.equal(fields.total.value, "107.00");
  assert.equal(fields.total.confidence, 0.94);
});

test("skips test watermarks when finding the merchant", () => {
  const result = sampleResult();
  result.pages[0].lines.unshift({ text: "SAMPLE / TEST ONLY", confidence: 0.99 });
  assert.equal(review.extractReceipt(result).fields.merchant.value, "ร้านตัวอย่าง จำกัด");
});

test("requires human confirmation before marking extracted fields reviewed", () => {
  const { fields } = review.extractReceipt(sampleResult());
  const values = Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, item.value]));
  assert.equal(review.reviewIssues(values, {}).complete, false);
  const confirmed = Object.fromEntries(review.fieldKeys.map((key) => [key, true]));
  assert.equal(review.reviewIssues(values, confirmed).complete, true);
  assert.equal(review.reviewIssues(values, confirmed, { lowConfidenceCount: 2 }).complete, false);
  assert.equal(review.reviewIssues(values, confirmed, { lowConfidenceCount: 2, lowConfidenceReviewed: true }).complete, true);
});

test("flags arithmetic mismatch and handles Thai digits", () => {
  assert.equal(review.parseMoney("๑,๒๓๔.๕๐"), 1234.5);
  const values = { merchant: "ร้านค้า", date: "23/09/2569", subtotal: "100.00", vat: "7.00", total: "108.00" };
  const confirmed = Object.fromEntries(review.fieldKeys.map((key) => [key, true]));
  const result = review.reviewIssues(values, confirmed);
  assert.equal(result.complete, false);
  assert.ok(result.issues.some((issue) => issue.code === "amount_mismatch"));
});

test("pairs a separate total label with the amount and excludes buyer tax ID", () => {
  const lines = [
    { text: "ร้านตัวอย่าง", box: [100, 30, 400, 65] },
    { text: "วันที่ 02/07/2567", box: [900, 80, 1100, 115] },
    { text: "ชื่อลูกค้า: บริษัทผู้ซื้อ", box: [100, 140, 500, 175] },
    { text: "เลขประจำตัวผู้เสียภาษี 1234567890123", box: [100, 180, 650, 215] },
    { text: "Total", box: [1100, 240, 1200, 275] },
    { text: "รวม", box: [850, 460, 920, 500] },
    { text: "2,200.00", box: [1100, 460, 1280, 500] },
  ].map((line) => ({ ...line, confidence: 0.95 }));
  const extracted = review.extractReceipt({ pages: [{ page: 1, source: "ocr", lines }] });
  assert.equal(extracted.fields.total.value, "2,200.00");
  assert.equal(extracted.fields.taxId.value, "");
  assert.equal(extracted.buyerTaxIdExcluded, true);
  const values = Object.fromEntries(Object.entries(extracted.fields).map(([key, item]) => [key, item.value]));
  const confirmed = Object.fromEntries(review.fieldKeys.map((key) => [key, true]));
  const result = review.reviewIssues(values, confirmed, { buyerTaxIdExcluded: true });
  assert.equal(result.complete, true);
  assert.ok(result.issues.some((issue) => issue.code === "buyer_tax_id_excluded"));
});

test("seller tax ID takes precedence over a later buyer tax ID", () => {
  const result = sampleResult();
  result.pages[0].lines.push({ text: "ชื่อลูกค้า: บริษัทผู้ซื้อ", confidence: 0.9 });
  result.pages[0].lines.push({ text: "เลขประจำตัวผู้เสียภาษี 1234567890123", confidence: 0.9 });
  const extracted = review.extractReceipt(result);
  assert.equal(extracted.fields.taxId.value, "0105559999999");
});

test("keeps independent OCR readings and requires review of disagreements", () => {
  const result = sampleResult();
  result.pages[0].lines[1].crosscheck_candidate = "ร้านตัวอยาง จำกัด";
  result.pages[0].lines[1].crosscheck_status = "disagree";
  result.pages[0].lines[1].needs_review = true;
  const extracted = review.extractReceipt(result);
  assert.equal(extracted.fields.merchant.value, "ร้านตัวอย่าง จำกัด");
  assert.equal(extracted.fields.merchant.crosscheckCandidate, "ร้านตัวอยาง จำกัด");
  assert.equal(extracted.records[1].crosscheckStatus, "disagree");

  const values = Object.fromEntries(Object.entries(extracted.fields).map(([key, item]) => [key, item.value]));
  const confirmed = Object.fromEntries(review.fieldKeys.map((key) => [key, true]));
  const pending = review.reviewIssues(values, confirmed, { reviewLineCount: 1 });
  assert.equal(pending.complete, false);
  assert.ok(pending.issues.some((issue) => issue.code === "review_lines"));
  assert.equal(review.reviewIssues(values, confirmed, { reviewLineCount: 1, reviewLinesChecked: true }).complete, true);
});
