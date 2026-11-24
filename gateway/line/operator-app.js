(() => {
  const STATUS_LABELS = {
    review: "รออนุมัติส่งกลับ",
    "input-review": "รอตรวจไฟล์แนบ",
    "needs-input": "รอข้อมูลเพิ่ม",
    interrupted: "งานถูกขัดจังหวะ",
    "delivery-unknown": "ผลส่งไม่แน่ชัด",
    delivered: "ส่งแล้ว",
    rejected: "ปฏิเสธ/ปิดงาน",
    blocked: "ถูกบล็อก",
    audit: "ประวัติและสถิติ",
  };

  const ERROR_LABELS = {
    OPERATOR_TOKEN_INVALID: "โทเค็นผู้ตรวจต้องยาวอย่างน้อย 32 ตัวอักษร",
    OPERATOR_AUTH_FAILED: "โทเค็นไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    OPERATOR_GATEWAY_UNAVAILABLE: "ติดต่อ LINE Gateway ไม่ได้ ตรวจว่าเซิร์ฟเวอร์ทำงานอยู่",
    OPERATOR_CSRF_INVALID: "รหัสความปลอดภัยหมดอายุ กรุณารีเฟรชหรือเข้าสู่ระบบใหม่",
    PRIVACY_REVIEW_REQUIRED: "พบข้อมูลส่วนบุคคลหรือความลับในข้อความ จึงส่งต่อไม่ได้",
    AUTHORITY_REVIEW_REQUIRED: "ข้อความมีลักษณะขออนุมัติหรือลงนามซึ่งต้องทำโดยผู้มีอำนาจ",
    LINE_DISABLED: "นโยบายยังไม่เปิด lineGateway / headless / compatibleProviders",
    LINE_DELIVERY_LIMIT: "ข้อความยาวเกิน 25,000 ตัวอักษร",
    LINE_DELIVERY_UNKNOWN: "การส่งไปยัง LINE ไม่แน่ชัด กรุณาตรวจใน LINE OA Manager ก่อนตัดสินใจ",
    LINE_DELIVERY_FAILED: "ส่งข้อความเข้า LINE ไม่สำเร็จ",
    LINE_BUSY: "ระบบกำลังประมวลผลงานของผู้ใช้นี้อยู่ กรุณารอสักครู่",
    POLICY_CHANGED: "นโยบายเปลี่ยนระหว่างดำเนินงาน งานนี้ต้องเริ่มใหม่",
  };

  const TABS = [
    "review",
    "input-review",
    "needs-input",
    "interrupted",
    "delivery-unknown",
    "audit",
  ];

  const root = document.getElementById("app");
  let csrfToken = "";
  let authenticated = false;
  let activeTab = "review";
  let autoRefresh = true;
  let refreshTimer = null;
  let busyJobId = "";
  let auditFilter = "all";
  let statusBanner = { type: "", text: "" };
  let state = { health: null, pending: [], audit: [] };
  const draftEdits = new Map();
  let confirmState = null;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "className") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "checked" || k === "disabled" || k === "value") {
        node[k] = v;
      } else {
        node.setAttribute(k, String(v));
      }
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(
        typeof child === "string" || typeof child === "number"
          ? document.createTextNode(String(child))
          : child,
      );
    }
    return node;
  }

  function explainError(code) {
    return ERROR_LABELS[code] || (code ? `เกิดข้อผิดพลาด (${code})` : "เกิดข้อผิดพลาด");
  }

  function formatTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.method === "POST" && csrfToken) headers["x-csrf-token"] = csrfToken;
    const res = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (res.status === 401) {
      authenticated = false;
      csrfToken = "";
      stopTimer();
    }
    if (!res.ok) {
      const err = new Error(explainError(json.code));
      err.code = json.code;
      throw err;
    }
    return json;
  }

  function stopTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function startTimer() {
    stopTimer();
    if (authenticated && autoRefresh) {
      refreshTimer = setInterval(() => {
        if (!confirmState && !busyJobId) void loadState(true);
      }, 10_000);
    }
  }

  async function loadState(silent = false) {
    try {
      const next = await api("/api/state");
      state = next;
      if (!silent) statusBanner = { type: "", text: "" };
      // Prune draft edits for jobs no longer in review
      const reviewIds = new Set(
        (state.pending || []).filter((j) => j.status === "review").map((j) => j.id),
      );
      for (const id of draftEdits.keys()) {
        if (!reviewIds.has(id)) draftEdits.delete(id);
      }
      render();
    } catch (err) {
      if (!silent || !authenticated) {
        statusBanner = { type: "error", text: err.message };
        render();
      }
    }
  }

  async function runJobAction(jobId, action, payload, successMessage) {
    busyJobId = jobId;
    statusBanner = { type: "", text: "" };
    render();
    try {
      await api(`/api/jobs/${jobId}/${action}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      draftEdits.delete(jobId);
      statusBanner = { type: "ok", text: successMessage };
      await loadState(true);
    } catch (err) {
      statusBanner = { type: "error", text: err.message };
      if (err.code === "LINE_DELIVERY_UNKNOWN") {
        await loadState(true);
      }
    } finally {
      busyJobId = "";
      confirmState = null;
      render();
    }
  }

  function openConfirm(config) {
    confirmState = config;
    render();
  }

  function renderLogin() {
    let tokenInput;
    const form = el(
      "form",
      {
        className: "op-card op-login",
        onSubmit: async (e) => {
          e.preventDefault();
          const token = tokenInput.value;
          statusBanner = { type: "", text: "" };
          try {
            const res = await api("/api/login", {
              method: "POST",
              body: JSON.stringify({ token }),
            });
            tokenInput.value = "";
            csrfToken = res.csrfToken;
            authenticated = true;
            startTimer();
            await loadState();
          } catch (err) {
            statusBanner = { type: "error", text: err.message };
            render();
          }
        },
      },
      [
        el("h1", {}, "ผู้ตรวจคิวงาน LINE · STeP"),
        el(
          "p",
          { className: "op-muted" },
          "กรอกโทเค็นผู้ตรวจ (STEP_LINE_APPROVER_TOKEN) เพื่อตรวจสอบและอนุมัติร่างก่อนส่งเข้า LINE โทเค็นจะเก็บในเซสชันของเซิร์ฟเวอร์เท่านั้น",
        ),
        statusBanner.text
          ? el("p", { className: `op-banner ${statusBanner.type}`, role: "alert" }, statusBanner.text)
          : null,
        el("label", { className: "op-field" }, [
          el("span", {}, "โทเค็นผู้ตรวจ"),
          (tokenInput = el("input", {
            type: "password",
            name: "token",
            autocomplete: "off",
            required: true,
            minLength: 32,
            placeholder: "อย่างน้อย 32 ตัวอักษร",
          })),
        ]),
        el("div", { className: "op-actions" }, [
          el("button", { type: "submit", className: "op-btn op-primary" }, "เข้าสู่ระบบผู้ตรวจ"),
        ]),
      ],
    );
    root.replaceChildren(form);
  }

  function rejectButton(job) {
    return el(
      "button",
      {
        type: "button",
        className: "op-btn op-danger-outline",
        disabled: busyJobId === job.id,
        onClick: () => {
          openConfirm({
            title: "ยืนยันปฏิเสธและปิดงานนี้?",
            detail: `รหัสพนักงาน: ${job.employeeId} — ระบบจะลบข้อความและไฟล์แนบของงานนี้ออกจากคิวทันที`,
            withReason: true,
            confirmLabel: "ปฏิเสธและปิดงาน",
            danger: true,
            onConfirm: (reason) =>
              runJobAction(
                job.id,
                "reject",
                { confirmReject: true, ...(reason ? { reason } : {}) },
                "ปฏิเสธและปิดงานเรียบร้อยแล้ว",
              ),
          });
        },
      },
      "ปฏิเสธและปิดงาน",
    );
  }

  function renderReviewCard(job) {
    const original = job.text || "";
    const current = draftEdits.has(job.id) ? draftEdits.get(job.id) : original;
    const countNode = el("span", { className: "op-muted op-small" });
    const updateCounter = (val) => {
      const len = val.length;
      const parts = Math.max(1, Math.ceil(len / 5000));
      countNode.textContent = `${len.toLocaleString("th-TH")} / 25,000 ตัวอักษร · แบ่งส่ง ${parts} ข้อความ`;
    };
    updateCounter(current);

    const textarea = el("textarea", {
      rows: 7,
      maxLength: 25000,
      value: current,
      onInput: (e) => {
        draftEdits.set(job.id, e.target.value);
        updateCounter(e.target.value);
      },
    });

    return el("article", { className: "op-card op-job", "data-job-id": job.id }, [
      el("header", { className: "op-job-head" }, [
        el("div", {}, [
          el("strong", {}, `พนักงาน: ${job.employeeId}`),
          el("span", { className: "op-badge" }, job.route || "GENERAL"),
        ]),
        el("span", { className: "op-muted op-small" }, formatTime(job.at)),
      ]),
      el("div", { className: "op-block" }, [
        el("div", { className: "op-label" }, "คำขอจากพนักงาน"),
        el("pre", { className: "op-pre" }, job.query || "-"),
      ]),
      el("label", { className: "op-field" }, [
        el("div", { className: "op-field-row" }, [
          el("span", {}, "ร่างคำตอบ (แก้ไขก่อนส่งได้ — ระบบจะตรวจความปลอดภัยซ้ำก่อนส่ง)"),
          countNode,
        ]),
        textarea,
      ]),
      el("div", { className: "op-actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "op-btn op-primary",
            disabled: busyJobId === job.id,
            onClick: () => {
              const textToSend = draftEdits.has(job.id) ? draftEdits.get(job.id) : original;
              const edited = textToSend !== original;
              openConfirm({
                title: "ยืนยันส่งคำตอบเข้า LINE?",
                detail: `ปลายทาง: ${job.employeeId} · ${textToSend.length.toLocaleString("th-TH")} ตัวอักษร (${Math.max(1, Math.ceil(textToSend.length / 5000))} ข้อความ)${edited ? " · มีการแก้ไขโดยผู้ตรวจ" : ""}`,
                preview: textToSend.slice(0, 600),
                confirmLabel: "อนุมัติและส่งเข้า LINE",
                onConfirm: () =>
                  runJobAction(
                    job.id,
                    "approve",
                    {
                      approveDelivery: true,
                      ...(edited ? { editedText: textToSend } : {}),
                    },
                    `ส่งคำตอบถึง ${job.employeeId} แล้ว`,
                  ),
              });
            },
          },
          "อนุมัติและส่งเข้า LINE",
        ),
        rejectButton(job),
      ]),
    ]);
  }

  function renderInputReviewCard(job) {
    let chkSource;
    let chkDest;
    const report = job.documentReport || {};
    const submitBtn = el(
      "button",
      {
        type: "button",
        className: "op-btn op-primary",
        disabled: true,
        onClick: () =>
          runJobAction(
            job.id,
            "approve-input",
            { reviewedSource: true, approveDestination: true },
            "อนุมัติไฟล์แนบและส่งให้ AI ร่างแล้ว",
          ),
      },
      "อนุมัติให้ AI ร่าง",
    );
    const syncBtn = () => {
      submitBtn.disabled = busyJobId === job.id || !chkSource.checked || !chkDest.checked;
    };
    chkSource = el("input", { type: "checkbox", onChange: syncBtn });
    chkDest = el("input", { type: "checkbox", onChange: syncBtn });

    return el("article", { className: "op-card op-job", "data-job-id": job.id }, [
      el("header", { className: "op-job-head" }, [
        el("div", {}, [
          el("strong", {}, `พนักงาน: ${job.employeeId}`),
          el("span", { className: "op-badge" }, report.classification || "attachment"),
          report.action ? el("span", { className: "op-badge" }, report.action) : null,
        ]),
        el("span", { className: "op-muted op-small" }, formatTime(job.at)),
      ]),
      Array.isArray(report.reviewReasons) && report.reviewReasons.length
        ? el(
            "p",
            { className: "op-small op-warn-text" },
            `หมายเหตุการตรวจเอกสาร: ${report.reviewReasons.join(", ")}`,
          )
        : null,
      el("div", { className: "op-block" }, [
        el("div", { className: "op-label" }, "ข้อความที่สกัดจากไฟล์ (ตรวจความถูกต้องก่อนส่งให้ AI)"),
        el("pre", { className: "op-pre" }, job.source || "-"),
      ]),
      el("div", { className: "op-checks" }, [
        el("label", { className: "op-check" }, [chkSource, el("span", {}, "ตรวจไฟล์ต้นฉบับและผลสกัดแล้ว")]),
        el("label", { className: "op-check" }, [chkDest, el("span", {}, "อนุญาตส่งข้อความที่สกัดแล้วให้ AI ร่างคำตอบ")]),
      ]),
      el("div", { className: "op-actions" }, [submitBtn, rejectButton(job)]),
    ]);
  }

  function renderNeedsInputCard(job) {
    let answerInput;
    const readiness = job.readiness || {};
    const questions = Array.isArray(readiness.clarifyingQuestions)
      ? readiness.clarifyingQuestions.join("\n")
      : readiness.question || readiness.reason || "Router ต้องการข้อมูลเพิ่มเติมจากพนักงาน";

    return el("article", { className: "op-card op-job", "data-job-id": job.id }, [
      el("header", { className: "op-job-head" }, [
        el("div", {}, [
          el("strong", {}, `พนักงาน: ${job.employeeId}`),
          el("span", { className: "op-badge" }, `รอบตอบ ${job.answerCount || 0}/5`),
        ]),
        el("span", { className: "op-muted op-small" }, formatTime(job.at)),
      ]),
      el("div", { className: "op-block" }, [
        el("div", { className: "op-label" }, "คำถามที่ต้องถามพนักงานเพิ่ม"),
        el("pre", { className: "op-pre" }, questions),
      ]),
      el("label", { className: "op-field" }, [
        el("span", {}, "คำตอบที่ได้รับจากพนักงาน"),
        (answerInput = el("textarea", {
          rows: 3,
          maxLength: 2000,
          placeholder: "กรอกข้อมูลเพิ่มเติมที่พนักงานแจ้ง…",
        })),
      ]),
      el("div", { className: "op-actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "op-btn op-primary",
            disabled: busyJobId === job.id,
            onClick: () => {
              const answer = answerInput.value.trim();
              if (!answer) {
                statusBanner = { type: "error", text: "กรุณากรอกคำตอบเพิ่มเติมก่อนส่ง" };
                render();
                return;
              }
              void runJobAction(job.id, "answer", { answer }, "ส่งคำตอบเพิ่มเติมและร่างต่อแล้ว");
            },
          },
          "ส่งคำตอบและร่างต่อ",
        ),
        rejectButton(job),
      ]),
    ]);
  }

  function renderInterruptedCard(job) {
    let queryInput;
    let chkApprove;
    const submitBtn = el(
      "button",
      {
        type: "button",
        className: "op-btn op-primary",
        disabled: true,
        onClick: () => {
          const query = queryInput.value.trim();
          if (!query) {
            statusBanner = { type: "error", text: "กรุณากรอกคำขอที่ตรวจแล้วก่อนส่งร่างใหม่" };
            render();
            return;
          }
          void runJobAction(
            job.id,
            "retry",
            { query, approveProvider: true },
            "ส่งงานที่ขัดจังหวะไปร่างใหม่แล้ว",
          );
        },
      },
      "ส่งร่างใหม่",
    );
    const syncBtn = () => {
      submitBtn.disabled = busyJobId === job.id || !chkApprove.checked;
    };
    chkApprove = el("input", { type: "checkbox", onChange: syncBtn });

    return el("article", { className: "op-card op-job", "data-job-id": job.id }, [
      el("header", { className: "op-job-head" }, [
        el("div", {}, [
          el("strong", {}, `พนักงาน: ${job.employeeId}`),
          el("span", { className: "op-badge" }, job.code || "LINE_RETRY_REQUIRED"),
        ]),
        el("span", { className: "op-muted op-small" }, formatTime(job.at)),
      ]),
      el(
        "p",
        { className: "op-small op-muted" },
        "งานนี้หยุดกลางทางและระบบลบข้อความเดิมเพื่อความปลอดภัย กรุณารับคำขอที่ตรวจแล้วจากพนักงานมากรอกใหม่ (ไม่รีเพลย์อัตโนมัติ)",
      ),
      el("label", { className: "op-field" }, [
        el("span", {}, "คำขอที่ตรวจแล้ว"),
        (queryInput = el("textarea", {
          rows: 3,
          maxLength: 30000,
          placeholder: "ระบุคำขอที่ตรวจแล้ว…",
        })),
      ]),
      el("div", { className: "op-checks" }, [
        el("label", { className: "op-check" }, [chkApprove, el("span", {}, "ยืนยันตรวจข้อความแล้วและอนุญาตส่งให้ AI")]),
      ]),
      el("div", { className: "op-actions" }, [submitBtn, rejectButton(job)]),
    ]);
  }

  function renderUnknownCard(job) {
    return el("article", { className: "op-card op-job", "data-job-id": job.id }, [
      el("header", { className: "op-job-head" }, [
        el("div", {}, [
          el("strong", {}, `พนักงาน: ${job.employeeId}`),
          el("span", { className: "op-badge op-warn" }, "ผลส่งไม่แน่ชัด"),
        ]),
        el("span", { className: "op-muted op-small" }, formatTime(job.at)),
      ]),
      el(
        "div",
        { className: "op-banner warn" },
        "การเชื่อมต่อกับ LINE Push API ขาดช่วงระหว่างส่ง ระบบจึงไม่ส่งซ้ำอัตโนมัติ กรุณาตรวจใน LINE OA Manager ก่อนว่าพนักงานได้รับข้อความแล้วหรือไม่ แล้วเลือกปิดสถานะด้านล่าง",
      ),
      el("div", { className: "op-actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "op-btn op-primary",
            disabled: busyJobId === job.id,
            onClick: () =>
              openConfirm({
                title: "ยืนยันว่าพนักงานได้รับข้อความใน LINE แล้ว?",
                detail: `งานของ ${job.employeeId} จะถูกปิดเป็นสถานะ 'ส่งแล้ว' โดยไม่ส่งข้อความซ้ำ`,
                confirmLabel: "ยืนยันว่าส่งถึงแล้ว",
                onConfirm: () =>
                  runJobAction(
                    job.id,
                    "resolve-unknown",
                    { resolution: "confirmed-delivered" },
                    "บันทึกสถานะว่าส่งถึงแล้ว",
                  ),
              }),
          },
          "ยืนยันว่าส่งถึงแล้ว",
        ),
        el(
          "button",
          {
            type: "button",
            className: "op-btn op-danger-outline",
            disabled: busyJobId === job.id,
            onClick: () =>
              openConfirm({
                title: "ยกเลิกและปิดงานนี้?",
                detail: `งานของ ${job.employeeId} จะถูกปิดเป็นสถานะ 'ปฏิเสธ/ปิดงาน' และลบข้อความที่ค้างอยู่`,
                confirmLabel: "ยกเลิกงานนี้",
                danger: true,
                onConfirm: () =>
                  runJobAction(
                    job.id,
                    "resolve-unknown",
                    { resolution: "cancelled" },
                    "ยกเลิกและปิดงานเรียบร้อยแล้ว",
                  ),
              }),
          },
          "ยกเลิกงานนี้",
        ),
      ]),
    ]);
  }

  function renderAuditTab() {
    const items = (state.audit || []).filter(
      (j) => auditFilter === "all" || j.status === auditFilter,
    );
    const select = el(
      "select",
      {
        value: auditFilter,
        onChange: (e) => {
          auditFilter = e.target.value;
          render();
        },
      },
      [
        el("option", { value: "all" }, "ทุกสถานะ"),
        ...Object.keys(STATUS_LABELS)
          .filter((k) => k !== "audit")
          .map((k) => el("option", { value: k }, STATUS_LABELS[k])),
      ],
    );

    return el("section", { className: "op-audit" }, [
      el("div", { className: "op-audit-bar" }, [
        el("label", { className: "op-inline-field" }, [el("span", {}, "กรองตามสถานะ"), select]),
        el("span", { className: "op-muted op-small" }, `แสดง ${items.length} รายการล่าสุด (metadata เท่านั้น)`),
      ]),
      el("table", { className: "op-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", {}, "อัปเดตล่าสุด"),
            el("th", {}, "รหัสพนักงาน"),
            el("th", {}, "ประเภท"),
            el("th", {}, "สถานะ"),
            el("th", {}, "รายละเอียด"),
          ]),
        ]),
        el(
          "tbody",
          {},
          items.length
            ? items.map((j) =>
                el("tr", {}, [
                  el("td", {}, formatTime(j.updatedAt || j.at)),
                  el("td", {}, j.employeeId || "-"),
                  el("td", {}, j.messageType || "-"),
                  el("td", {}, STATUS_LABELS[j.status] || j.status),
                  el(
                    "td",
                    {},
                    [j.route, j.resolvedCode, j.code, j.editedByOperator ? "แก้ไขโดยผู้ตรวจ" : "", j.rejectReason]
                      .filter(Boolean)
                      .join(" · ") || "-",
                  ),
                ]),
              )
            : [el("tr", {}, [el("td", { colSpan: 5, className: "op-muted" }, "ยังไม่มีประวัติงาน")])],
        ),
      ]),
    ]);
  }

  function renderConfirmModal() {
    if (!confirmState) return null;
    let reasonInput = null;
    return el("div", { className: "op-modal-backdrop", role: "dialog", "aria-modal": "true" }, [
      el("div", { className: "op-card op-modal" }, [
        el("h2", {}, confirmState.title),
        el("p", { className: "op-muted" }, confirmState.detail),
        confirmState.preview ? el("pre", { className: "op-pre" }, confirmState.preview) : null,
        confirmState.withReason
          ? el("label", { className: "op-field" }, [
              el("span", {}, "เหตุผลประกอบ (ไม่บังคับ)"),
              (reasonInput = el("input", {
                type: "text",
                maxLength: 300,
                placeholder: "เช่น ข้อมูลยังไม่ครบ รอเอกสารจริง",
              })),
            ])
          : null,
        el("div", { className: "op-actions" }, [
          el(
            "button",
            {
              type: "button",
              className: `op-btn ${confirmState.danger ? "op-danger" : "op-primary"}`,
              onClick: () => {
                const reason = reasonInput ? reasonInput.value.trim() : "";
                void confirmState.onConfirm(reason);
              },
            },
            confirmState.confirmLabel,
          ),
          el(
            "button",
            {
              type: "button",
              className: "op-btn",
              onClick: () => {
                confirmState = null;
                render();
              },
            },
            "ยกเลิก",
          ),
        ]),
      ]),
    ]);
  }

  function render() {
    if (!authenticated) {
      renderLogin();
      return;
    }

    const pending = state.pending || [];
    const counts = {
      review: pending.filter((j) => j.status === "review").length,
      "input-review": pending.filter((j) => j.status === "input-review").length,
      "needs-input": pending.filter((j) => j.status === "needs-input").length,
      interrupted: pending.filter((j) => j.status === "interrupted").length,
      "delivery-unknown": pending.filter((j) => j.status === "delivery-unknown").length,
      audit: (state.audit || []).length,
    };

    const header = el("header", { className: "op-topbar" }, [
      el("div", {}, [
        el("h1", {}, "ผู้ตรวจคิวงาน LINE · STeP"),
        el("div", { className: "op-health" }, [
          el(
            "span",
            { className: `op-pill ${state.health?.policyReady ? "ok" : "warn"}` },
            state.health?.policyReady ? "นโยบายพร้อมใช้" : "นโยบายยังไม่เปิด",
          ),
          el(
            "span",
            { className: "op-muted op-small" },
            `ค้างตรวจ ${state.health?.pendingCount ?? 0} · กำลังร่าง ${state.health?.runningCount ?? 0}`,
          ),
        ]),
      ]),
      el("div", { className: "op-top-actions" }, [
        el("label", { className: "op-check op-small" }, [
          el("input", {
            type: "checkbox",
            checked: autoRefresh,
            onChange: (e) => {
              autoRefresh = e.target.checked;
              startTimer();
            },
          }),
          el("span", {}, "รีเฟรชอัตโนมัติ"),
        ]),
        el(
          "button",
          { type: "button", className: "op-btn", onClick: () => void loadState() },
          "รีเฟรช",
        ),
        el(
          "button",
          {
            type: "button",
            className: "op-btn",
            onClick: async () => {
              await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
              authenticated = false;
              csrfToken = "";
              stopTimer();
              render();
            },
          },
          "ออกจากระบบ",
        ),
      ]),
    ]);

    const tabs = el(
      "nav",
      { className: "op-tabs", "aria-label": "คิวงาน" },
      TABS.map((tab) =>
        el(
          "button",
          {
            type: "button",
            className: `op-tab ${activeTab === tab ? "active" : ""}`,
            onClick: () => {
              activeTab = tab;
              render();
            },
          },
          `${STATUS_LABELS[tab]} (${counts[tab]})`,
        ),
      ),
    );

    let bodyNode;
    if (activeTab === "audit") {
      bodyNode = renderAuditTab();
    } else {
      const list = pending.filter((j) => j.status === activeTab);
      if (!list.length) {
        bodyNode = el("p", { className: "op-card op-muted" }, `ไม่มีงานค้างในสถานะ "${STATUS_LABELS[activeTab]}"`);
      } else {
        bodyNode = el(
          "section",
          { className: "op-list" },
          list.map((job) => {
            if (job.status === "review") return renderReviewCard(job);
            if (job.status === "input-review") return renderInputReviewCard(job);
            if (job.status === "needs-input") return renderNeedsInputCard(job);
            if (job.status === "interrupted") return renderInterruptedCard(job);
            return renderUnknownCard(job);
          }),
        );
      }
    }

    root.replaceChildren(
      header,
      statusBanner.text
        ? el("p", { className: `op-banner ${statusBanner.type}`, role: "alert" }, statusBanner.text)
        : null,
      tabs,
      bodyNode,
      renderConfirmModal(),
    );
  }

  async function boot() {
    try {
      const session = await api("/api/session");
      if (session.authenticated) {
        authenticated = true;
        csrfToken = session.csrfToken;
        startTimer();
        await loadState();
        return;
      }
    } catch {
      authenticated = false;
    }
    render();
  }

  void boot();
})();
