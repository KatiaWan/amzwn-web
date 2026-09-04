(function () {
  "use strict";

  const app = window.AMZWN;
  const shell = document.querySelector("#tool-shell");
  const accountEmail = document.querySelector("#account-email");
  const logoutButton = document.querySelector("#logout-button");
  const form = document.querySelector("#task-form");
  const asinInput = document.querySelector("#asin-input");
  const fileInput = document.querySelector("#report-file");
  const fileDrop = document.querySelector("#file-drop");
  const fileTitle = document.querySelector("#file-title");
  const fileSubtitle = document.querySelector("#file-subtitle");
  const submitButton = document.querySelector("#task-submit");
  const taskStatus = document.querySelector("#task-status");
  const refreshButton = document.querySelector("#refresh-button");
  const taskList = document.querySelector("#task-list");
  const template = document.querySelector("#task-template");
  const securityStatus = document.querySelector("#security-status");
  const module3 = window.AMZWN_MODULE3;
  const pathTabs = Array.from(document.querySelectorAll("[data-module3-path]"));
  const pathPanels = Array.from(document.querySelectorAll("[data-module3-panel]"));
  const newCompetitors = document.querySelector("#new-competitors");
  const existingCompetitors = document.querySelector("#existing-competitors");
  const newCoreKeyword = document.querySelector("#new-core-keyword");
  const existingForm = document.querySelector("#existing-module3-form");
  const existingTaskSelect = document.querySelector("#existing-task-select");
  const existingCoreKeyword = document.querySelector("#existing-core-keyword");
  const existingStatus = document.querySelector("#existing-module3-status");
  const module3TaskSelect = document.querySelector("#module3-task-select");
  const module3State = document.querySelector("#module3-state");
  const module3StateDetail = document.querySelector("#module3-state-detail");
  const module3MediaFile = document.querySelector("#module3-media-file");
  const module3MediaFileTitle = document.querySelector("#module3-media-file-title");
  const module3MediaStatus = document.querySelector("#module3-media-status");
  const module3Refresh = document.querySelector("#module3-refresh");
  const module3Import = document.querySelector("#module3-import");
  const module3ConfirmMedia = document.querySelector("#module3-confirm-media");
  const module3AuthorizePaid = document.querySelector("#module3-authorize-paid");
  const module3ConfirmResult = document.querySelector("#module3-confirm-result");
  let session = null;
  let pollTimer = null;
  let latestTasks = [];
  let currentModule3 = null;
  let currentMediaDigest = null;
  let currentMediaBlockers = [];

  const statusCopy = {
    "待处理": "已排队，等待工人领取",
    "进行中": "正在汇总数据并生成报告",
    "已完成": "分析已完成，可以查看报告",
    "失败": "本次处理没有完成"
  };

  function setTaskMessage(message, kind) {
    taskStatus.textContent = message;
    taskStatus.className = "form-status" + (kind ? ` is-${kind}` : "");
  }

  function setSecurityStatus(message, state) {
    securityStatus.textContent = message;
    securityStatus.dataset.state = state;
  }

  function setMessage(element, message, kind) {
    element.textContent = message;
    element.className = "form-status" + (kind ? ` is-${kind}` : "");
  }

  function addCompetitorField(container) {
    if (container.children.length >= 5) return;
    const row = document.createElement("div");
    row.className = "competitor-field-row";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "text";
    input.autocomplete = "off";
    input.maxLength = 10;
    input.placeholder = "竞品 ASIN";
    input.required = true;
    input.addEventListener("input", () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "competitor-remove";
    remove.textContent = "移除";
    remove.addEventListener("click", () => {
      if (container.children.length > 3) row.remove();
    });
    row.append(input, remove);
    container.append(row);
  }

  function resetCompetitors(container) {
    container.replaceChildren();
    for (let index = 0; index < 3; index += 1) addCompetitorField(container);
  }

  function competitorValues(container, ownAsin) {
    return module3.normalizeCompetitors(
      Array.from(container.querySelectorAll("input")).map((input) => input.value),
      ownAsin
    );
  }

  function module3Api(route) {
    return module3.apiEndpoint(app.config.apiUrl, route);
  }

  async function module3Request(route, options) {
    const response = await fetch(module3Api(route), {
      ...options,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers || {})
      },
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `模块3接口拒绝了请求（${response.status}）`);
    return body;
  }

  function updateModule3Actions(status) {
    const actionState = currentModule3
      ? {
        ...currentModule3,
        status,
        structureDigest: currentMediaDigest,
        confirmationBlockers: currentMediaBlockers
      }
      : null;
    module3ConfirmMedia.disabled = !module3.canConfirmMedia(actionState);
    module3AuthorizePaid.disabled = !module3.canAuthorizePaid(actionState);
    module3ConfirmResult.disabled = status !== "需人工确认";
    module3Import.disabled = !["待图片采集", "图片待验"].includes(status);
  }

  function fillTaskSelect(select, tasks, includeAllCompleted) {
    const current = select.value;
    select.replaceChildren(new Option("请选择任务", ""));
    for (const task of tasks) {
      if (includeAllCompleted && task.status !== "已完成") continue;
      select.append(new Option(`${task.asin} · ${app.formatDate(task.created_at)}`, task.id));
    }
    if (Array.from(select.options).some((option) => option.value === current)) select.value = current;
  }

  async function loadModule3Status() {
    const taskId = module3TaskSelect.value;
    currentModule3 = null;
    currentMediaDigest = null;
    currentMediaBlockers = [];
    if (!taskId) {
      module3State.textContent = "未选择任务";
      module3StateDetail.textContent = "历史任务没有模块3记录时显示“未申请”。";
      updateModule3Actions("");
      return;
    }
    setMessage(module3MediaStatus, "正在读取模块3状态…");
    try {
      const result = await module3Request(`/api/module3/status?taskId=${encodeURIComponent(taskId)}`, {
        method: "GET"
      });
      currentModule3 = result.module3;
      currentMediaDigest = currentModule3.structureDigest || null;
      currentMediaBlockers = Array.isArray(currentModule3.confirmationBlockers)
        ? currentModule3.confirmationBlockers.filter(Boolean)
        : [];
      module3State.textContent = currentModule3.status;
      module3StateDetail.textContent = module3.statusDetail(currentModule3);
      updateModule3Actions(currentModule3.status);
      setMessage(
        module3MediaStatus,
        currentMediaBlockers.length
          ? `媒体完整性仍有阻断项：${currentMediaBlockers.join("；")}`
          : "状态已更新。",
        currentMediaBlockers.length ? "error" : "success"
      );
    } catch (error) {
      module3State.textContent = "读取失败";
      updateModule3Actions("");
      setMessage(module3MediaStatus, app.messageFor(error, "模块3状态读取失败。"), "error");
    }
  }

  async function verifySecurityApi(activeSession) {
    if (!app.config.apiUrl) throw new Error("未配置安全接口地址");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(app.config.apiUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${activeSession.access_token}` },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`安全接口拒绝了当前会话（${response.status}）`);
      const result = await response.json();
      if (!result?.ok || result.authenticated !== true) throw new Error("安全接口未确认当前会话");
      setSecurityStatus("安全接口已验证", "verified");
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function resetFileLabel() {
    fileTitle.textContent = "选择 .xlsx 或 .csv 文件";
    fileSubtitle.textContent = "点击这里浏览文件，单个文件不超过 50 MB";
    fileDrop.classList.remove("has-file");
  }

  function showFile(file) {
    if (!file) {
      resetFileLabel();
      return;
    }
    fileTitle.textContent = file.name;
    fileSubtitle.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB · 已选择`;
    fileDrop.classList.add("has-file");
  }

  function renderEmpty(title, detail) {
    taskList.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<span class="empty-state__mark">＋</span>';
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    empty.append(strong, paragraph);
    taskList.append(empty);
  }

  function renderTasks(tasks) {
    taskList.replaceChildren();
    if (!tasks.length) {
      renderEmpty("还没有任务", "从上方提交第一份广告报表吧。");
      return;
    }

    for (const task of tasks) {
      const fragment = template.content.cloneNode(true);
      const item = fragment.querySelector(".task-item");
      fragment.querySelector(".task-asin").textContent = task.asin;
      fragment.querySelector(".task-time").textContent = app.formatDate(task.created_at);
      const pill = fragment.querySelector(".status-pill");
      pill.textContent = task.status;
      pill.dataset.status = task.status;
      const detail = fragment.querySelector(".task-detail");
      detail.textContent = task.status === "失败"
        ? (task.failure_reason || statusCopy[task.status])
        : statusCopy[task.status];
      const action = fragment.querySelector(".task-action");
      if (task.status === "已完成" && task.report_url) {
        action.href = `../report/?task=${encodeURIComponent(task.id)}`;
      } else {
        action.remove();
      }
      item.dataset.taskId = task.id;
      taskList.append(fragment);
    }

    const needsPolling = tasks.some((task) => task.status === "待处理" || task.status === "进行中");
    if (needsPolling && !pollTimer) pollTimer = window.setInterval(loadTasks, 30000);
    if (!needsPolling && pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function loadTasks() {
    refreshButton.disabled = true;
    refreshButton.textContent = "刷新中…";
    try {
      const result = await app.client
        .from("keyword_tasks")
        .select("id,asin,status,report_url,failure_reason,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (result.error) throw result.error;
      latestTasks = result.data || [];
      renderTasks(latestTasks);
      fillTaskSelect(existingTaskSelect, latestTasks, true);
      fillTaskSelect(module3TaskSelect, latestTasks, true);
    } catch (error) {
      renderEmpty("任务读取失败", app.messageFor(error, "请稍后点击刷新状态。"));
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "刷新状态";
    }
  }

  resetCompetitors(newCompetitors);
  resetCompetitors(existingCompetitors);
  document.querySelector("#new-add-competitor").addEventListener("click", () => addCompetitorField(newCompetitors));
  document.querySelector("#existing-add-competitor").addEventListener("click", () => addCompetitorField(existingCompetitors));
  for (const tab of pathTabs) {
    tab.addEventListener("click", () => {
      const selected = tab.dataset.module3Path;
      for (const item of pathTabs) {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      }
      for (const panel of pathPanels) panel.hidden = panel.dataset.module3Panel !== selected;
    });
  }

  asinInput.addEventListener("input", () => {
    asinInput.value = asinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  });

  fileInput.addEventListener("change", () => showFile(fileInput.files[0]));
  for (const eventName of ["dragenter", "dragover"]) {
    fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDrop.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    fileDrop.addEventListener(eventName, (event) => {
      event.preventDefault();
      fileDrop.classList.remove("is-dragging");
    });
  }
  fileDrop.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    showFile(file);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const asin = asinInput.value.trim().toUpperCase();
    const file = fileInput.files[0];
    const extension = file?.name.split(".").pop()?.toLowerCase();
    let competitorAsins;
    let coreKeyword;

    if (!/^B0[A-Z0-9]{8}$/.test(asin)) {
      setTaskMessage("ASIN 格式不正确：需要 10 位，并以 B0 开头。", "error");
      asinInput.focus();
      return;
    }
    if (!file || !["xlsx", "csv"].includes(extension)) {
      setTaskMessage("请选择 .xlsx 或 .csv 格式的广告搜索词报表。", "error");
      fileInput.focus();
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setTaskMessage("文件超过 50 MB，请压缩数据范围后再上传。", "error");
      return;
    }
    try {
      competitorAsins = competitorValues(newCompetitors, asin);
      coreKeyword = module3.normalizeCoreKeyword(newCoreKeyword.value);
    } catch (error) {
      setTaskMessage(error.message, "error");
      return;
    }

    const taskId = crypto.randomUUID();
    const objectPath = `${session.user.id}/${taskId}.${extension}`;
    app.setBusy(submitButton, true, "正在上传报表…");
    setTaskMessage("正在把报表安全上传到你的私有收件箱…");

    try {
      const upload = await app.client.storage
        .from(app.config.inputBucket)
        .upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
      if (upload.error) throw upload.error;

      app.setBusy(submitButton, true, "正在创建任务…");
      setTaskMessage("报表已上传，正在创建分析任务…");
      const insert = await app.client.rpc("module3_create_task_with_config", {
        p_task_id: taskId,
        p_own_asin: asin,
        p_report_file_path: objectPath,
        p_competitor_asins: competitorAsins,
        p_core_keyword: coreKeyword,
        p_site: "US"
      });
      if (insert.error) throw insert.error;

      form.reset();
      resetFileLabel();
      resetCompetitors(newCompetitors);
      setTaskMessage("任务提交成功。工人会在约 30 秒内领取，完成后可在下方查看报告。", "success");
      await loadTasks();
    } catch (error) {
      setTaskMessage(app.messageFor(error, "任务提交失败，请稍后重试。"), "error");
    } finally {
      app.setBusy(submitButton, false);
    }
  });

  existingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const task = latestTasks.find((item) => item.id === existingTaskSelect.value);
    if (!task || task.status !== "已完成") {
      setMessage(existingStatus, "请选择自己的已完成任务。", "error");
      return;
    }
    let competitorAsins;
    let coreKeyword;
    try {
      competitorAsins = competitorValues(existingCompetitors, task.asin);
      coreKeyword = module3.normalizeCoreKeyword(existingCoreKeyword.value);
    } catch (error) {
      setMessage(existingStatus, error.message, "error");
      return;
    }
    const submit = document.querySelector("#existing-module3-submit");
    app.setBusy(submit, true, "正在保存…");
    try {
      const result = await app.client.rpc("module3_submit_for_completed_task", {
        p_task_id: task.id,
        p_competitor_asins: competitorAsins,
        p_core_keyword: coreKeyword,
        p_site: "US"
      });
      if (result.error) throw result.error;
      module3TaskSelect.value = task.id;
      resetCompetitors(existingCompetitors);
      existingCoreKeyword.value = "";
      setMessage(existingStatus, "模块3配置已保存；原报告与 01—03 数据没有重跑。", "success");
      await loadModule3Status();
    } catch (error) {
      setMessage(existingStatus, app.messageFor(error, "模块3配置保存失败。"), "error");
    } finally {
      app.setBusy(submit, false);
    }
  });

  module3MediaFile.addEventListener("change", () => {
    const file = module3MediaFile.files[0];
    module3MediaFileTitle.textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "选择媒体清单";
  });
  module3TaskSelect.addEventListener("change", loadModule3Status);
  module3Refresh.addEventListener("click", loadModule3Status);

  module3Import.addEventListener("click", async () => {
    const taskId = module3TaskSelect.value;
    const file = module3MediaFile.files[0];
    if (!taskId || !file) {
      setMessage(module3MediaStatus, "请先选择任务和 product-media.json。", "error");
      return;
    }
    if (file.size > 256 * 1024) {
      setMessage(module3MediaStatus, "媒体清单超过 256 KB，已在上传前停止。", "error");
      return;
    }
    module3Import.disabled = true;
    try {
      if (!currentModule3 || currentModule3.taskId !== taskId) await loadModule3Status();
      if (!currentModule3 || !["待图片采集", "图片待验"].includes(currentModule3.status)) {
        throw new Error("当前模块3状态不允许导入媒体清单");
      }
      const parsed = JSON.parse(await file.text());
      const issued = await module3Request("/api/module3/media-nonce", {
        method: "POST",
        body: JSON.stringify({ taskId })
      });
      const mediaPackage = module3.prepareMediaPackage(parsed, {
        taskId,
        configRevision: issued.nonce.configRevision,
        site: issued.nonce.site,
        nonce: issued.nonce.value
      });
      const imported = await module3Request("/api/module3/media-import", {
        method: "POST",
        body: JSON.stringify(mediaPackage)
      });
      currentMediaDigest = imported.structureDigest;
      const blockers = Array.isArray(imported.confirmationBlockers)
        ? imported.confirmationBlockers.filter(Boolean)
        : [];
      currentMediaBlockers = blockers;
      setMessage(
        module3MediaStatus,
        blockers.length
          ? `结构验证通过，但尚不能确认完整：${blockers.join("；")}`
          : "结构验证通过。请由任务所有者逐项核对后再确认完整。",
        blockers.length ? "error" : "success"
      );
      await loadModule3Status();
    } catch (error) {
      setMessage(module3MediaStatus, app.messageFor(error, "媒体清单导入失败。"), "error");
    } finally {
      module3Import.disabled = false;
    }
  });

  module3ConfirmMedia.addEventListener("click", async () => {
    if (!currentModule3 || !currentMediaDigest) return;
    if (!window.confirm("请确认：你已人工逐项核对本任务全部商品媒体，并认可清单在注明页面范围内完整。")) return;
    try {
      await module3Request("/api/module3/confirm", {
        method: "POST",
        body: JSON.stringify({
          taskId: currentModule3.taskId,
          kind: "media",
          structureDigest: currentMediaDigest
        })
      });
      setMessage(module3MediaStatus, "已记录任务所有者人工确认；下一步需要单独授权商品档案费用。", "success");
      await loadModule3Status();
    } catch (error) {
      setMessage(module3MediaStatus, app.messageFor(error, "人工确认记录失败。"), "error");
    }
  });

  module3AuthorizePaid.addEventListener("click", async () => {
    if (!currentModule3) return;
    const count = currentModule3.competitorAsins.length;
    if (!window.confirm(`确认授权读取 ${count} 个竞品商品档案吗？每个竞品最多调用 1 次，失败不自动重试。`)) return;
    try {
      const result = await app.client.rpc("module3_authorize_product_details", {
        p_task_id: currentModule3.taskId,
        p_confirmed: true
      });
      if (result.error) throw result.error;
      setMessage(module3MediaStatus, `已授权最多 ${count} 次竞品商品档案调用，未授权前的调用数为 0。`, "success");
      await loadModule3Status();
    } catch (error) {
      setMessage(module3MediaStatus, app.messageFor(error, "费用授权失败。"), "error");
    }
  });

  module3ConfirmResult.addEventListener("click", async () => {
    if (!currentModule3 || !window.confirm("确认模块3竞对对比结果已经人工复核，可以标记为已完成吗？")) return;
    try {
      await module3Request("/api/module3/confirm", {
        method: "POST",
        body: JSON.stringify({ taskId: currentModule3.taskId, kind: "result" })
      });
      setMessage(module3MediaStatus, "模块3已由任务所有者确认完成。", "success");
      await loadModule3Status();
    } catch (error) {
      setMessage(module3MediaStatus, app.messageFor(error, "模块3结果确认失败。"), "error");
    }
  });

  refreshButton.addEventListener("click", loadTasks);
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    await app.client.auth.signOut();
    window.location.replace("../");
  });

  app.requireSession("../")
    .then(async (activeSession) => {
      if (!activeSession) return;
      session = activeSession;
      accountEmail.textContent = session.user.email || "已登录";
      await verifySecurityApi(activeSession);
      shell.classList.remove("is-loading");
      shell.setAttribute("aria-busy", "false");
      loadTasks();
    })
    .catch((error) => {
      accountEmail.textContent = "安全验证未通过";
      setSecurityStatus(error?.message || "安全接口暂不可用，请稍后重试。", "failed");
    });
})();
