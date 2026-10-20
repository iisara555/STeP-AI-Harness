/* Design prototype: synthetic fixtures only. No OCR, uploads, API calls or persistence. */
"use strict";
const $ = (id) => document.getElementById(id);
const KINDS = [
  "ใบเสร็จรับเงิน/ใบกำกับภาษีแบบเต็มรูป",
  "ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ",
  "บิลเงินสด",
  "ใบเสร็จรับเงินทั่วไป",
];
const state = {
  scenario: "missing",
  kind: 0,
  document: 0,
  sourceKind: 0,
  changed: false,
  grouped: false,
  zoomed: false,
};
// Owner-supplied reference: docs/knowledge/receipt-buyer-identity.md.
const BUYER_REFERENCE = {
  name: "อุทยานวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยเชียงใหม่",
  taxId: "0994000423179",
  address: "เลขที่ 155 หมู่ 2 ตำบลแม่เหียะ อำเภอเมือง จังหวัดเชียงใหม่ 50100",
};
const digits = (text) =>
  text.replace(/[๐-๙]/g, (d) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(d)));
const compact = (text) => digits(text).replace(/\s+/g, "");
const addressKey = (text) =>
  compact(text)
    .replace(/^เลขที่/, "")
    .replace(/หมู่ที่/g, "หมู่")
    .replace(/ต\./g, "ตำบล")
    .replace(/อ\./g, "อำเภอ")
    .replace(/จ\./g, "จังหวัด");
