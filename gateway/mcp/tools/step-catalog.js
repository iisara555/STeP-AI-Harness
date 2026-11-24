import { readFile } from "node:fs/promises";
import { join } from "node:path";

const UNREADABLE_DOCUMENT = new Set([
  "not-provided",
  "superseded",
  "archived",
  "withdrawn",
  "restricted",
  "unregistered",
]);

function stripYamlScalar(raw = "") {
  const text = String(raw).trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text.replace(/^['"]|['"]$/g, "");
}

export function parseMisRegister(markdown) {
  const fetchedAt =
    /\*\*ดึงข้อมูลเมื่อ:\*\*\s*(\d{4}-\d{2}-\d{2})/.exec(markdown)?.[1] || "";
  const entries = [];
  const seen = new Set();
  let currentTeam = "";

  for (const rawLine of String(markdown || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      const teamMatch = /^##\s+ทีม\s+([^·\n]+?)\s*·/.exec(line);
      currentTeam = teamMatch ? teamMatch[1].trim() : "";
      continue;
    }
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 6 && cells.length !== 7) continue;
    if (cells[0] === "ทีม" || cells[0] === "เลขที่" || /^-{3,}$/.test(cells[0])) {
      continue;
    }

    const [team, code, type, rev, effectiveDate, title, status] =
      cells.length === 7 ? cells : [currentTeam, ...cells];
    const key = `${team}|${code}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      team,
      code,
      type,
      rev,
      effectiveDate,
      title,
      status,
      active: status === "ใช้อยู่",
    });
  }

  return { fetchedAt, entries };
}

export function parseDocumentsYaml(yamlText) {
  const lines = String(yamlText || "").split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const line of lines) {
    const key = line.match(/^  ([a-z0-9_-]+):\s*$/);
    if (key) {
      current = {
        id: key[1],
        title: "",
        path: "",
        status: "",
        owner: "",
        type: "",
        authority: "",
        verification: "",
        sensitivity: "",
        keywords: [],
      };
      entries.push(current);
      continue;
    }
    if (!current) continue;

    const title = line.match(/^    title:\s*(.+)/);
    if (title) current.title = stripYamlScalar(title[1]);
    const pathMatch = line.match(/^    path:\s*(.+)/);
    if (pathMatch) current.path = stripYamlScalar(pathMatch[1]);
    const index = line.match(/^    index:\s*(.+)/);
    if (index && !current.path) current.path = stripYamlScalar(index[1]);
    const keywords = line.match(/^    keywords:\s*\[(.*)\]/);
    if (keywords) {
      current.keywords = keywords[1]
        .split(",")
        .map((word) => stripYamlScalar(word.trim()))
        .filter(Boolean);
    }
    const meta = line.match(
      /^    (status|owner|type|authority|verification|sensitivity):\s*(.+)/,
    );
    if (meta) current[meta[1]] = stripYamlScalar(meta[2]);
  }

  return entries
    .filter(
      (ref) =>
        ref.path &&
        ref.title &&
        ref.sensitivity !== "restricted" &&
        !UNREADABLE_DOCUMENT.has(ref.status),
    )
    .map(({ sensitivity: _s, ...publicRef }) => publicRef);
}

const B_CATEGORY_DETAILS = {
  B1: {
    scope:
      "ค่าใช้จ่ายจัดประชุม/อบรม/สัมมนา/จัดงาน ทั้งในและนอกสถานที่ของรัฐ รวม Zoom/Google Meet (B1.1–B1.8)",
    restrictions: [
      "B1.5 ของที่ระลึกวิทยากร: ห้ามจัดซื้อครุภัณฑ์เพื่อใช้เป็นของขวัญ/ของที่ระลึก/ของรางวัล",
    ],
  },
  B2: {
    scope:
      "ค่ารับรองอื่น ๆ นอกเหนือจากอาหาร-เครื่องดื่ม และวัสดุอุปโภคบริโภคสำหรับให้บริการบุคคลภายนอก",
    restrictions: ["เฉพาะ The Brick startup space และ The Brick Plus"],
  },
  B3: {
    scope:
      "ค่าโล่/ใบประกาศนียบัตร/กรอบใบประกาศ (พนักงาน/ผู้ช่วยเหลือ/กิจกรรมประกวด)",
    restrictions: [],
  },
  B4: {
    scope:
      "ของขวัญ/ของที่ระลึกแสดงความยินดี เทศกาล/โอกาสสำคัญ และค่าใช้จ่ายจัดงานเฉลิมพระเกียรติหรือพิธีฌาปนกิจในนามหน่วยงาน (B4.1–B4.2)",
    restrictions: [
      "B4.1 ของขวัญ/ของที่ระลึก: ห้ามจัดซื้อครุภัณฑ์เพื่อใช้เป็นของขวัญ/ของที่ระลึก/ของรางวัล",
    ],
  },
  B5: { scope: "ค่าประดับตกแต่งอาคารสถานที่ของรัฐ", restrictions: [] },
  B6: { scope: "ค่ากำจัดสัตว์พาหะโรค/เชื้อโรค-เชื้อรา หน่วยงานรัฐ", restrictions: [] },
  B7: {
    scope:
      "ค่าสมาชิก/จัดซื้อหนังสือ-จุลสาร-วารสาร-สื่ออิเล็กทรอนิกส์ รวม Shutterstock, Line OA (B7.1–B7.2)",
    restrictions: [
      "B7.1 cookies เฉพาะทีม IQI เท่านั้น",
      "จัดซื้อโปรแกรม/สิทธิ์เว็บไซต์ (B7.1) ต้องได้รับอนุมัติจากคณะกรรมการ ICT Committee ก่อน (cmu.to/it-request ผ่านทีม IQI)",
    ],
  },
  B8: { scope: "ค่ากำจัดสิ่งปฏิกูล/จัดเก็บขยะ", restrictions: [] },
  B9: {
    scope:
      "วัสดุอำนวยความสะดวกปฏิบัติงาน และวัตถุดิบการผลิต/การจัดกิจกรรม (B9.1–B9.2)",
    restrictions: [
      "วัสดุอุปโภคบริโภคพนักงานเฉพาะทีม HD เท่านั้น",
      "B9.2 พิธีกรรมทางศาสนา: ดำเนินการผ่าน 5/10000 และต้องแนบรูปถ่ายของไหว้ที่วางหน้าศาลเรียบร้อยแล้ว (แทนหมวด A10 เดิมที่ยกเลิกแล้ว)",
    ],
  },
  B10: { scope: "ค่าน้ำดื่ม", restrictions: [] },
  B11: { scope: "ค่าใช้จ่ายรับเสด็จ/เกี่ยวเนื่องพระราชวงศ์", restrictions: [] },
  B12: {
    scope:
      "ค่าจ้างดำเนินงานนอกเหนือจัดกิจกรรม — ผลิต/บรรจุหีบห่อ (B12.1) และทำความสะอาด/ล้างจาน (B12.2)",
    restrictions: [
      "B12.1 เฉพาะทีม LES/FOODFABR/Foodhall",
      "B12.2 เฉพาะทีม LES/FOODFABR/FOODHALL/IFU/Tech Up/HD",
    ],
  },
};

const FUNDING_FORMS = {
  advance: {
    label: "ขอยืมเงินโครงการ (QP-AF-003 ข้อ 4.1)",
    documents: [
      "สัญญายืมเงิน (FM-AF-001)",
      "ใบขออนุมัติจัดโครงการและเดินทางไปปฏิบัติงาน (FM-AF-002)",
      "ข้อเสนอโครงการ การวางแผนการดำเนินงาน (FM-AF-003)",
      "ใบแจ้งหนี้/ใบเสนอราคา (ถ้ามี)",
    ],
    notes: [
      "ห้ามจ่ายเงินก่อนได้รับอนุมัติสัญญายืม และห้ามใช้เงินยืมสำหรับหมวด C หรือรายการจ้าง/บริการเกิน 10,000 บาทที่ต้องผ่านงานพัสดุ",
    ],
  },
  clearing: {
    label: "เคลียร์เงินยืมโครงการ (QP-AF-003 ข้อ 4.2)",
    documents: [
      "ใบขอเบิกค่าใช้จ่ายการจัดโครงการและเดินทางไปปฏิบัติงาน (FM-AF-002)",
      "ใบเสร็จรับเงิน หรือใบสำคัญรับเงิน (FM-AF-014)",
      "สำเนาบัตรประชาชนผู้รับเงิน หรือใบรับรองแทนใบเสร็จ/ใบรับรองการจ่ายเงิน (พนักงาน FM-AF-035 / ผู้บริหาร FM-AF-036)",
      "เอกสารประกอบเฉพาะงาน (เช่น FM-AF-015 ใบเซ็นชื่อเข้าร่วม / FM-AF-019 ใบรายชื่อเลี้ยงรับรอง / บันทึกข้อความ ถ้ามี)",
      "รายงานขอความเห็นชอบ (ต้องทำภายในกำหนดตามหมวด)",
    ],
    notes: [
      "ต้องสแกน/ถ่ายรูปใบเสร็จเข้าสู่ระบบตรวจสอบใบเสร็จรับเงินใน MIS STeP เพื่อให้งานการเงินตรวจอนุมัติก่อนส่งเอกสารฉบับจริง",
    ],
  },
  reserve: {
    label: "สำรองเงินจ่ายล่วงหน้า (QP-AF-003 ข้อ 4.3)",
    documents: [
      "ขั้นขออนุมัติสำรองจ่าย: ใบขอเบิกค่าใช้จ่ายฯ (FM-AF-002) + ข้อเสนอโครงการฯ (FM-AF-003) (ไม่ต้องทำสัญญายืมเงิน FM-AF-001)",
      "ขั้นขอเบิกเงินสำรองจ่าย: ตรวจใบเสร็จในระบบ MIS STeP + แนบชุดอนุมัติสำรองจ่าย + ใบเสร็จรับเงิน/หลักฐานการจ่ายจริง",
    ],
    notes: ["กรณีขอเบิกสำรองจ่ายไม่ต้องแนบสัญญายืมเงิน (FM-AF-001)"],
  },
};

const BV_TRAVEL_REASON_PARTS = [
  "1. ผู้เดินทาง / ผู้เกี่ยวข้อง (ใคร)",
  "2. วัตถุประสงค์การเดินทาง (ทำอะไร เช่น รับ / ส่ง / อำนวยความสะดวกในการเดินทาง)",
  "3. วันที่หรือช่วงวันที่เดินทาง (เมื่อไร)",
  "4. เส้นทาง / สถานที่ / ต้นทาง–ปลายทาง (จากไหนไปไหน)",
  "5. ชื่อกิจกรรม / โครงการ / งานที่เกี่ยวข้อง (เพื่อกิจกรรมอะไร)",
];

const AFP_DISCLAIMER =
  "ข้อมูลอ้างอิงจากเอกสาร AFP ที่ลงทะเบียนไว้เท่านั้น ไม่ใช่การอนุมัติเบิกจ่าย อัตราที่ไม่ได้ระบุในเอกสาร (เช่น ค่าอาหาร ค่าวิทยากร) ต้องสอบถามงานการเงิน/พัสดุ AFP และยึดฉบับควบคุมใน STeP MIS เป็นหลัก";

function formsForMode(fundingMode) {
  if (fundingMode && Object.hasOwn(FUNDING_FORMS, fundingMode)) {
    return { [fundingMode]: FUNDING_FORMS[fundingMode] };
  }
  return FUNDING_FORMS;
}

export function checkAfpCategory({ category, amountThb, fundingMode } = {}) {
  const raw = String(category || "").trim();
  const upper = raw.toUpperCase();
  const hasAmount = typeof amountThb === "number" && Number.isFinite(amountThb);

  if (upper === "BV" || upper === "BV1" || upper === "BV2") {
    const overCap = hasAmount ? amountThb > 10_000 : undefined;
    return {
      found: true,
      category: upper,
      scope:
        upper === "BV1"
          ? "ค่าพาหนะรวมน้ำมันเชื้อเพลิง (จ้างเหมาพร้อมคนขับ/เช่า)"
          : upper === "BV2"
            ? "ค่าพาหนะไม่รวมน้ำมันเชื้อเพลิง (จ้างเหมาพร้อมคนขับ/เช่า)"
            : "ค่าจ้างเหมาพาหนะรวมน้ำมัน (BV1) และค่าเช่ารถไม่รวมน้ำมันเชื้อเพลิง (BV2)",
      effectiveDate: "2026-09-01",
      capThb: 10_000,
      capBasis:
        "ไม่เกิน 10,000 บาท/คนขับรถ/กิจกรรม (ดำเนินการผ่านการจัดซื้อจัดจ้างภาครัฐ ว.119)",
      eSignatureSupported: true,
      eSignatureNote:
        "รองรับการเพิ่มลายเซ็น E-Signature ใน STeP MIS แล้ว (เริ่มใช้งานจริงปีงบประมาณ 2570)",
      ...(hasAmount ? { amountThb, overCap } : {}),
      ...(overCap
        ? {
            overCapWarning:
              "ยอดที่ระบุเกินเพดาน 10,000 บาท/คนขับรถ/กิจกรรม ต้องดำเนินการผ่านกระบวนการจัดซื้อจัดจ้างของงานพัสดุ และห้ามใช้เงินยืม",
          }
        : {}),
      bvTravelReasonParts: BV_TRAVEL_REASON_PARTS,
      bvSentenceTemplate:
        "เพื่อ [รับ/ส่ง/อำนวยความสะดวกในการเดินทาง] [วิทยากร/บุคลากร/ผู้เข้าร่วมกิจกรรม] วันที่ [วันเดินทาง] จาก [ต้นทาง] ไปยัง [ปลายทาง] เพื่อ [ชื่อกิจกรรม/โครงการ/วัตถุประสงค์]",
      forms: formsForMode(fundingMode),
      citations: [
        "afp-operational-circulars (ข้อ 3 หมวด BV, ข้อ 4 การจ้างเหมารถตู้, ข้อ 7 E-Signature)",
        "afp-bv-travel-reason (ประกาศงานพัสดุ 20 พ.ย. 2569)",
        "qp-af-003 (REV 02)",
      ],
      disclaimer: AFP_DISCLAIMER,
    };
  }

  const bMatch = /^B(1[0-2]|[1-9])(?:\.(\d+))?$/.exec(upper);
  if (bMatch) {
    const base = `B${bMatch[1]}`;
    const info = B_CATEGORY_DETAILS[base];
    const overCap = hasAmount ? amountThb > 10_000 : undefined;
    return {
      found: true,
      category: upper,
      baseCategory: base,
      scope: info.scope,
      effectiveDate: "2026-07-01",
      capThb: 10_000,
      capBasis:
        "ผลรวมทุกรายการย่อยในหมวดเดียวกันไม่เกิน 10,000 บาทต่อหมวด (ไม่ใช่ต่อใบเสร็จ)",
      reportDeadlineWorkingDays: 3,
      reportDeadlineNote:
        "ต้องจัดทำรายงานขอความเห็นชอบภายใน 3 วันทำการ นับถัดจากวันที่ในใบเสร็จรับเงินผ่าน STeP MIS (กฎ 5 วันทำการเดิมก่อน 1 ก.ค. 2569 ล้าสมัยแล้ว)",
      eSignatureSupported: true,
      eSignatureNote:
        "รองรับ E-Signature ใน STeP MIS (เริ่มใช้งานจริงปีงบประมาณ 2570)",
      restrictions: info.restrictions,
      ...(hasAmount ? { amountThb, overCap } : {}),
      ...(overCap
        ? {
            overCapWarning:
              "ยอดรวมเกินเพดาน 10,000 บาทต่อหมวดย่อย ส่วนเกินเบิกไม่ได้ และงานจ้างหรือบริการที่เกิน 10,000 บาทต้องผ่านงานพัสดุ ห้ามใช้เงินยืม",
          }
        : {}),
      forms: formsForMode(fundingMode),
      citations: [
        "afp-operational-circulars (ข้อ 3.1 หมวด B, ข้อ 7 E-Signature)",
        "qp-af-003 (REV 02)",
      ],
      disclaimer: AFP_DISCLAIMER,
    };
  }

  if (upper === "EMERGENCY" || raw === "ฉุกเฉิน" || raw === "หมวดฉุกเฉิน") {
    const overCap = hasAmount ? amountThb > 10_000 : undefined;
    return {
      found: true,
      category: "emergency",
      scope:
        "หมวดฉุกเฉิน (ระเบียบข้อ 79 วรรค 2) — แยกต่างหากจากหมวด B ใช้เมื่อไม่ดำเนินการทันทีจะเกิดความเสียหาย",
      conditionsRequired: [
        "1. มีความจำเป็นเร่งด่วน",
        "2. เกิดขึ้นโดยไม่ได้คาดการณ์ไว้ล่วงหน้า",
        "3. ไม่สามารถดำเนินการได้ทันในระยะเวลาปกติ",
        "ต้องได้รับความเห็นชอบจากหัวหน้าทีมหรือผู้บริหารทีมก่อนดำเนินการทุกครั้ง",
      ],
      capThb: 10_000,
      capBasis: "วงเงินไม่เกิน 10,000 บาท",
      reportDeadlineWorkingDays: 5,
      reportDeadlineNote: "รายงานขอความเห็นชอบภายใน 5 วันทำการ",
      ...(hasAmount ? { amountThb, overCap } : {}),
      ...(overCap
        ? {
            overCapWarning:
              "ยอดเกินเพดาน 10,000 บาท สำหรับหมวดฉุกเฉิน ต้องประสานงานพัสดุและAFP ทันที",
          }
        : {}),
      forms: formsForMode(fundingMode),
      citations: [
        "afp-operational-circulars (ข้อ 3.2 หมวดฉุกเฉิน)",
        "qp-af-003 (REV 02)",
      ],
      disclaimer: AFP_DISCLAIMER,
    };
  }

  if (upper === "C") {
    return {
      found: true,
      category: "C",
      scope:
        "หมวด C (งบวิจัย — ระเบียบข้อ 79 วรรค 2) ดำเนินการผ่านงานพัสดุเท่านั้น ห้ามใช้เงินยืม",
      coveredItems: [
        "1. งานจ้าง/บริการที่นอกเหนือตารางหมวด B และมูลค่าเกิน 10,000 บาท",
        "2. จัดซื้อครุภัณฑ์/สารเคมี",
        "3. ต้นแบบบรรจุภัณฑ์ / ออกแบบและผลิตผลิตภัณฑ์ต้นแบบ (ชิ้นงาน)",
        "4. ผลิตฉลากบรรจุภัณฑ์",
      ],
      capThb: null,
      advanceAllowed: false,
      ...(hasAmount ? { amountThb } : {}),
      warnings: [
        "ต้องดำเนินการผ่านงานพัสดุเท่านั้น ห้ามใช้เงินยืมโครงการ",
      ],
      citations: ["afp-operational-circulars (ข้อ 3.3 หมวด C)"],
      disclaimer: AFP_DISCLAIMER,
    };
  }

  return {
    found: false,
    category: raw,
    validCategories: ["B1..B12", "BV", "BV1", "BV2", "emergency", "C"],
    disclaimer: AFP_DISCLAIMER,
  };
}

export function createStepCatalogTools({ rootDir }) {
  let cachedMis;
  let cachedDocs;

  async function loadMis() {
    if (!cachedMis) {
      const md = await readFile(
        join(rootDir, "docs/knowledge/mis-iso-document-register.md"),
        "utf8",
      );
      cachedMis = parseMisRegister(md);
    }
    return cachedMis;
  }

  async function loadDocs() {
    if (!cachedDocs) {
      const yaml = await readFile(
        join(rootDir, "manifest/documents.yaml"),
        "utf8",
      );
      cachedDocs = parseDocumentsYaml(yaml);
    }
    return cachedDocs;
  }

  return [
    {
      name: "step_mis_lookup",
      description:
        "ค้นหาทะเบียนเอกสารระบบคุณภาพ ISO ของ STeP (MIS register: QM, QP, WI, FM, SD, Master List) เพื่อดูเลขที่ REV วันที่บังคับใช้ และสถานะใช้อยู่/ยกเลิก (Look up controlled STeP MIS document codes, revisions, effective dates, and active/cancelled status)",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string", maxLength: 40 },
          query: { type: "string", maxLength: 200 },
          team: { type: "string", maxLength: 40 },
          type: {
            type: "string",
            enum: ["Master List", "QM", "QP", "WI", "FM", "SD"],
          },
          activeOnly: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
      handler: async (args) => {
        const reg = await loadMis();
        const codeFilter = args.code ? args.code.trim().toUpperCase() : "";
        const queryWords = args.query
          ? args.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
          : [];
        const teamFilter = args.team ? args.team.trim().toLowerCase() : "";
        const limit = args.limit ?? 20;

        let matches = reg.entries.filter((entry) => {
          if (args.activeOnly && !entry.active) return false;
          if (args.type && !entry.type.startsWith(args.type)) return false;
          if (teamFilter && !entry.team.toLowerCase().includes(teamFilter)) {
            return false;
          }
          if (codeFilter && !entry.code.toUpperCase().includes(codeFilter)) {
            return false;
          }
          if (queryWords.length) {
            const haystack = `${entry.code} ${entry.title} ${entry.team} ${entry.type}`.toLowerCase();
            if (!queryWords.every((w) => haystack.includes(w))) return false;
          }
          return true;
        });

        if (codeFilter) {
          matches = [...matches].sort((a, b) => {
            const aExact = a.code.toUpperCase() === codeFilter ? 0 : 1;
            const bExact = b.code.toUpperCase() === codeFilter ? 0 : 1;
            return aExact - bExact;
          });
        }

        return {
          source: "docs/knowledge/mis-iso-document-register.md",
          fetchedAt: reg.fetchedAt,
          totalMatches: matches.length,
          entries: matches.slice(0, limit),
          disclaimer:
            "STeP MIS คือฉบับจริง หาก REV หรือสถานะในระบบ MIS ต่างจากทะเบียนนี้ให้ยึดข้อมูลใน STeP MIS เป็นหลัก",
        };
      },
    },
    {
      name: "step_afp_check_category",
      description:
        "ตรวจเกณฑ์หมวดค่าใช้จ่าย AFP (B1–B12, BV, BV1, BV2, ฉุกเฉิน, C), เพดาน 10,000 บาท, กำหนดส่งรายงาน 3/5 วันทำการ, แบบฟอร์มตามกรณียืม/เคลียร์/สำรองจ่าย และเหตุผล 5 ส่วนหมวด BV (Check AFP expense category rules, caps, deadlines, and required forms)",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["category"],
        properties: {
          category: { type: "string", maxLength: 30 },
          amountThb: { type: "number", minimum: 0, maximum: 100_000_000 },
          fundingMode: {
            type: "string",
            enum: ["advance", "clearing", "reserve"],
          },
        },
      },
      handler: async (args) => checkAfpCategory(args),
    },
    {
      name: "step_doc_catalog",
      description:
        "ค้นหารายการเอกสารองค์กรที่ลงทะเบียนและเปิดอ่านได้ใน STeP (manifest/documents.yaml) ตามทีมหรือคำค้น (Search registered public/active STeP organization documents by keyword or owner team)",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", maxLength: 200 },
          owner: { type: "string", maxLength: 40 },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
      handler: async (args) => {
        const docs = await loadDocs();
        const ownerFilter = args.owner ? args.owner.trim().toLowerCase() : "";
        const queryWords = args.query
          ? args.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
          : [];
        const limit = args.limit ?? 20;

        const matches = docs.filter((doc) => {
          if (ownerFilter && doc.owner.toLowerCase() !== ownerFilter) {
            return false;
          }
          if (queryWords.length) {
            const haystack = [
              doc.id,
              doc.title,
              doc.owner,
              doc.type,
              ...doc.keywords,
            ]
              .join(" ")
              .toLowerCase();
            if (!queryWords.every((w) => haystack.includes(w))) return false;
          }
          return true;
        });

        return {
          source: "manifest/documents.yaml",
          totalMatches: matches.length,
          documents: matches.slice(0, limit),
        };
      },
    },
  ];
}
