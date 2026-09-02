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
  let session = null;
  let pollTimer = null;

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
      renderTasks(result.data || []);
    } catch (error) {
      renderEmpty("任务读取失败", app.messageFor(error, "请稍后点击刷新状态。"));
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "刷新状态";
    }
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
      const insert = await app.client.from("keyword_tasks").insert({
        id: taskId,
        user_id: session.user.id,
        asin,
        report_file_path: objectPath,
        status: "待处理"
      });
      if (insert.error) throw insert.error;

      form.reset();
      resetFileLabel();
      setTaskMessage("任务提交成功。工人会在约 30 秒内领取，完成后可在下方查看报告。", "success");
      await loadTasks();
    } catch (error) {
      setTaskMessage(app.messageFor(error, "任务提交失败，请稍后重试。"), "error");
    } finally {
      app.setBusy(submitButton, false);
    }
  });

  refreshButton.addEventListener("click", loadTasks);
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    await app.client.auth.signOut();
    window.location.replace("../");
  });

  app.requireSession("../")
    .then((activeSession) => {
      if (!activeSession) return;
      session = activeSession;
      accountEmail.textContent = session.user.email || "已登录";
      shell.classList.remove("is-loading");
      shell.setAttribute("aria-busy", "false");
      loadTasks();
    })
    .catch(() => window.location.replace("../"));
})();