function buyerFacts() {
  if (
    state.sourceKind !== 0 ||
    state.scenario === "missing" ||
    state.scenario === "buyer-seller-only"
  )
    return { name: "", taxId: "", address: "" };
  const facts = { ...BUYER_REFERENCE };
  if (state.scenario === "buyer-match") {
    facts.taxId = "0-9940-00423-17-9";
    facts.address = "155 หมู่ 2 ต.แม่เหียะ อ.เมือง จ.เชียงใหม่ 50100";
  }
  if (state.scenario === "buyer-mismatch") {
    facts.taxId = "0994000423178";
    facts.address = BUYER_REFERENCE.address.replace("155", "157");
  }
  if (state.scenario === "buyer-unclear") facts.taxId = "09940004231?9";
  return facts;
}
function buyerComparison() {
  const facts = buyerFacts();
  return ["name", "taxId", "address"].map((key) => {
    const normalize =
      key === "taxId"
        ? (s) => compact(s).replace(/-/g, "")
        : key === "address"
          ? addressKey
          : compact;
    const observed = facts[key];
    const status =
      state.sourceKind !== 0 || state.scenario === "unsupported"
        ? "by-type"
        : !observed
          ? "not-detected"
          : observed.includes("?")
            ? "illegible"
            : normalize(observed) === normalize(BUYER_REFERENCE[key])
              ? "match"
              : "mismatch";
    return { key, expected: BUYER_REFERENCE[key], observed, status };
  });
}
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function field(key, value, parent) {
  const row = node("p", undefined, "paper-line");
  row.append(node("span", key), node("span", value));
  parent.append(row);
}
function region(id, label) {
  const el = node("section", undefined, "region");
  el.id = "region-" + id;
  el.dataset.label = label;
  return el;
}
function signatureReading() {
  const s = state.scenario;
  const absent =
    [
      "signature-absent",
      "signature-buyer-only",
      "signature-text-only",
    ].includes(s) ||
    (s === "missing" && state.sourceKind === 2);
  return {
    receiver:
      s === "signature-unclear" || s === "unsupported"
        ? "uncertain"
        : absent
          ? "absent"
          : "present",
    buyer: s === "signature-buyer-only" ? "present" : "uncertain",
  };
}
// A deliberately abstract, synthetic signing mark. This is a fixture, not a detector or a person's signature.
function signingMark() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 140 45");
  svg.setAttribute("class", "signing-mark");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "รอยลายเซ็นจำลอง ไม่ใช่ลายเซ็นบุคคลจริง");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    "M8 31 C35 3 43 6 27 28 S48 39 59 17 S57 34 79 27 S100 22 114 25 M38 36 L130 32",
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  svg.append(path);
  return svg;
}
function model() {
  const s = state.scenario;
  if (state.changed)
    return {
      status: "warning",
      title: "ยังยืนยันไม่ได้",
      description: "คุณแก้ประเภทเอกสารแล้ว ต้องตรวจข้อมูลตามประเภทใหม่อีกครั้ง",
      issues: [["ตรวจองค์ประกอบใหม่ตามประเภทที่เลือก", "header"]],
      actions: [
        ["เทียบประเภทที่เลือกกับหัวเอกสาร", "คุณ · ดูต้นฉบับก่อนยืนยัน"],
        [
          "ตรวจองค์ประกอบและเกณฑ์ที่ใช้กับประเภทใหม่",
          "ระบบ · ในแอปจริงจะประเมินผลใหม่",
        ],
      ],
      button: "ดูหัวเอกสาร",
      focus: "header",
      reviewAll: true,
    };
  if (s === "unsupported")
    return {
      status: "warning",
      title: "ยังยืนยันไม่ได้",
      description:
        "ตัวอย่างนี้เป็นใบเสนอราคา ยังจัดเข้าประเภทใบเสร็จทั้ง 4 แบบไม่ได้",
      issues: [["หัวเอกสารระบุใบเสนอราคา", "header"]],
      actions: [
        [
          "ขอเอกสารรับชำระเงินจากร้าน",
          "เจ้าของเรื่อง · อย่าเปลี่ยนประเภทเพื่อให้ผลผ่าน",
        ],
        ["ตรวจเกณฑ์ชุดเอกสารตามเรื่องที่เบิก", "เจ้าของเรื่องและ AFP"],
      ],
      button: "ดูหัวเอกสาร",
      focus: "header",
      reviewAll: true,
    };
  if (["buyer-mismatch", "buyer-seller-only", "buyer-unclear"].includes(s)) {
    const unclear = s === "buyer-unclear";
    return {
      status: unclear ? "warning" : "danger",
      title: unclear ? "ยังยืนยันไม่ได้" : "ยังไม่ครบ",
      description: "เทียบข้อมูลผู้ซื้อกับข้อมูล STeP ที่ผู้ดูแลระบุ",
      issues: [
        [
          unclear
            ? "เลขภาษีผู้ซื้ออ่านไม่ครบ ไม่เติมจากค่าอ้างอิง"
            : s === "buyer-seller-only"
              ? "เลขตรงเฉพาะผู้ขาย แต่ข้อมูลผู้ซื้อยังว่าง"
              : "เลขภาษีผู้ซื้อและเลขที่อยู่ไม่ตรงกับค่าอ้างอิง",
          "buyer",
        ],
      ],
      actions: [
        [
          unclear
            ? "ตรวจเลขภาษีจากต้นฉบับหรือถ่ายใหม่ให้ชัด"
            : "ให้ร้านตรวจชื่อ ที่อยู่ และเลขภาษีในช่องผู้ซื้อ",
          "คุณและร้าน · ใช้ข้อมูลอ้างอิง STeP ที่ให้มา",
        ],
        [
          "ตรวจเอกสารแก้ไขและเกณฑ์เบิกจ่ายก่อนส่งต่อ",
          "คุณ · ไม่แก้หรือเติมข้อมูลต้นฉบับแทนร้าน",
        ],
      ],
      button: "ดูข้อมูลผู้ซื้อในภาพ",
      focus: "buyer",
      ...(unclear
        ? { uncertain: "buyer" }
        : s === "buyer-seller-only"
          ? { missing: "buyer" }
          : { conflict: "buyer" }),
    };
  }
  if (s.startsWith("signature-") && s !== "signature-present") {
    const uncertain = s === "signature-unclear";
    const reason = uncertain
      ? "ช่องผู้รับเงินไม่ชัด ยังยืนยันการมีลายเซ็นไม่ได้"
      : s === "signature-buyer-only"
        ? "พบลายเซ็นผู้ซื้อ แต่ช่องผู้รับเงินยังว่าง"
        : s === "signature-text-only"
          ? "ชื่อพิมพ์และตราประทับไม่ใช่ลายเซ็นผู้รับเงิน"
          : "ช่องลายเซ็นผู้รับเงินในตัวอย่างว่าง";
    return {
      status: uncertain ? "warning" : "danger",
      title: uncertain ? "ยังยืนยันไม่ได้" : "ยังไม่ครบ",
      description: "เกณฑ์สาธิตกรณีนี้กำหนดให้มีลายเซ็นผู้รับเงิน",
      issues: [[reason, "signature"]],
      actions: [
        [
          uncertain
            ? "ถ่ายช่องลายเซ็นผู้รับเงินให้ชัด แล้วตรวจใหม่"
            : "ขอผู้รับเงินจริงลงนามตามเกณฑ์ที่ใช้กับเอกสารนี้",
          uncertain
            ? "คุณ · ภาพไม่ชัดไม่เท่ากับไม่มีลายเซ็น"
            : "ผู้รับเงิน · ไม่ให้ผู้อื่นลงชื่อแทน",
        ],
        [
          "ตรวจองค์ประกอบอื่นและเกณฑ์เบิกจ่ายก่อนส่งต่อ",
          "คุณและ AFP · การพบลายเซ็นไม่ทำให้เอกสารผ่านทุกข้อ",
        ],
      ],
      button: "ดูช่องลายเซ็นในภาพ",
      focus: "signature",
      ...(uncertain ? { uncertain: "signature" } : { missing: "signature" }),
    };
  }
  if (s === "missing") {
    const byKind = [
      {
        label: "ชื่อและที่อยู่ผู้ซื้อ",
        region: "buyer",
        action:
          "ขอร้านแก้ไขชื่อและที่อยู่ผู้ซื้อให้ตรงกับข้อมูลที่องค์กรยืนยัน",
      },
      {
        label: "วันที่ออกเอกสาร",
        region: "issuer",
        action: "ขอร้านออกเอกสารที่มีวันที่ถูกต้อง",
      },
      {
        label: "หลักฐานผู้รับเงินตามเกณฑ์จำลอง",
        region: "signature",
        action: "ขอร้านเติมหลักฐานรับเงินตามเกณฑ์ที่ใช้กับเอกสารนี้",
      },
      {
        label: "ชื่อผู้ออกใบเสร็จ",
        region: "issuer",
        action: "ขอผู้ออกเอกสารระบุชื่อผู้รับเงินให้ชัดเจน",
      },
    ][state.kind];
    return {
      status: "danger",
      title: "ยังไม่ครบ",
      description: "พบข้อมูลขาดในต้นฉบับตัวอย่าง 1 ประเด็น",
      issues: [["ยังไม่มี" + byKind.label, byKind.region]],
      actions: [
        [byKind.action, "ร้าน/ผู้ออกเอกสาร · ผู้เบิกไม่แก้ต้นฉบับแทนร้าน"],
        [
          "ตรวจฉบับแก้ไขและชุดเอกสารก่อนส่ง AFP",
          "คุณ · ยังต้องยืนยันเกณฑ์เบิกจ่ายที่ใช้จริง",
        ],
      ],
      button: "ดูข้อความขอแก้ไข",
      dialog: "correction",
      missing: byKind.region,
    };
  }
  if (s === "unclear")
    return {
      status: "warning",
      title: "ยังยืนยันไม่ได้",
      description: "บริเวณยอดเงินอ่านไม่ชัด ยังไม่สรุปว่าข้อมูลขาด",
      issues: [["ยอดสุทธิอ่านได้ไม่ครบทุกหลัก", "totals"]],
      actions: [
        [
          "ตรวจยอดจากภาพต้นฉบับหรือถ่ายใหม่",
          "คุณ · ถ่ายให้ตรงและไม่มีแสงสะท้อนทับยอด",
        ],
        [
          "ตรวจยอดและองค์ประกอบอีกครั้งก่อนส่ง AFP",
          "คุณ · ไม่เติมตัวเลขจากการคาดเดา",
        ],
      ],
      button: "ดูยอดในภาพ",
      focus: "totals",
      uncertain: "totals",
    };
  if (s === "conflict")
    return {
      status: "danger",
      title: "ยังไม่ครบ",
      description: "รายการรวมกับยอดสุทธิที่พิมพ์ในตัวอย่างต่างกัน 100.00 บาท",
      issues: [["ยอดตามรายการและภาษี 1,070.00 แต่ยอดสุทธิ 1,170.00", "totals"]],
      actions: [
        [
          "เทียบยอดรายการและยอดสุทธิบนต้นฉบับ",
          "คุณ · ตรวจว่ามีค่าบริการหรือรายการอื่นที่ยังไม่เห็นหรือไม่",
        ],
        [
          "ให้ร้านชี้แจงหรือแก้เอกสารหากยอดผิด",
          "ร้าน/ผู้ออกเอกสาร · ไม่คำนวณเติมยอดที่หายเอง",
        ],
      ],
      button: "เทียบยอดในภาพ",
      focus: "totals",
      uncertain: "totals",
    };
  if (s === "complete")
    return {
      status: "success",
      title: "ครบตามเกณฑ์จำลอง",
      description:
        "ค่าตัวอย่างผ่านรายการตรวจสาธิตแล้ว ไม่ใช่ผลตามเกณฑ์ AFP ปัจจุบัน",
      issues: [],
      actions: [
        [
          "เตรียมชุดเอกสารตามเกณฑ์เบิกจ่ายที่ใช้จริง",
          "คุณ · ต้องมี source ที่องค์กรยืนยันก่อนใช้ผลจริง",
        ],
        [
          "ส่งให้ AFP ตรวจตามขั้นตอน",
          "AFP · เป็นผู้พิจารณาตามอำนาจและเกณฑ์ที่เกี่ยวข้อง",
        ],
      ],
      button: "ดูสรุปส่งต่อ",
      dialog: "summary",
    };
  return {
    status: "warning",
    title: "ยังยืนยันไม่ได้",
    description:
      s === "multiple"
        ? "แยกเป็น 2 ใบแล้ว · ผลนี้เป็นของใบที่เลือก ยังรอเกณฑ์เบิกจ่าย"
        : "พบข้อมูลบนใบเสร็จ แต่ยังไม่มีเกณฑ์เบิกจ่ายที่ยืนยันสำหรับกรณีนี้",
    issues: [
      ["ยังต้องยืนยันรายการเอกสารและข้อมูลผู้ซื้อกับเกณฑ์ที่ใช้จริง", null],
    ],
    actions: [
      [
        "ยืนยันเกณฑ์และชุดเอกสารที่ใช้กับรายการนี้",
        "เจ้าของเรื่องและ AFP · ไม่ใช้ผลอ่านใบเสร็จแทน checklist",
      ],
      [
        "แนบเอกสารที่เกณฑ์กำหนดแล้วตรวจอีกครั้ง",
        "คุณ · ส่งต่อเมื่อข้อมูลและหลักฐานครบตามขอบเขตที่ตรวจ",
      ],
    ],
    button: "ดูสิ่งที่ต้องยืนยัน",
    dialog: "policy",
  };
}
function renderPaper() {
  const paper = $("paper");
  const kind = state.sourceKind;
  paper.replaceChildren();
  paper.classList.toggle("grouped", state.grouped);
  const header = region("header", "หัวเอกสาร");
  header.append(
    node(
      "h3",
      state.scenario === "unsupported"
        ? "ใบเสนอราคา"
        : [
            "ใบเสร็จรับเงิน / ใบกำกับภาษี",
            "ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ",
            "บิลเงินสด",
            "ใบเสร็จรับเงิน",
          ][kind],
    ),
  );
  field("เลขที่", state.document ? "DEMO-002" : "DEMO-001", header);
  const issuer = region("issuer", "ผู้ออก / ผู้ขาย");
  const noIssuer = state.scenario === "missing" && kind === 3;
  issuer.append(
    node(
      "h4",
      noIssuer
        ? "ชื่อผู้ออกเอกสาร: —"
        : state.document
          ? "ร้านตัวอย่าง บี (สังเคราะห์)"
          : "ร้านตัวอย่าง เอ (สังเคราะห์)",
    ),
  );
  issuer.append(node("p", "99 ถนนตัวอย่าง อำเภอสมมติ จังหวัดตัวอย่าง"));
  if (kind < 2)
    issuer.append(
      node(
        "p",
        state.scenario === "buyer-seller-only"
          ? "เลขภาษีผู้ขาย: 0994000423179 (ตัวอย่างสลับบทบาท)"
          : "เลขภาษี: 0000000000000 (ข้อมูลสังเคราะห์)",
      ),
    );
  field(
    "วันที่",
    state.scenario === "missing" && kind === 1
      ? "— ไม่ได้ระบุ —"
      : "20 ตุลาคม 2569",
    issuer,
  );
  const buyer = region("buyer", "ผู้ซื้อ");
  if (kind === 0) {
    const facts = buyerFacts();
    buyer.append(
      node("p", "ผู้ซื้อ: " + (facts.name || "— ไม่ได้ระบุ —")),
      node("p", "ที่อยู่: " + (facts.address || "— ไม่ได้ระบุ —")),
      node("p", "เลขภาษีผู้ซื้อ: " + (facts.taxId || "— ไม่ได้ระบุ —")),
    );
  } else
    buyer.append(
      node("p", "สำหรับตัวอย่างประเภทนี้ ไม่ใช้ข้อผู้ซื้อของเต็มรูปมาเหมารวม"),
    );
  if (state.scenario === "signature-buyer-only") {
    buyer.append(node("p", "ลงชื่อผู้ซื้อ:"), signingMark());
  }
  const items = region("items", "รายการสินค้า / แถวตาราง");
  const table = node("table");
  const caption = node("caption", "รายการจำลอง");
  const tr = node("tr");
  ["รายการ", "จำนวน", "ราคา", "รวม"].forEach((t) => tr.append(node("th", t)));
  const head = node("thead");
  head.append(tr);
  const body = node("tbody");
  (kind === 1
    ? [
        ["วัสดุตัวอย่าง รายละเอียดบรรทัดต่อ", "2", "321.00", "642.00"],
        ["อุปกรณ์ตัวอย่าง", "1", "428.00", "428.00"],
      ]
    : [
        ["วัสดุตัวอย่าง รายละเอียดบรรทัดต่อ", "2", "300.00", "600.00"],
        ["อุปกรณ์ตัวอย่าง", "1", "400.00", "400.00"],
      ]
  ).forEach((cells) => {
    const row = node("tr");
    cells.forEach((t) => row.append(node("td", t)));
    body.append(row);
  });
  table.append(caption, head, body);
  items.append(table);
  const totals = region("totals", "ยอดเงิน");
  field("รวมรายการ", kind === 1 ? "1,070.00" : "1,000.00", totals);
  if (kind !== 1) field("VAT (ตามเอกสารตัวอย่าง)", "70.00", totals);
  else field("ราคารวมภาษีมูลค่าเพิ่มแล้ว", "", totals);
  const amount =
    state.scenario === "unclear"
      ? "1,?70.00"
      : state.scenario === "conflict"
        ? "1,170.00"
        : "1,070.00";
  const total = node("p", undefined, "paper-line total-line");
  total.append(
    node("span", "ยอดสุทธิ"),
    node("span", amount, state.scenario === "unclear" ? "unclear-number" : ""),
  );
  totals.append(total);
  field("รับชำระแล้ว", amount, totals);
  const signature = region("signature", "ลายเซ็นผู้รับเงิน");
  signature.append(
    node("p", "ลงชื่อผู้รับเงิน: __________________", "signature"),
  );
  const reading = signatureReading();
  if (reading.receiver === "present") signature.append(signingMark());
  else if (state.scenario === "signature-unclear")
    signature.append(
      node(
        "p",
        "บริเวณนี้มีแสงสะท้อน / รายละเอียดไม่ชัด",
        "signature-obscured",
      ),
    );
  else if (state.scenario === "signature-text-only") {
    signature.append(
      node("p", "ผู้รับตัวอย่าง (ชื่อพิมพ์)", "signature"),
      node("p", "ตราร้านตัวอย่าง", "example-stamp"),
    );
  }
  paper.append(
    header,
    issuer,
    ...(kind === 0 ? [buyer] : []),
    node("hr", undefined, "paper-rule"),
    items,
    totals,
    signature,
  );
  $("source-caption").textContent =
    state.scenario === "multiple"
      ? `เอกสารจำลอง · เลือกใบที่ ${state.document + 1} จาก 2 ใบ`
      : "เอกสารจำลอง · 1 หน้า";
}
function focusRegion(id) {
  document
    .querySelectorAll(".region.focused")
    .forEach((e) => e.classList.remove("focused"));
  const el = $("region-" + id);
  if (!el) return;
  el.classList.add("focused");
  $("source-hint").textContent = "กำลังชี้: " + el.dataset.label;
  el.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
}
function render() {
  const m = model();
  renderPaper();
  $("source-hint").textContent =
    "กดประเด็นในผลตรวจเพื่อดูจุดที่เกี่ยวข้องบนภาพ";
  $("kind-result").textContent =
    state.scenario === "unsupported" && !state.changed
      ? "ยังจัดเข้าประเภทใบเสร็จไม่ได้"
      : KINDS[state.kind];
  $("kind-note").textContent = state.changed
    ? "คุณเลือกใหม่ · รอตรวจองค์ประกอบอีกครั้ง"
    : state.scenario === "unsupported"
      ? "พบหัวเอกสาร: ใบเสนอราคา"
      : "จากหัวเอกสารตัวอย่าง";
  $("kind").value = String(state.kind);
  $("status-line").className = "status-line " + m.status;
  $("status-title").textContent = m.title;
  $("status-symbol").textContent =
    m.status === "success" ? "✓" : m.status === "danger" ? "!" : "?";
  $("status-description").textContent = m.description;
  const signing = signatureReading();
  const signingLabels = {
    present: "พบลายเซ็นผู้รับเงิน",
    absent: "ไม่พบลายเซ็นผู้รับเงิน",
    uncertain: "ลายเซ็นผู้รับเงิน: ยังยืนยันไม่ได้",
  };
  $("signature-result").textContent =
    signingLabels[signing.receiver] + " · ดูในภาพ";
  $("signature-note").textContent =
    signing.buyer === "present"
      ? "พบลายเซ็นผู้ซื้อแยกต่างหาก ใช้แทนช่องผู้รับเงินไม่ได้"
      : "ตรวจการมีลายเซ็น ไม่ยืนยันตัวผู้ลงชื่อหรือความแท้";
  const comparisons = buyerComparison();
  const buyerStatus = comparisons.some((f) => f.status === "by-type")
    ? "ตรวจตามประเภทเอกสาร"
    : comparisons.some((f) => f.status === "mismatch")
      ? "มีข้อมูลไม่ตรงกับ STeP"
      : comparisons.some((f) => f.status === "not-detected")
        ? "ยังไม่พบข้อมูลครบ"
        : comparisons.some((f) => f.status === "illegible")
          ? "ยังอ่านไม่ชัด"
          : "ตรงกับข้อมูลอ้างอิง STeP";
  $("buyer-result").textContent =
    "ข้อมูลผู้ซื้อ: " + buyerStatus + " · ดูในภาพ";
  $("buyer-note").textContent =
    "เทียบชื่อ ที่อยู่ และเลขภาษี 0-9940-00423-17-9 แยกจากผู้ขาย";
  $("issues").replaceChildren();
  for (const [label, target] of m.issues) {
    const li = node("li");
    const item = node(target ? "button" : "div", undefined, "issue");
    if (target) {
      item.type = "button";
      item.addEventListener("click", () => focusRegion(target));
    }
    item.append(
      node("span", "·", "issue-icon"),
      node("span", label, "issue-label"),
    );
    if (target) item.append(node("span", "ดูในภาพ", "issue-link"));
    li.append(item);
    $("issues").append(li);
  }
  $("evidence").replaceChildren();
  const fields = [
    ["header", "ประเภทและเลขที่เอกสาร"],
    ["issuer", "ผู้ออกและวันที่"],
    ["buyer", "ข้อมูลผู้ซื้อ"],
    ["items", "รายการสินค้าและจำนวน"],
    ["totals", "ยอดเงินและหลักฐานชำระ"],
    ["signature", "ลายเซ็นผู้รับเงิน"],
  ];
  for (const [id, label] of fields) {
    const row = node("div", undefined, "evidence-row");
    const status =
      id === "signature"
        ? signingLabels[signing.receiver]
        : m.reviewAll
          ? "รอตรวจใหม่"
          : m.missing === id
            ? "ขาดในตัวอย่าง"
            : m.conflict === id
              ? "ข้อมูลไม่ตรง"
              : m.uncertain === id
                ? "ต้องตรวจจากภาพ"
                : id === "buyer" && state.kind !== 0
                  ? "ตรวจตามประเภท"
                  : "พบในตัวอย่าง";
    row.append(
      node("span", label),
      node(
        "span",
        status,
        "evidence-state" +
          (m.missing === id || m.conflict === id ? " missing" : ""),
      ),
    );
    $("evidence").append(row);
  }
  if (signing.buyer === "present") {
    const row = node("div", undefined, "evidence-row");
    row.append(
      node("span", "ลายเซ็นผู้ซื้อ"),
      node("span", "พบในช่องผู้ซื้อ", "evidence-state"),
    );
    $("evidence").append(row);
  }
  for (const f of comparisons) {
    const row = node("div", undefined, "buyer-comparison");
    const labels = {
      name: "ชื่อผู้ซื้อ",
      address: "ที่อยู่ผู้ซื้อ",
      taxId: "เลขภาษีผู้ซื้อ",
    };
    const statuses = {
      match: "ตรง",
      mismatch: "ไม่ตรง",
      "not-detected": "ไม่พบข้อมูล",
      illegible: "อ่านไม่ชัด",
      "by-type": "ตรวจตามประเภท",
    };
    row.append(
      node("p", labels[f.key] + " · " + statuses[f.status]),
      node("p", "ค่าอ้างอิง: " + f.expected, "small"),
      node(
        "p",
        "ค่าที่พบ: " + (f.observed || "ยังไม่พบในช่องผู้ซื้อ"),
        "small",
      ),
    );
    $("evidence").append(row);
  }
  const policyRow = node("div", undefined, "evidence-row");
  policyRow.append(
    node("span", "เกณฑ์เบิกจ่ายปัจจุบันของกรณีนี้"),
    node("span", "ยังไม่ได้ยืนยันในต้นแบบ", "evidence-state"),
  );
  $("evidence").append(policyRow);
  $("actions").replaceChildren();
  for (const [text, who] of m.actions) {
    const li = node("li", text);
    li.append(node("small", who));
    $("actions").append(li);
  }
  $("primary").textContent = m.button;
  const tabs = $("document-tabs");
  tabs.hidden = state.scenario !== "multiple";
  tabs.replaceChildren();
  if (!tabs.hidden)
    for (let i = 0; i < 2; i++) {
      const tab = node(
        "button",
        `ใบที่ ${i + 1} · ร้านตัวอย่าง ${i ? "บี" : "เอ"}`,
      );
      tab.type = "button";
      tab.setAttribute("aria-pressed", String(state.document === i));
      tab.addEventListener("click", () => {
        state.document = i;
        state.kind = i ? 2 : 1;
        state.sourceKind = state.kind;
        state.changed = false;
        render();
      });
      tabs.append(tab);
    }
}
function showDialog(type) {
  const m = model();
  $("dialog-title").textContent =
    type === "correction"
      ? "ข้อความขอแก้เอกสาร"
      : type === "summary"
        ? "สรุปผลตรวจส่งต่อ"
        : "สิ่งที่ต้องยืนยันก่อนส่งต่อ";
  $("dialog-text").textContent =
    type === "correction"
      ? `ตัวอย่างเท่านั้น — ไม่ใช่คำขอจริง\n\nเรียน ร้าน/ผู้ออกเอกสาร\nรบกวนตรวจเอกสารเลขที่ DEMO-001\nประเด็น: ${m.issues.map((i) => i[0]).join("; ")}\n${m.actions[0][0]}\nโปรดยืนยันข้อมูลที่ถูกต้องกับผู้เบิกก่อนออกฉบับแก้ไข`
      : type === "summary"
        ? `ตัวอย่างเท่านั้น — เกณฑ์สาธิต ไม่ใช่ผลตรวจจริง\n\nประเภท: ${KINDS[state.kind]}\nองค์ประกอบ: ครบตามเกณฑ์จำลอง\nทำต่อ: ตรวจชุดเอกสารตามเกณฑ์ที่ใช้จริง แล้วส่ง AFP พิจารณา\n\nผลนี้ไม่ใช่การอนุมัติเบิกจ่าย`
        : "ตัวอย่างเท่านั้น — ยังไม่ใช่ checklist AFP\n\nยืนยันประเภทค่าใช้จ่ายและบริบทของเรื่อง\nขอเกณฑ์ชุดเอกสารที่ยังใช้บังคับ พร้อมวันที่/รุ่น\nยืนยันข้อมูลผู้ซื้อที่ต้องใช้จากแหล่งขององค์กร\nแนบหลักฐานตามเกณฑ์แล้วตรวจใหม่\n\nการมีข้อมูลบนใบเสร็จไม่ยืนยันว่าชุดเบิกครบ";
  $("copy-status").textContent = "";
  $("copy").disabled = false;
  $("action-dialog").showModal();
}
$("scenario").addEventListener("change", (e) => {
  state.scenario = e.target.value;
  state.changed = false;
  state.document = 0;
  if (state.scenario === "multiple") state.kind = 1;
  if (
    state.scenario.startsWith("signature-") ||
    state.scenario.startsWith("buyer-")
  )
    state.kind = 0;
  state.sourceKind = state.kind;
  $("kind-editor").hidden = true;
  $("change-kind").setAttribute("aria-expanded", "false");
  render();
});
$("change-kind").addEventListener("click", () => {
  const visible = $("kind-editor").hidden;
  $("kind-editor").hidden = !visible;
  $("change-kind").setAttribute("aria-expanded", String(visible));
  if (visible) $("kind").focus();
});
$("kind").addEventListener("change", (e) => {
  state.kind = Number(e.target.value);
  state.changed = true;
  render();
});
$("grouping").addEventListener("click", () => {
  state.grouped = !state.grouped;
  $("grouping").setAttribute("aria-pressed", String(state.grouped));
  $("paper").classList.toggle("grouped", state.grouped);
});
$("zoom").addEventListener("click", () => {
  state.zoomed = !state.zoomed;
  $("zoom").setAttribute("aria-pressed", String(state.zoomed));
  $("zoom").textContent = state.zoomed ? "พอดีพื้นที่" : "ขยายภาพ";
  $("paper-viewport").classList.toggle("zoomed", state.zoomed);
});
$("theme").addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  $("theme").setAttribute("aria-pressed", String(dark));
  $("theme").textContent = dark ? "โหมดสว่าง" : "โหมดมืด";
});
$("primary").addEventListener("click", () => {
  const m = model();
  if (m.focus) focusRegion(m.focus);
  else showDialog(m.dialog);
});
$("close-dialog").addEventListener("click", () => $("action-dialog").close());
$("signature-result").addEventListener("click", () => focusRegion("signature"));
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("dialog-text").textContent);
    $("copy-status").textContent = "คัดลอกข้อความตัวอย่างแล้ว";
  } catch {
    $("copy-status").textContent =
      "เบราว์เซอร์ไม่อนุญาตให้คัดลอก เลือกข้อความด้านบนแล้วคัดลอกได้";
  }
});
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.classList.add("dark");
  $("theme").setAttribute("aria-pressed", "true");
  $("theme").textContent = "โหมดสว่าง";
}
render();

$("buyer-result").addEventListener("click", () =>
  focusRegion(state.sourceKind === 0 ? "buyer" : "header"),
);
