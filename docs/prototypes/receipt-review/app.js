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
    issuer.append(node("p", "เลขภาษี: 0000000000000 (ข้อมูลสังเคราะห์)"));
  field(
    "วันที่",
    state.scenario === "missing" && kind === 1
      ? "— ไม่ได้ระบุ —"
      : "20 ตุลาคม 2569",
    issuer,
  );
  const buyer = region("buyer", "ผู้ซื้อ");
  if (kind === 0) {
    const missingBuyer = state.scenario === "missing";
    buyer.append(
      node(
        "p",
        "ผู้ซื้อ: " +
          (missingBuyer ? "— ไม่ได้ระบุ —" : "หน่วยงานตัวอย่าง (สังเคราะห์)"),
      ),
    );
    buyer.append(
      node(
        "p",
        "ที่อยู่: " +
          (missingBuyer ? "— ไม่ได้ระบุ —" : "88 ถนนสมมติ จังหวัดตัวอย่าง"),
      ),
    );
  } else
    buyer.append(
      node("p", "สำหรับตัวอย่างประเภทนี้ ไม่ใช้ข้อผู้ซื้อของเต็มรูปมาเหมารวม"),
    );
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
  const signature = region("signature", "หลักฐานผู้รับเงิน");
  signature.append(
    node(
      "p",
      state.scenario === "missing" && kind === 2
        ? "ผู้รับเงิน: — ไม่ได้ระบุ —"
        : "ผู้รับเงิน: ผู้รับตัวอย่าง",
      "signature",
    ),
  );
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
    ["signature", "หลักฐานผู้รับเงินตามกรณี"],
  ];
  for (const [id, label] of fields) {
    const row = node("div", undefined, "evidence-row");
    const status = m.reviewAll
      ? "รอตรวจใหม่"
      : m.missing === id
        ? "ขาดในตัวอย่าง"
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
        "evidence-state" + (m.missing === id ? " missing" : ""),
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
