(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const reviewCore = window.ReceiptReview;
  const maxFileBytes = 25 * 1024 * 1024;
  const allowedExtensions = new Set(["pdf", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"]);
  const state = {
    file: null,
    previewUrl: null,
    online: false,
    busy: false,
    result: null,
    extracted: null,
    timer: null,
    startedAt: 0,
    optionsInitialized: false,
  };

  const issueText = {
    missing_merchant: "ยังไม่มีชื่อร้านค้าหรือผู้ออกใบเสร็จ",
    missing_date: "ยังไม่มีวันที่บนใบเสร็จ",
    missing_total: "ยังไม่มียอดรวมที่ชำระ",
    invalid_total: "ยอดรวมต้องเป็นตัวเลขมากกว่า 0",
    invalid_subtotal: "ยอดก่อนภาษียังไม่ใช่ตัวเลขที่อ่านได้",
    invalid_vat: "ภาษีมูลค่าเพิ่มยังไม่ใช่ตัวเลขที่อ่านได้",
    amount_mismatch: "ยอดก่อนภาษีบวกภาษีมูลค่าเพิ่มไม่เท่ากับยอดรวม โปรดเทียบใบเสร็จ",
    tax_id_length: "เลขประจำตัวผู้เสียภาษีที่กรอกมีไม่ครบ 13 หลัก",
    unconfirmed_fields: (issue) => `มีข้อมูล ${issue.count} ช่องที่ยังไม่ได้ทำเครื่องหมายว่าตรวจแล้ว`,
    review_lines: (issue) => `มี ${issue.count} บรรทัดที่ต้องตรวจจากภาพต้นฉบับ รวมจุดที่ OCR สองตัวอ่านต่างกัน`,
    resized_image: "ภาพถูกย่อก่อน OCR เพื่อจำกัดการใช้หน่วยความจำ โปรดตรวจข้อความขนาดเล็กบนใบเสร็จ",
    buyer_tax_id_excluded: "พบเลขผู้เสียภาษีในส่วนของลูกค้าหรือผู้ซื้อ จึงไม่เติมเป็นเลขของผู้ออกใบเสร็จ",
  };

  function status(message, kind = "") {
    $("status").textContent = message;
    $("status").className = `status-message${kind ? ` is-${kind}` : ""}`;
  }

  function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function setOnline(online) {
    state.online = online;
    $("offlineBanner").hidden = online;
    $("serviceLabel").textContent = online ? "บริการพร้อมใช้งาน" : "บริการยังไม่พร้อม";
    $("serviceIndicator").className = `service-indicator ${online ? "is-online" : "is-offline"}`;
    updateRunButton();
  }

  async function checkService() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    $("serviceLabel").textContent = "กำลังตรวจบริการ";
    $("serviceIndicator").className = "service-indicator is-checking";
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal: controller.signal });
      const payload = await response.json();
      if (!state.optionsInitialized && payload.ok === true) {
        $("crosscheck").checked = payload.crosscheck_installed === true;
        state.optionsInitialized = true;
      }
      setOnline(response.ok && payload.ok === true);
    } catch {
      setOnline(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  function updateRunButton() {
    $("run").disabled = !state.file || !state.online || state.busy;
    if (state.busy) $("runHint").textContent = "กำลังประมวลผลในเครื่อง";
    else if (!state.file) $("runHint").textContent = "เลือกใบเสร็จเพื่อเริ่มตรวจ";
    else if (!state.online) $("runHint").textContent = "เปิดบริการ OCR แล้วตรวจสถานะอีกครั้ง";
    else $("runHint").textContent = "อ่านด้วย OCR แล้วตรวจข้อมูลก่อนบันทึก";
  }

  function updateSteps(complete = false) {
    const hasFile = Boolean(state.file);
    const hasResult = Boolean(state.result);
    $("stepFile").className = `process-step ${hasFile ? "is-complete" : "is-current"}`;
    $("stepRead").className = `process-step ${hasResult ? "is-complete" : hasFile ? "is-current" : ""}`;
    $("stepReview").className = `process-step ${complete ? "is-complete" : hasResult ? "is-current" : ""}`;
  }

  function clearResult() {
    state.result = null;
    state.extracted = null;
    $("reviewPanel").hidden = true;
    $("evidencePanel").hidden = true;
    $("emptyReview").hidden = false;
    $("expenseNote").value = "";
    $("lowReview").checked = false;
    for (const key of reviewCore.fieldKeys) {
      $(key).value = "";
      $(`${key}Meta`).textContent = "";
      document.querySelector(`[data-confirm="${key}"]`).checked = false;
      document.querySelector(`[data-field-block="${key}"]`).classList.remove("is-confirmed", "is-invalid");
    }
    updateSteps();
  }

  function showPreview(file) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    const content = $("previewContent");
    content.replaceChildren();
    const extension = file.name.split(".").pop().toLowerCase();
    if (extension === "pdf") {
      const frame = document.createElement("iframe");
      frame.title = "ตัวอย่าง PDF ใบเสร็จ";
      frame.src = state.previewUrl;
      content.append(frame);
    } else if (["png", "jpg", "jpeg", "webp", "bmp"].includes(extension)) {
      const image = document.createElement("img");
      image.alt = "ตัวอย่างใบเสร็จที่เลือก";
      image.src = state.previewUrl;
      content.append(image);
    } else {
      const note = document.createElement("p");
      note.className = "preview-unavailable";
      note.textContent = "เบราว์เซอร์ไม่แสดงตัวอย่างไฟล์ชนิดนี้ แต่ยังส่งให้ OCR อ่านได้";
      content.append(note);
    }
    $("preview").querySelector(".preview-empty").hidden = true;
    content.hidden = false;
    $("previewHint").textContent = extension.toUpperCase();
  }

  function setFile(file) {
    if (state.busy) {
      status("รอให้การอ่านใบเสร็จปัจจุบันเสร็จก่อนเปลี่ยนไฟล์", "error");
      return;
    }
    const extension = file?.name?.split(".").pop().toLowerCase();
    if (!file || !allowedExtensions.has(extension)) {
      $("file").value = "";
      status(`รองรับเฉพาะ PDF, JPG, PNG, WebP, TIFF และ BMP${state.file ? " · ยังเลือกไฟล์เดิมอยู่" : ""}`, "error");
      return;
    }
    if (file.size > maxFileBytes) {
      $("file").value = "";
      status(`ไฟล์ใหญ่เกิน 25 MB กรุณาเลือกไฟล์ที่เล็กกว่า${state.file ? " · ยังเลือกไฟล์เดิมอยู่" : ""}`, "error");
      return;
    }
    state.file = file;
    clearResult();
    $("fileCard").hidden = false;
    $("fileName").textContent = file.name;
    $("fileSize").textContent = `${extension.toUpperCase()} · ${formatBytes(file.size)}`;
    $("fileCard").querySelector(".file-type").textContent = extension === "pdf" ? "PDF" : "IMG";
    showPreview(file);
    status("เลือกไฟล์แล้ว กด “อ่านใบเสร็จ” เพื่อดึงข้อมูล", "success");
    updateRunButton();
    updateSteps();
  }

  function removeFile() {
    if (state.busy) return;
    state.file = null;
    $("file").value = "";
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    $("previewContent").replaceChildren();
    $("previewContent").hidden = true;
    $("preview").querySelector(".preview-empty").hidden = false;
    $("previewHint").textContent = "ยังไม่ได้เลือกไฟล์";
    $("fileCard").hidden = true;
    clearResult();
    status("");
    updateRunButton();
  }

  function startTimer() {
    state.startedAt = Date.now();
    $("elapsed").textContent = "00:00";
    state.timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.startedAt) / 1000);
      $("elapsed").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }, 1000);
  }

  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  async function runOcr() {
    if (!state.file || state.busy) return;
    const file = state.file;
    if (!state.online) {
      status("บริการ OCR ยังไม่พร้อม กรุณาเปิด Start-OCR.bat", "error");
      return;
    }
    const threshold = Number($("threshold").value);
    if (!Number.isFinite(threshold) || threshold < 0.10 || threshold > 0.99) {
      status("ค่า confidence ต้องอยู่ระหว่าง 0.10 ถึง 0.99", "error");
      return;
    }

    state.busy = true;
    clearResult();
    $("emptyReview").hidden = true;
    $("loadingPanel").hidden = false;
    updateRunButton();
    status("กำลังอ่านใบเสร็จบนเครื่องนี้");
    startTimer();

    const query = new URLSearchParams({
      filename: file.name,
      threshold: String(threshold),
      handwriting: $("handwriting").checked ? "fallback" : "off",
      crosscheck: $("crosscheck").checked ? "on" : "off",
    });
    try {
      const bytes = await file.arrayBuffer();
      let response;
      try {
        response = await fetch(`/api/ocr?${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: bytes,
        });
      } catch {
        setOnline(false);
        throw new Error("เชื่อมต่อบริการ OCR ในเครื่องไม่ได้ เปิด Start-OCR.bat แล้วกดตรวจสถานะอีกครั้ง");
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || payload.error || "อ่านใบเสร็จไม่สำเร็จ");
      }
      state.result = payload.result;
      state.extracted = reviewCore.extractReceipt(payload.result);
      renderResult();
      const crosscheckMissing = state.result.crosscheck_requested
        && (state.result.summary?.recognized_lines || 0) > 0
        && !(state.result.summary?.crosschecked_lines > 0);
      status(crosscheckMissing
        ? "อ่านข้อมูลแล้ว แต่ OCR ตัวที่สองยังไม่ทำงาน โปรดดูคำเตือนและตรวจใบเสร็จด้วยตนเอง"
        : "อ่านข้อมูลแล้ว โปรดเทียบแต่ละช่องกับใบเสร็จและทำเครื่องหมายเมื่อตรวจแล้ว", crosscheckMissing ? "error" : "success");
    } catch (error) {
      $("emptyReview").hidden = false;
      status(`อ่านใบเสร็จไม่สำเร็จ: ${error.message}`, "error");
    } finally {
      stopTimer();
      state.busy = false;
      $("loadingPanel").hidden = true;
      updateRunButton();
      updateSteps();
    }
  }

  function renderResult() {
    const result = state.result;
    const summary = result.summary || {};
    $("reviewPanel").hidden = false;
    $("emptyReview").hidden = true;
    $("evidencePanel").hidden = false;
    $("metricPages").textContent = summary.pages ?? "—";
    $("metricLines").textContent = summary.recognized_lines ?? "—";
    $("metricLow").textContent = summary.needs_review ?? "—";
    $("summarySubtitle").textContent = result.filename ? `ไฟล์: ${result.filename}` : "โปรดเทียบกับเอกสารต้นทาง";

    for (const key of reviewCore.fieldKeys) {
      const item = state.extracted.fields[key];
      $(key).value = item.value;
      const meta = item.value
        ? `เสนอจาก OCR · หน้า ${item.page ?? "—"}${item.confidence == null ? "" : ` · confidence ${item.confidence.toFixed(2)}`}${item.crosscheckStatus === "disagree" ? ` · EasyOCR อ่านต่าง: ${item.crosscheckCandidate}` : ""}`
        : "OCR ยังไม่พบข้อมูล · กรอกเองได้";
      $(`${key}Meta`).textContent = meta;
      $(`${key}Meta`).title = meta;
      document.querySelector(`[data-confirm="${key}"]`).checked = false;
    }
    $("lowReviewWrap").hidden = !(summary.needs_review > 0);
    $("lowReview").checked = false;
    renderEvidence();
    updateReview();
  }

  function renderEvidence() {
    $("rawText").value = state.result.text || "";
    const records = state.extracted.records;
    const disagreementCount = state.result.summary?.disagreements || 0;
    $("lineCount").textContent = `${records.length} บรรทัด${disagreementCount ? ` · ${disagreementCount} อ่านต่าง` : ""}`;
    const rows = $("ocrRows");
    rows.replaceChildren();
    for (const record of records) {
      const row = document.createElement("tr");
      if (record.needsReview) row.classList.add("is-review");
      if (record.crosscheckStatus === "disagree") row.classList.add("is-disagree");
      const page = document.createElement("td");
      page.textContent = record.page ?? "—";
      const score = document.createElement("td");
      const chip = document.createElement("span");
      chip.className = "confidence-chip";
      chip.textContent = record.confidence == null ? "text layer" : record.confidence.toFixed(2);
      score.append(chip);
      const text = document.createElement("td");
      text.textContent = record.text;
      const alternative = document.createElement("td");
      if (record.crosscheckStatus === "disagree") {
        const label = document.createElement("span");
        label.className = "alternative-label is-disagree";
        label.textContent = "อ่านต่าง · ตรวจภาพ";
        const value = document.createElement("span");
        value.className = "alternative-text";
        value.textContent = record.crosscheckCandidate;
        alternative.append(label, value);
      } else if (record.crosscheckStatus === "agree") {
        const label = document.createElement("span");
        label.className = "alternative-label is-agree";
        label.textContent = "อ่านตรงกัน";
        alternative.append(label);
      } else if (record.crosscheckStatus === "uncertain") {
        const label = document.createElement("span");
        label.className = "alternative-label is-uncertain";
        label.textContent = "ผลสำรองไม่ชัด";
        alternative.append(label);
        if (record.crosscheckCandidate) {
          const value = document.createElement("span");
          value.className = "alternative-text";
          value.textContent = record.crosscheckCandidate;
          alternative.append(value);
        }
      }
      if (record.handwritingCandidate) {
        const label = document.createElement("span");
        label.className = "alternative-label is-uncertain";
        label.textContent = "Thai-TrOCR · ยังไม่ยืนยัน";
        const value = document.createElement("span");
        value.className = "alternative-text";
        value.textContent = record.handwritingCandidate;
        alternative.append(label, value);
      }
      if (!alternative.childNodes.length) alternative.textContent = "—";
      row.append(page, score, text, alternative);
      rows.append(row);
    }
    if (!records.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "ไม่พบบรรทัดข้อความจากเอกสารนี้";
      row.append(cell);
      rows.append(row);
    }
    const warnings = state.result.warnings || [];
    $("warningList").hidden = warnings.length === 0;
    $("warningList").replaceChildren();
    for (const warning of warnings) {
      const paragraph = document.createElement("p");
      const resized = warning.match(/^Image resized from (\d+x\d+) to (\d+x\d+)/);
      if (resized) paragraph.textContent = `ภาพขนาด ${resized[1]} ถูกย่อเป็น ${resized[2]} ก่อนอ่าน โปรดเทียบข้อความขนาดเล็กกับต้นฉบับ`;
      else if (warning.startsWith("High-detail tiled OCR")) paragraph.textContent = "ระบบแบ่งภาพความละเอียดสูงเป็นส่วนย่อยเพื่อรักษารายละเอียด โปรดตรวจข้อมูลสำคัญกับใบเสร็จจริง";
      else if (warning.startsWith("EasyOCR results")) paragraph.textContent = "ผล EasyOCR เป็นคำอ่านอีกแบบ หากอ่านต่างกันให้ตรวจจากภาพใบเสร็จจริง";
      else if (warning.startsWith("EasyOCR cross-check is not installed")) paragraph.textContent = "ยังไม่ได้ติดตั้ง EasyOCR ตัวเสริม เปิด Install-Crosscheck.bat แล้วลองอีกครั้ง";
      else if (warning.startsWith("EasyOCR cross-check could not run")) paragraph.textContent = "EasyOCR ตัวเสริมทำงานไม่สำเร็จ โปรดตรวจจากภาพใบเสร็จเอง";
      else if (warning.startsWith("EasyOCR cross-check was limited")) paragraph.textContent = "เอกสารมีข้อความมาก ระบบเทียบผล OCR ตัวที่สองเฉพาะบางบรรทัด";
      else if (warning.startsWith("EasyOCR cross-check reached")) paragraph.textContent = "ถึงขีดจำกัดการเทียบผล OCR ตัวที่สองในเอกสารนี้แล้ว โปรดตรวจบรรทัดที่เหลือจากต้นฉบับ";
      else if (warning.startsWith("Thai-TrOCR candidates")) paragraph.textContent = "ผล Thai-TrOCR เป็นคำอ่านที่ยังไม่ยืนยัน และไม่แทนข้อความ OCR เดิม";
      else if (warning.startsWith("Thai-TrOCR optional dependencies")) paragraph.textContent = "ยังไม่ได้ติดตั้ง Thai-TrOCR ตัวเสริม เปิด Install-Handwriting.bat แล้วลองอีกครั้ง";
      else if (warning.startsWith("Thai-TrOCR fallback failed")) paragraph.textContent = "Thai-TrOCR อ่านบางบริเวณไม่สำเร็จ โปรดตรวจจากภาพใบเสร็จเอง";
      else if (warning.startsWith("Thai-TrOCR reached")) paragraph.textContent = "ถึงขีดจำกัดการอ่านด้วย Thai-TrOCR ในเอกสารนี้แล้ว โปรดตรวจบรรทัดที่เหลือจากต้นฉบับ";
      else if (warning.startsWith("Thai-TrOCR was limited")) paragraph.textContent = "เอกสารมีข้อความต้องตรวจมาก ระบบใช้ Thai-TrOCR เฉพาะบางบรรทัด";
      else paragraph.textContent = warning;
      $("warningList").append(paragraph);
    }
  }

  function fieldValues() {
    return Object.fromEntries(reviewCore.fieldKeys.map((key) => [key, $(key).value.trim()]));
  }

  function fieldConfirmations() {
    return Object.fromEntries(reviewCore.fieldKeys.map((key) => [key, document.querySelector(`[data-confirm="${key}"]`).checked]));
  }

  function currentReview() {
    return reviewCore.reviewIssues(fieldValues(), fieldConfirmations(), {
      reviewLineCount: state.result?.summary?.needs_review || 0,
      reviewLinesChecked: $("lowReview").checked,
      resized: (state.result?.warnings || []).some((warning) => /resized/i.test(warning)),
      buyerTaxIdExcluded: state.extracted?.buyerTaxIdExcluded || false,
    });
  }

  function updateReview() {
    if (!state.result) return;
    const values = fieldValues();
    const confirmed = fieldConfirmations();
    const review = currentReview();
    const blocking = review.issues.filter((issue) => issue.severity === "blocking");
    $("checksList").replaceChildren();
    for (const issue of review.issues) {
      const row = document.createElement("li");
      row.className = issue.severity === "blocking" ? "is-blocking" : "is-advisory";
      const message = issueText[issue.code];
      row.textContent = typeof message === "function" ? message(issue) : message || issue.code;
      $("checksList").append(row);
    }
    if (!blocking.length) {
      const row = document.createElement("li");
      row.className = "is-clear";
      row.textContent = "ข้อมูลที่กรอกครบและผู้ตรวจทำเครื่องหมายแล้ว";
      $("checksList").prepend(row);
    }
    $("issueCount").textContent = blocking.length ? `${blocking.length} เรื่องต้องตรวจ` : "ไม่พบรายการค้าง";
    $("reviewStatus").textContent = review.complete ? "ตรวจข้อมูลครบแล้ว" : "รอตรวจทาน";
    $("reviewCount").textContent = `${review.confirmedCount} จาก ${review.filledCount} ช่องที่มีข้อมูลตรวจแล้ว`;
    $("summaryBadge").textContent = review.complete ? "ตรวจข้อมูลแล้ว" : "รอตรวจทาน";
    $("summaryBadge").classList.toggle("is-complete", review.complete);
    $("summaryTitle").textContent = review.complete ? "พร้อมบันทึกร่างข้อมูล" : "พบข้อมูลจากใบเสร็จ";
    for (const key of reviewCore.fieldKeys) {
      const block = document.querySelector(`[data-field-block="${key}"]`);
      block.classList.toggle("is-confirmed", Boolean(confirmed[key] && values[key]));
      block.classList.toggle("is-invalid", review.issues.some((issue) => issue.code === `missing_${key}` || issue.code === `invalid_${key}`));
    }
    updateSteps(review.complete);
  }

  function reviewData() {
    const review = currentReview();
    return {
      schema: "step-local-receipt-review/v1",
      review_state: review.complete ? "fields_checked" : "draft_needs_review",
      exported_at: new Date().toISOString(),
      source_filename: state.file?.name || state.result.filename || "",
      fields: fieldValues(),
      field_confirmed: fieldConfirmations(),
      ocr_review_lines_checked: $("lowReview").checked,
      expense_note: $("expenseNote").value.trim(),
      corrected_text: $("rawText").value,
      checks: review.issues,
      ocr: state.result,
    };
  }

  function downloadReview() {
    if (!state.result) return;
    const blob = new Blob([JSON.stringify(reviewData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `step-receipt-review-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("เริ่มดาวน์โหลดร่าง JSON แล้ว โปรดตรวจรายการดาวน์โหลดของเบราว์เซอร์และเก็บไฟล์ตามชั้นข้อมูลของหน่วยงาน", "success");
  }

  async function copyDraft() {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(reviewData(), null, 2));
      status("คัดลอกร่าง JSON แล้ว ข้อมูลจากใบเสร็จอยู่ในคลิปบอร์ดของเครื่องนี้", "success");
    } catch {
      status("คัดลอกร่าง JSON ไม่สำเร็จ ลองบันทึกร่างเป็นไฟล์แทน", "error");
    }
  }

  $("file").addEventListener("change", (event) => setFile(event.target.files[0]));
  $("dropzone").addEventListener("click", () => $("file").click());
  $("dropzone").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("file").click();
    }
  });
  $("dropzone").addEventListener("dragover", (event) => { event.preventDefault(); $("dropzone").classList.add("is-dragover"); });
  $("dropzone").addEventListener("dragleave", () => $("dropzone").classList.remove("is-dragover"));
  $("dropzone").addEventListener("drop", (event) => {
    event.preventDefault();
    $("dropzone").classList.remove("is-dragover");
    setFile(event.dataTransfer?.files?.[0]);
  });
  $("removeFile").addEventListener("click", removeFile);
  $("run").addEventListener("click", runOcr);
  $("serviceButton").addEventListener("click", checkService);
  $("retryService").addEventListener("click", checkService);
  $("download").addEventListener("click", downloadReview);
  $("copyDraft").addEventListener("click", copyDraft);
  $("lowReview").addEventListener("change", updateReview);
  $("viewLowLines").addEventListener("click", () => {
    $("evidencePanel").scrollIntoView({ behavior: "smooth", block: "start" });
    $("ocrRows").querySelector("tr.is-review")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("copyText").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("rawText").value);
      status("คัดลอกข้อความร่างแล้ว", "success");
    } catch {
      status("คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความในช่องด้านล่างแล้วคัดลอก", "error");
    }
  });
  for (const key of reviewCore.fieldKeys) {
    $(key).addEventListener("input", () => {
      document.querySelector(`[data-confirm="${key}"]`).checked = false;
      const candidate = state.extracted?.fields[key];
      if (candidate && $(key).value.trim() !== candidate.value) {
        $(`${key}Meta`).textContent = "แก้ไขจากผล OCR · โปรดตรวจอีกครั้ง";
      }
      updateReview();
    });
    document.querySelector(`[data-confirm="${key}"]`).addEventListener("change", updateReview);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkService(); });
  window.addEventListener("beforeunload", () => { if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); });

  updateRunButton();
  updateSteps();
  checkService();
})();
