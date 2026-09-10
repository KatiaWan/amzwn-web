(function (global) {
  "use strict";

  const EDITABLE = new Set(["问题待确认", "事实待确认", "待费用授权", "结果待确认", "失败", "调用状态不明确"]);

  function normalizeQuestions(items) {
    if (!Array.isArray(items) || items.length < 5 || items.length > 7) throw new Error("买家问题必须保留5至7项");
    const ids = new Set();
    return items.map(function (item, index) {
      const question = String(item.question || "").trim().replace(/\s+/g, " ");
      if (!question || question.length > 200) throw new Error(`第${index + 1}项问题不能为空且不能超过200字`);
      const id = String(item.id || `question-${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      if (!id || ids.has(id)) throw new Error("问题编号不能为空或重复");
      ids.add(id);
      return { id: id, question: question, note: item.note ? String(item.note).trim() : null };
    });
  }

  function apiEndpoint(authCheckUrl, route) {
    const url = new URL(authCheckUrl);
    const queryAt = String(route).indexOf("?");
    url.pathname = queryAt < 0 ? route : String(route).slice(0, queryAt);
    url.search = queryAt < 0 ? "" : String(route).slice(queryAt);
    url.hash = "";
    return url.href;
  }

  function mutationBody(workflow, fields) {
    if (!workflow) throw new Error("请先进入模块4");
    return { ...(fields || {}), taskId: workflow.taskId, expectedRevision: workflow.configRevision, expectedStateVersion: workflow.stateVersion };
  }

  function factDefinitions(workflow) {
    return (workflow?.factSchema || []).filter(function (item) { return item && item.id && item.label; });
  }

  function price(value) {
    return value == null || !Number.isFinite(Number(value)) ? "待服务端报价" : `¥${Number(value).toFixed(4).replace(/(\.\d{2})0+$/, "$1")}`;
  }

  function quoteEntries(quote, version, draft, simulation = false) {
    if (simulation) return [
      ["运行方式", "模拟模型/离线测试"], ["报价版本（预算演练）", quote?.quoteVersion || version || "未提供"],
      ["模型", "mock-module4-offline"], ["推理强度", "无真实模型推理"],
      ["输入Token上限（预算演练）", quote?.maxInputTokens == null ? "未提供" : `${quote.maxInputTokens} tokens`],
      ["输出Token上限（预算演练）", quote?.maxOutputTokens == null ? "未提供" : `${quote.maxOutputTokens} tokens`],
      ["调用上限（预算演练）", `${draft ? quote?.maxCalls ?? 1 : quote?.maxVisionCalls ?? "未提供"}次`],
      ["报价上限（仅预算演练，不扣费）", price(quote?.feeCapCny)], ["实际费用", "¥0.00"],
      ["费用说明", "确定性假回包；真实供应商硬禁用。以上报价仅用于预算与授权流程演练，不代表真实分析或真实模型费用。"]
    ];
    if (!quote) return [["报价", "进入任务后读取服务端报价"]];
    const entries = [
      ["报价版本", quote.quoteVersion || version || "未提供"], ["模型", quote.model || "未提供"],
      ["推理强度", quote.reasoningEffort || "未提供"],
      ["输入Token上限", quote.maxInputTokens == null ? "未提供" : `${quote.maxInputTokens} tokens`],
      ["输出Token上限", quote.maxOutputTokens == null ? "未提供" : `${quote.maxOutputTokens} tokens`],
      [draft ? "草案调用上限" : "视觉调用上限", `${draft ? quote.maxCalls ?? 1 : quote.maxVisionCalls ?? "未提供"}次`],
      ["本步骤费用上限", price(quote.feeCapCny)],
      ["费用说明", quote.fixtureMode ? "本地模拟，实际费用¥0.00" : "服务端报价为估算，实际账单按调用记录核对"]
    ];
    if (quote.estimatedCostCny != null || quote.estimatedTotalCny != null) entries.splice(6, 0, ["预计费用", price(quote.estimatedCostCny ?? quote.estimatedTotalCny)]);
    if (quote.estimatedRateCny != null) entries.splice(6, 0, ["单次费用预留", price(quote.estimatedRateCny)]);
    if (!draft) entries.push(["图片URL上限", `${quote.maxImageUrls ?? "未提供"}张`], ["base64兜底上限", `${quote.maxBase64Fallbacks ?? 0}张（缩略图明确失败后才可另行确认）`], ["自动重试／自动base64", "关闭"]);
    return entries;
  }

  function draftKey(userId, taskId, revision) {
    return `amzwn:m4:${encodeURIComponent(userId)}:${encodeURIComponent(taskId)}:${revision}`;
  }
  function safeReportUrl(work, task, config) {
    try {
      const execution = work.execution || {}, binding = work.reportBinding || execution.reportBinding;
      const url = new URL(execution.reportUrl);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.host !== config.reportHost ||
          task?.id !== work.taskId || task.report_url !== url.href || !binding || binding.taskId !== work.taskId ||
          binding.configRevision !== work.configRevision || binding.reportSha256 !== execution.reportSha256 ||
          !/^[a-f0-9]{64}$/.test(binding.reportSha256)) return null;
      return url.href;
    } catch (_) { return null; }
  }

  global.AMZWN_MODULE4 = Object.freeze({ normalizeQuestions, apiEndpoint, mutationBody, factDefinitions, quoteEntries, draftKey, safeReportUrl });
  const root = document.querySelector("#module4");
  if (!root) return;
  const elements = Object.fromEntries([
    "task-select", "initialize", "refresh", "message", "prerequisites", "material-count", "media-strip", "selection-status", "save-selection",
    "question-title", "draft-notice", "draft-fee-grid", "draft-authorize-check", "generate-questions", "fallback-questions",
    "question-list", "add-question", "save-questions", "confirm-questions", "fact-grid", "save-facts", "confirm-facts",
    "fee-grid", "selection-summary", "selected-media", "authorize-check", "authorize", "progress-card", "report-link", "final-confirm"
  ].map(function (name) { return [name, document.querySelector(`#module4-${name}`)]; }));
  let tasks = [];
  let session = null;
  let sessionGeneration = 0;
  let workflow = null;
  let pollTimer = null;
  let busy = false;
  let localConflict = null;
  let rendering = false;
  function capture() {
    if (!workflow || !session?.user?.id) return null;
    return { userId: session.user.id, taskId: workflow.taskId, revision: localConflict?.local?.taskId === workflow.taskId ? localConflict.local.revision : workflow.configRevision,
      stateVersion: localConflict?.local?.taskId === workflow.taskId ? localConflict.local.stateVersion : workflow.stateVersion,
      questions: Array.from(elements["question-list"].children).map(row => ({ id: row.dataset.questionId, question: row.querySelector("textarea").value })),
      facts: Array.from(elements["fact-grid"].querySelectorAll(".module4-fact")).map(card => ({ id: card.dataset.factKey,
        unknown: card.querySelector("input[type='checkbox']").checked, value: card.querySelector("textarea").value, source: card.querySelector("input[type='text']").value })),
      selection: collectSelection() };
  }
  function remember() {
    if (rendering || !workflow) return;
    if (!unsavedInputs().length) {
      if (!localConflict && session?.user?.id) try {
        global.sessionStorage.removeItem(draftKey(session.user.id, workflow.taskId, workflow.configRevision));
        global.sessionStorage.removeItem(draftKey(session.user.id, workflow.taskId, "latest"));
      } catch (_) {}
      return;
    }
    const draft = capture(); if (!draft) return;
    try { global.sessionStorage.setItem(draftKey(draft.userId, draft.taskId, draft.revision), JSON.stringify(draft)); global.sessionStorage.setItem(draftKey(draft.userId, draft.taskId, "latest"), JSON.stringify(draft)); }
    catch (_) { message("本地草稿无法持久保存，请勿关闭页面。", "error"); }
  }
  function restore(draft) {
    if (!draft || draft.userId !== session?.user?.id || draft.taskId !== workflow?.taskId) return;
    rendering = true;
    elements["question-list"].replaceChildren(); draft.questions.forEach(appendQuestion); renumberQuestions();
    elements["fact-grid"].querySelectorAll(".module4-fact").forEach(card => {
      const fact = draft.facts.find(item => item.id === card.dataset.factKey); if (!fact) return;
      card.querySelector("input[type='checkbox']").checked = fact.unknown;
      card.querySelector("textarea").value = fact.value; card.querySelector("input[type='text']").value = fact.source;
    });
    elements["media-strip"].querySelectorAll("input[type='checkbox']").forEach(control => {
      control.checked = draft.selection.some(item => item.assetId === control.dataset.assetId && item.asin === control.dataset.asin && item.sequence === Number(control.dataset.sequence));
    });
    rendering = false;
    if (workflow.status === "已完成" || draft.revision !== workflow.configRevision || draft.stateVersion !== workflow.stateVersion) {
      localConflict = { local: draft, server: structuredClone(workflow) };
      let conflictView = elements["progress-card"].querySelector(".module4-conflict");
      if (!conflictView) { conflictView = document.createElement("pre"); conflictView.className = "module4-conflict"; elements["progress-card"].append(conflictView); }
      const questionText = items => (items || []).map((item, index) => `${index + 1}. ${item.question}`).join("\n");
      const factText = items => items.map(item => `${(workflow.factSchema || []).find(field => field.id === item.id)?.label || item.id}：${item.unknown ? "未知" : item.value + "（来源：" + item.source + "）"}`).join("\n");
      const mediaText = items => (items || []).map(item => `${item.asin} 第${item.sequence}张（${item.assetId}）`).join("、");
      const serverFacts = Object.entries(workflow.facts || {}).map(([id, fact]) => ({ id, unknown: fact.status === "unknown", value: fact.value, source: fact.source }));
      conflictView.style && (conflictView.style.whiteSpace = "pre-wrap");
      conflictView.textContent = "你的未保存内容\n" + questionText(draft.questions) + "\n" + factText(draft.facts) + "\n选图：" + mediaText(draft.selection) +
        "\n\n服务端当前内容\n" + questionText(workflow.questions) + "\n" + factText(serverFacts) + "\n选图：" + mediaText(workflow.selectedMedia);
      message("服务端版本已变化：本地输入及服务端版本均已保留。请核对差异后再保存；不可直接授权或最终确认。", "error");
    }
    updateActions();
  }
  function storedDraft() {
    if (!workflow || !session?.user?.id) return null;
    try { return JSON.parse(global.sessionStorage.getItem(draftKey(session.user.id, workflow.taskId, workflow.configRevision)) || global.sessionStorage.getItem(draftKey(session.user.id, workflow.taskId, "latest")) || "null"); } catch (_) { return null; }
  }
  const fixtureTransport = global.AMZWN_MODULE4_FIXTURE_TRANSPORT || null;

  function message(text, kind) {
    elements.message.textContent = text;
    elements.message.className = "form-status" + (kind ? ` is-${kind}` : "");
  }

  async function request(route, options) {
    if (fixtureTransport) return fixtureTransport.request(route, options || {});
    const intendedUser = session?.user?.id;
    const requestGeneration = sessionGeneration;
    let active = await global.AMZWN.currentSession();
    if (active?.expires_at && active.expires_at * 1000 <= Date.now() + 60000) {
      const refreshed = await global.AMZWN.client.auth.refreshSession();
      if (refreshed.error) throw new Error("会话刷新失败；未发送写请求，请重新登录后核对状态。");
      active = refreshed.data.session;
    }
    if (sessionGeneration !== requestGeneration || !active || active.user.id !== intendedUser || active.user.id !== session?.user?.id) throw new Error("会话已过期或账号变化；草稿已保留，请重新登录后核对状态。");
    session = active;
    const requestUser = active.user.id;
    const response = await fetch(apiEndpoint(global.AMZWN.config.apiUrl, route), {
      ...(options || {}), headers: { Authorization: `Bearer ${session.access_token}`, ...(options?.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store"
    });
    const body = await response.json().catch(function () { return {}; });
    if (sessionGeneration !== requestGeneration || session?.user?.id !== requestUser) throw new Error("账号已变化，已丢弃旧账号返回数据。");
    if (!response.ok) { const error = new Error(body.message || body.error || `模块4接口拒绝了请求（${response.status}）`); error.status = response.status; throw error; }
    return body;
  }

  function fillTasks(nextTasks) {
    tasks = (nextTasks || []).filter(function (task) { return task.status === "已完成"; });
    const current = elements["task-select"].value;
    elements["task-select"].replaceChildren(new Option("请选择任务", ""));
    tasks.forEach(function (task) { elements["task-select"].append(new Option(`${task.productLabel ? task.productLabel + " · " : ""}${task.asin} · ${task.id.slice(0, 8)}`, task.id)); });
    const candidate = new URLSearchParams(location.search).get("module4Task") || current;
    if (tasks.some(function (task) { return task.id === candidate; })) { elements["task-select"].value = candidate; loadStatus(); }
  }

  function mediaCard(item, selected) {
    const card = document.createElement("article");
    card.className = "module4-media-item" + (selected ? " is-selected" : "");
    const image = document.createElement("img");
    image.src = item.thumbnailUrl || item.originalUrl;
    image.alt = `${item.asin} 第${item.sequence}张`;
    image.loading = "lazy";
    const strong = document.createElement("strong");
    strong.textContent = (item.asin === workflow.ownAsin ? "本品" : "竞品") + (selected ? " · 本次已选" : "");
    const label = document.createElement("small");
    label.textContent = `${item.asin} · 第${item.sequence}张`;
    card.append(image, strong, label);
    if (selected) {
      const asset = document.createElement("small"); asset.textContent = `素材ID：${item.assetId}`;
      const original = document.createElement("a"); original.textContent = "查看原图"; original.href = item.originalUrl; original.target = "_blank"; original.rel = "noopener noreferrer";
      const thumbnail = document.createElement("a"); thumbnail.textContent = "查看_SL800_缩略图"; thumbnail.href = item.thumbnailUrl; thumbnail.target = "_blank"; thumbnail.rel = "noopener noreferrer";
      card.append(asset, original, thumbnail);
    } else {
      const choice = document.createElement("label"); choice.className = "module4-media-choice";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox";
      checkbox.dataset.assetId = item.assetId; checkbox.dataset.asin = item.asin; checkbox.dataset.sequence = String(item.sequence);
      checkbox.checked = (workflow.selectedMedia || []).some(candidate => candidate.asin === item.asin && Number(candidate.sequence) === Number(item.sequence) && candidate.assetId === item.assetId);
      checkbox.setAttribute("aria-label", `选择${item.asin}第${item.sequence}张素材${item.assetId}`);
      checkbox.addEventListener("change", updateActions);
      const text = document.createElement("span"); text.textContent = "纳入本次分析"; choice.append(checkbox, text); card.append(choice);
    }
    return card;
  }

  function renderPrerequisites() {
    elements.prerequisites.replaceChildren(); elements["media-strip"].replaceChildren();
    if (!workflow) { elements.prerequisites.innerHTML = '<div class="module4-empty">进入模块4后显示开放条件与缺失项。</div>'; elements["material-count"].textContent = "尚未读取任务资料。"; return; }
    const issues = workflow.prerequisiteIssues || [];
    const checks = [
      ["基础任务", !issues.some(item => item.includes("基础任务")), "关键词基础报告已完成"],
      ["模块3", !issues.some(item => item.includes("模块3")), "竞品配置与结果已确认"],
      ["正式媒体", !issues.some(item => item.includes("媒体清单")), "任务所有者已核对完整"],
      ["本品／竞品", !issues.some(item => item.includes("档案")), `${workflow.ownAsin} + ${(workflow.competitorAsins || []).length}个竞品`]
    ];
    checks.forEach(function (check) {
      const card = document.createElement("div"); card.className = "module4-prerequisite" + (check[1] ? "" : " is-blocked");
      const strong = document.createElement("strong"); strong.textContent = `${check[1] ? "已满足" : "缺失"} · ${check[0]}`;
      const small = document.createElement("small"); small.textContent = check[1] ? check[2] : issues.join("；");
      card.append(strong, small); elements.prerequisites.append(card);
    });
    const media = workflow.mediaSet || [];
    elements["material-count"].textContent = `${workflow.ownAsin} · ${(workflow.competitorAsins || []).length}个竞品 · ${media.length}张正式图片`;
    media.forEach(function (item) { elements["media-strip"].append(mediaCard(item, false)); });
  }

  function appendQuestion(item, index) {
    const row = document.createElement("article"); row.className = "module4-question-row"; row.dataset.questionId = item.id;
    const number = document.createElement("span"); number.className = "module4-question-index"; number.textContent = String(index + 1);
    const textarea = document.createElement("textarea"); textarea.value = item.question; textarea.maxLength = 200; textarea.placeholder = "输入买家下单前会确认的问题"; textarea.setAttribute("aria-label", `第${index + 1}项买家问题`);
    textarea.addEventListener("input", updateActions);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "module4-remove-question"; remove.textContent = "删除";
    remove.addEventListener("click", function () { if (elements["question-list"].children.length <= 5) return message("至少保留5项买家问题。", "error"); row.remove(); renumberQuestions(); updateActions(); });
    row.append(number, textarea, remove); elements["question-list"].append(row);
    return row;
  }

  function simulationMode() { return Boolean(workflow?.simulation || workflow?.questionDraft?.simulation || workflow?.execution?.simulation); }

  function renderQuestions() {
    elements["question-list"].replaceChildren();
    const questions = workflow?.questions || [];
    elements["question-title"].textContent = `${questions.length || "5—7"}项买家下单前确认`;
    elements["draft-notice"].textContent = simulationMode() ? "模拟模型/离线测试：使用确定性假回包形成草案，需人工核对；不能作为真实AI分析。" : workflow?.questionDraft?.notice || (workflow ? "请先核对草案报价并授权。AI会根据当前产品资料提炼问题及需要你核实的事实字段。" : "进入模块4后读取产品资料与草案报价。");
    questions.forEach(appendQuestion);
    fillQuote(elements["draft-fee-grid"], quoteEntries(workflow?.draftQuote, workflow?.quoteVersion, true, simulationMode()));
  }

  function renumberQuestions() {
    Array.from(elements["question-list"].children).forEach(function (row, index) { row.querySelector(".module4-question-index").textContent = String(index + 1); row.querySelector("textarea").setAttribute("aria-label", `第${index + 1}项买家问题`); });
    elements["question-title"].textContent = `${elements["question-list"].children.length}项买家下单前确认`;
  }

  function collectQuestions() {
    return normalizeQuestions(Array.from(elements["question-list"].children).map(function (row) { return { id: row.dataset.questionId, question: row.querySelector("textarea").value, note: null }; }));
  }

  function renderFacts() {
    elements["fact-grid"].replaceChildren();
    const definitions = factDefinitions(workflow);
    if (!definitions.length) { elements["fact-grid"].innerHTML = '<div class="module4-empty">问题草案形成后，显示当前产品需要核实的事实。未知项保持未知。</div>'; return; }
    definitions.forEach(function (definition) {
      const key = definition.id;
      const item = workflow?.facts?.[key] || { status: "unknown", value: null, source: null };
      const card = document.createElement("article"); card.className = "module4-fact"; card.dataset.factKey = key;
      const title = document.createElement("strong"); title.textContent = definition.label;
      const unknownLabel = document.createElement("label"); unknownLabel.className = "module4-unknown";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = item.status === "unknown"; checkbox.setAttribute("aria-label", `${definition.label}：目前未知`);
      const unknownText = document.createElement("span"); unknownText.textContent = "目前未知，不让系统推断"; unknownLabel.append(checkbox, unknownText);
      const value = document.createElement("textarea"); value.placeholder = "填写已确认事实及边界"; value.value = item.value || ""; value.maxLength = 1500; value.setAttribute("aria-label", `${definition.label}：已确认事实`);
      const source = document.createElement("input"); source.type = "text"; source.placeholder = "证据来源（如说明书、包装清单）"; source.value = item.source || ""; source.maxLength = 500; source.setAttribute("aria-label", `${definition.label}：证据来源`);
      const sync = function () { value.disabled = checkbox.checked; source.disabled = checkbox.checked; if (checkbox.checked) { value.value = ""; source.value = ""; } };
      checkbox.addEventListener("change", function () { sync(); updateActions(); });
      value.addEventListener("input", updateActions); source.addEventListener("input", updateActions);
      sync(); card.append(title, unknownLabel, value, source); elements["fact-grid"].append(card);
    });
  }

  function collectFacts() {
    return Object.fromEntries(Array.from(elements["fact-grid"].querySelectorAll(".module4-fact")).map(function (card) {
      const unknown = card.querySelector('input[type="checkbox"]').checked;
      const value = card.querySelector("textarea").value.trim(); const source = card.querySelector('input[type="text"]').value.trim();
      if (!unknown && (!value || !source)) throw new Error("已确认事实需填写内容和证据来源；无法确认时请标记未知");
      return [card.dataset.factKey, unknown ? { status: "unknown", value: null, source: null } : { status: "confirmed", value, source }];
    }));
  }

  function fillQuote(target, entries) {
    target.replaceChildren();
    entries.forEach(function (entry) { const div = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = entry[0]; const dd = document.createElement("dd"); dd.textContent = entry[1]; div.append(dt, dd); target.append(div); });
  }

  function renderFee() {
    fillQuote(elements["fee-grid"], quoteEntries(workflow?.analysisPlan, workflow?.quoteVersion, false, simulationMode()));
    const selected = workflow?.selectedMedia || [];
    const ownCount = selected.filter(item => item.asin === workflow?.ownAsin).length;
    elements["selection-summary"].textContent = selected.length ? `本次授权准确范围：${selected.length}张（本品${ownCount}张、竞品${selected.length - ownCount}张）。仅以下图片进入分析，不代表全部媒体已分析。` : "等待服务端验证并提供本次选图集合。";
    elements["selected-media"].replaceChildren(); selected.forEach(function (item) { elements["selected-media"].append(mediaCard(item, true)); });
  }

  function collectSelection() {
    return Array.from(elements["media-strip"].querySelectorAll("input[type='checkbox']")).filter(control => control.checked).map(function (control) {
      return { asin: control.dataset.asin, sequence: Number(control.dataset.sequence), assetId: control.dataset.assetId };
    });
  }

  function selectionChanged() {
    const identity = item => `${item.asin}|${Number(item.sequence)}|${item.assetId}`;
    return JSON.stringify(collectSelection().map(identity).sort()) !== JSON.stringify((workflow?.selectedMedia || []).map(identity).sort());
  }

  function unsavedInputs() {
    if (!workflow) return [];
    const changes = [];
    const clean = value => String(value || "").trim().replace(/\s+/g, " ");
    const currentQuestions = Array.from(elements["question-list"].children).map(row => ({ id: row.dataset.questionId, question: clean(row.querySelector("textarea").value) }));
    const savedQuestions = (workflow.questions || []).map(item => ({ id: item.id, question: clean(item.question) }));
    if (JSON.stringify(currentQuestions) !== JSON.stringify(savedQuestions)) changes.push("买家问题");
    const currentFacts = Array.from(elements["fact-grid"].querySelectorAll(".module4-fact")).map(function (card) {
      const unknown = card.querySelector("input[type='checkbox']").checked;
      return { id: card.dataset.factKey, status: unknown ? "unknown" : "confirmed", value: unknown ? null : clean(card.querySelector("textarea").value), source: unknown ? null : clean(card.querySelector("input[type='text']").value) };
    });
    const savedFacts = factDefinitions(workflow).map(function (item) {
      const fact = workflow.facts?.[item.id] || { status: "unknown" }; const unknown = fact.status === "unknown";
      return { id: item.id, status: fact.status, value: unknown ? null : clean(fact.value), source: unknown ? null : clean(fact.source) };
    });
    if (JSON.stringify(currentFacts) !== JSON.stringify(savedFacts)) changes.push("产品事实");
    if (selectionChanged()) changes.push("选图范围");
    return changes;
  }

  function renderProgress() {
    const status = workflow?.status || "尚未开始";
    const details = { "未开放": "请先补齐上方前置条件。", "问题待确认": "生成或手动编辑5—7项买家问题，再确认清单。", "问题生成中": "正在按已授权报价提炼买家问题。", "事实待确认": "按当前产品填写有来源的事实；无法确认的保持未知。", "待费用授权": "请核对准确选图与服务端报价。", "待处理": "授权已绑定当前修订，等待领取。", "进行中": "正在按授权范围分析，可稍后刷新状态。", "结果待确认": "请查看报告05，返回编辑或最终确认。", "已完成": "结果已最终确认并锁定。", "失败": "本次执行已停止，请查看原因后决定下一步。", "调用状态不明确": "调用状态需要核对，已停止。修改修订不能绕过未核实调用。" };
    elements["progress-card"].dataset.state = status; elements["progress-card"].replaceChildren();
    const strong = document.createElement("strong"); strong.textContent = status;
    const paragraph = document.createElement("p"); paragraph.textContent = details[status] || "等待操作。";
    elements["progress-card"].append(strong, paragraph);
    const error = workflow?.failureReason || workflow?.failure_reason || workflow?.execution?.error;
    if (error) { const detail = document.createElement("p"); detail.textContent = typeof error === "string" ? error : error.message || "请核对执行记录。"; elements["progress-card"].append(detail); }
    if (simulationMode()) { const simulation = document.createElement("p"); simulation.textContent = "模拟模型/离线测试 · mock-module4-offline：确定性假回包，真实供应商硬禁用，实际费用¥0.00；不能作为真实分析。"; elements["progress-card"].append(simulation); }
    if (workflow?.execution?.fixtureMode) { const fixture = document.createElement("p"); fixture.textContent = "本地适配器模拟结果：真实模型调用0次，实际费用¥0.00。"; elements["progress-card"].append(fixture); }
    const reportUrl = fixtureTransport ? workflow?.execution?.reportUrl : (workflow && safeReportUrl(workflow, tasks.find(task => task.id === workflow.taskId), global.AMZWN.config)); elements["report-link"].hidden = !reportUrl; elements["report-link"].href = reportUrl || "#";
    if (workflow?.execution?.reportUrl && !reportUrl) { const warning = document.createElement("p"); warning.textContent = "报告链接暂未通过当前任务及修订核对，请刷新状态或联系管理员。"; elements["progress-card"].append(warning); }
  }

  function updateActions() {
    remember();
    const status = workflow?.status || ""; const editable = !busy && EDITABLE.has(status); const count = elements["question-list"].children.length;
    const selectionDirty = selectionChanged();
    const dirtyInputs = unsavedInputs();
    const selectedCount = collectSelection().length;
    elements["selection-status"].textContent = selectionDirty ? `已勾选${selectedCount}张，改动尚未保存。保存后由服务端验证范围并重新报价。` : workflow ? `已保存${selectedCount}张选图。可调整上方勾选后保存；至少保留本品、竞品各1张。` : "进入任务后可选择本次分析图片。";
    elements["save-selection"].disabled = !editable || !selectionDirty;
    elements["media-strip"].querySelectorAll("input[type='checkbox']").forEach(function (control) { control.disabled = !editable; });
    elements["task-select"].disabled = busy; elements.refresh.disabled = busy;
    elements.initialize.disabled = busy || !elements["task-select"].value || Boolean(workflow);
    const draftAllowed = editable && ["问题待确认", "失败"].includes(status);
    elements["draft-authorize-check"].disabled = !draftAllowed || !workflow?.draftQuote;
    elements["generate-questions"].disabled = !draftAllowed || !workflow?.draftQuote || !elements["draft-authorize-check"].checked;
    elements["fallback-questions"].disabled = !editable || !["问题待确认", "失败", "调用状态不明确"].includes(status);
    elements["add-question"].disabled = !editable || count >= 7;
    elements["save-questions"].disabled = !editable || count < 5;
    elements["confirm-questions"].disabled = !editable || status !== "问题待确认" || count < 5;
    elements["save-facts"].disabled = !editable || !workflow?.questionsConfirmedAt || !factDefinitions(workflow).length;
    elements["confirm-facts"].disabled = !editable || status !== "事实待确认" || !factDefinitions(workflow).length;
    elements.authorize.disabled = busy || Boolean(localConflict) || dirtyInputs.length > 0 || status !== "待费用授权" || !elements["authorize-check"].checked || !workflow?.selectedMedia?.length;
    if (!busy && status === "待费用授权" && dirtyInputs.length) message(`有未保存的${dirtyInputs.join("、")}；请先保存并完成相应确认，再授权分析。`, "error");
    else if (!busy && status === "待费用授权" && elements.message.textContent.startsWith("有未保存的")) message("页面内容与已保存修订一致；请核对范围和报价后授权。", "success");
    elements["final-confirm"].disabled = busy || Boolean(localConflict) || status !== "结果待确认" || dirtyInputs.length > 0;
    if (!busy && status === "结果待确认" && dirtyInputs.length) message(`有未保存的${dirtyInputs.join("、")}；请先保存修改并重新生成、核对结果，再最终确认。当前输入已保留。`, "error");
    else if (!busy && status === "结果待确认" && elements.message.textContent.startsWith("有未保存的")) message("页面内容与报告修订一致；核对报告后可以最终确认。", "success");
    root.querySelectorAll(".module4-question-row textarea,.module4-remove-question").forEach(function (control) { control.disabled = !editable; });
    root.querySelectorAll(".module4-fact").forEach(function (card) {
      const checkbox = card.querySelector('input[type="checkbox"]'); checkbox.disabled = !editable || !workflow?.questionsConfirmedAt;
      card.querySelectorAll("textarea,input[type='text']").forEach(function (control) { control.disabled = checkbox.disabled || checkbox.checked; });
    });
    elements["authorize-check"].disabled = busy || status !== "待费用授权";
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (!busy && ["待处理", "进行中", "问题生成中"].includes(status)) pollTimer = setInterval(loadStatus, fixtureTransport ? 1200 : 10000);
  }

  function render() { if (global.AMZWN_RETAINED_SET) global.dispatchEvent(new global.CustomEvent("amzwn:module4-context", {detail:{userId:session?.user?.id,task:tasks.find(t=>t.id===elements["task-select"].value)}})); rendering = true; renderPrerequisites(); renderQuestions(); renderFacts(); renderFee(); renderProgress(); updateActions(); rendering = false; }

  async function loadStatus() {
    if (global.AMZWN_RETAINED_SET) global.dispatchEvent(new global.CustomEvent("amzwn:module4-context", {detail:{userId:session?.user?.id,task:tasks.find(t=>t.id===elements["task-select"].value)}}));
    if (busy) return;
    const taskId = elements["task-select"].value;
    if (!taskId) { workflow = null; render(); message("请选择任务后检查开放条件。"); return; }
    remember();
    if (workflow?.taskId !== taskId) localConflict = null;
    const pending = workflow?.taskId === taskId && unsavedInputs().length ? capture() : null; remember();
    busy = true; updateActions(); message("正在读取模块4状态…");
    try {
      const result = await request(`/api/module4/status?taskId=${encodeURIComponent(taskId)}`, { method: "GET" });
      workflow = result.module4; elements["authorize-check"].checked = false; elements["draft-authorize-check"].checked = false;
      message(workflow ? `状态已更新：${workflow.status}。` : "该任务尚未进入模块4，请点击“进入模块4”检查条件。", workflow ? "success" : "");
    } catch (error) { if (workflow?.taskId !== taskId) workflow = null; message(error.message || "模块4状态读取失败。", "error"); }
    finally { busy = false; render(); restore(pending || storedDraft()); }
  }

  async function mutate(route, body, success) {
    if (busy) throw new Error("上一步尚未完成，请稍候");
    const pending = capture(); remember(); let succeeded = false;
    busy = true; updateActions();
    try {
      message(route.endsWith("questions-generate") ? "正在按本次授权生成草案…" : "正在保存…");
      const result = await request(route, { method: "POST", body: JSON.stringify(body) });
      workflow = result.module4; elements["authorize-check"].checked = false; elements["draft-authorize-check"].checked = false;
      if (result.ok === false) throw new Error(result.message || workflow?.failureReason || "本次操作未成功，请核对运行状态。");
      succeeded = true; localConflict = null;
      if (pending) { global.sessionStorage.removeItem(draftKey(pending.userId, pending.taskId, pending.revision)); global.sessionStorage.removeItem(draftKey(pending.userId, pending.taskId, "latest")); }
      message(success, "success"); return result;
    } catch (error) {
      if (workflow?.taskId) {
        try { const latest = await request(`/api/module4/status?taskId=${encodeURIComponent(workflow.taskId)}`, { method: "GET" }); if (latest.module4) workflow = latest.module4; } catch (_) {}
      }
      message(error.message || "操作失败，请刷新后重试。", "error"); throw error;
    }
    finally {
      busy = false; render();
      if (!succeeded) restore(pending);
      else if (pending && workflow?.status !== "已完成") {
        // Saving one section must not discard dirty input in the other sections.
        const merged = capture();
        if (!route.endsWith("/questions") && !route.endsWith("questions-generate") && !route.endsWith("questions-fallback")) merged.questions = pending.questions;
        if (!route.endsWith("/facts") && !route.endsWith("questions-generate") && !route.endsWith("questions-fallback")) merged.facts = pending.facts;
        if (!route.endsWith("/selection")) merged.selection = pending.selection;
        restore(merged);
      }
    }
  }

  function onClick(name, action) { elements[name].addEventListener("click", async function () { try { await action(); } catch (error) { message(error.message || "操作失败。", "error"); } }); }
  elements["task-select"].addEventListener("change", loadStatus); elements.refresh.addEventListener("click", loadStatus);
  onClick("initialize", async function () { const taskId = elements["task-select"].value; if (!taskId) throw new Error("请先选择任务"); await mutate("/api/module4/initialize", { taskId }, "模块4已打开；请核对资料与草案报价。"); });
  onClick("save-selection", function () { return mutate("/api/module4/selection", mutationBody(workflow, { selectedMedia: collectSelection() }), "已选图片已由服务端验证并更新报价；旧授权已失效。"); });
  elements["draft-authorize-check"].addEventListener("change", updateActions);
  onClick("generate-questions", async function () {
    if (!elements["draft-authorize-check"].checked) return;
    await mutate("/api/module4/questions-generate", mutationBody(workflow, { acknowledgement: true, quoteVersion: workflow.draftQuote.quoteVersion || workflow.quoteVersion }), "问题草案已返回；请核对问题与产品事实字段后确认。");
  });
  onClick("fallback-questions", async function () { await mutate("/api/module4/questions-fallback", mutationBody(workflow), "已使用不计费的手动规则备用草案；请逐项按产品修改，这份草案不是AI生成。"); });
  onClick("add-question", function () { if (elements["question-list"].children.length >= 7) throw new Error("最多保留7项买家问题"); const row = appendQuestion({ id: `custom-${Date.now()}`, question: "" }, elements["question-list"].children.length); renumberQuestions(); updateActions(); row.querySelector("textarea").focus(); });
  onClick("save-questions", function () { return mutate("/api/module4/questions", mutationBody(workflow, { questions: collectQuestions() }), "问题已保存；旧授权已失效。"); });
  onClick("confirm-questions", async function () {
    const current = collectQuestions();
    if (JSON.stringify(current) !== JSON.stringify(normalizeQuestions(workflow.questions))) await mutate("/api/module4/questions", mutationBody(workflow, { questions: current }), "已保存当前问题。");
    await mutate("/api/module4/questions-confirm", mutationBody(workflow), "问题清单已确认；下一步填写产品事实。");
  });
  onClick("save-facts", function () { return mutate("/api/module4/facts", mutationBody(workflow, { facts: collectFacts() }), "产品事实已保存；未知项保持未知，旧授权已失效。"); });
  onClick("confirm-facts", async function () {
    const facts = collectFacts();
    if (JSON.stringify(facts) !== JSON.stringify(workflow.facts)) await mutate("/api/module4/facts", mutationBody(workflow, { facts }), "已保存当前事实。");
    await mutate("/api/module4/facts-confirm", mutationBody(workflow), "产品事实已确认；请核对已选图片、实际参数和费用上限。");
  });
  elements["authorize-check"].addEventListener("change", updateActions);
  onClick("authorize", async function () { if (localConflict || !elements["authorize-check"].checked || unsavedInputs().length) return; await mutate("/api/module4/authorize", mutationBody(workflow, { acknowledgement: true, quoteVersion: workflow.analysisPlan.quoteVersion || workflow.quoteVersion, bindingFingerprint: workflow.configurationFingerprint }), "当前选图与服务端报价已授权，进入队列。"); });
  onClick("final-confirm", async function () {
    if (busy || localConflict || workflow?.status !== "结果待确认") return;
    const changes = unsavedInputs();
    if (changes.length) { message(`有未保存的${changes.join("、")}；请先保存修改并重新生成、核对结果，再最终确认。当前输入已保留。`, "error"); updateActions(); return; }
    if (!global.confirm("最终确认后模块4将锁定，不能再编辑。确认继续吗？")) return;
    if (unsavedInputs().length || workflow?.status !== "结果待确认") { updateActions(); return; }
    await mutate("/api/module4/final-confirm", mutationBody(workflow), "模块4已最终确认并锁定。");
  });
  global.addEventListener("amzwn:tasks-loaded", function (event) { if (session?.user?.id && session.user.id !== event.detail.session?.user?.id) { sessionGeneration++; workflow = null; localConflict = null; render(); }
    session = event.detail.session; fillTasks(event.detail.tasks); });
  global.addEventListener("amzwn:session-changed", function (event) {
    remember(); const next = event.detail.session;
    if (next?.user?.id !== session?.user?.id || ["SIGNED_IN", "SIGNED_OUT"].includes(event.detail.event)) sessionGeneration++;
    if (!next || next.user.id !== session?.user?.id) { workflow = null; localConflict = null; tasks = []; elements["task-select"].replaceChildren(); render(); }
    session = next;
  });
  global.addEventListener("amzwn:explicit-logout", function () { sessionGeneration++; workflow = null; localConflict = null; render(); });
  global.addEventListener("beforeunload", remember);
  if (fixtureTransport) { session = { access_token: "fixture", user: { id: "fixture-owner" } }; fillTasks(fixtureTransport.tasks || []); }
  render();
  global.AMZWN_MODULE4_CONTROLLER = Object.freeze({ loadStatus, getWorkflow: function () { return workflow; }, getConflict: function () { return localConflict && structuredClone(localConflict); } });
})(typeof window === "object" ? window : globalThis);
