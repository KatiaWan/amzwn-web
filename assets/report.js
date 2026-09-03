(function () {
  "use strict";

  const app = window.AMZWN;
  const stage = document.querySelector("#report-stage");
  const reportTitle = document.querySelector("#report-title");
  const statusPill = document.querySelector("#report-status");
  const reportTime = document.querySelector("#report-time");
  const reloadButton = document.querySelector("#reload-report");
  const taskId = new URLSearchParams(window.location.search).get("task") || "";
  let task = null;
  let destroyReportControls = null;

  function removeReportControls() {
    if (destroyReportControls) {
      destroyReportControls();
      destroyReportControls = null;
    }
  }

  function setStatus(status) {
    statusPill.textContent = status;
    statusPill.dataset.status = status;
  }

  function showState(title, detail, action) {
    removeReportControls();
    stage.replaceChildren();
    const state = document.createElement("div");
    state.className = "report-state";
    state.innerHTML = '<span class="report-state__shape" aria-hidden="true">↗</span>';
    const heading = document.createElement("h2");
    heading.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    state.append(heading, paragraph);
    if (action) {
      const button = document.createElement("button");
      button.className = "primary-button primary-button--fit report-state__button";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.handler);
      state.append(button);
    }
    stage.append(state);
  }

  function isValidReportUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === app.config.reportHost;
    } catch {
      return false;
    }
  }

  function withBaseUrl(html, reportUrl) {
    const safeBase = reportUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const baseTag = `<base href="${safeBase}">`;
    const viewerStyles = `<style id="amzwn-viewer-styles">
      .wrap{padding:14px 18px 20px!important}
      .hero{padding:16px 20px!important;border-radius:14px!important;box-shadow:none!important}
      .hero h1{margin:0 0 3px!important;font-size:22px!important}
      .hero p{display:inline-block!important;margin:2px 18px 0 0!important;font-size:11px!important}
      .metrics{gap:8px!important;margin:10px 0!important}
      .metric{padding:9px 12px!important}
      .metric b{margin-top:1px!important;font-size:18px!important}
      .note{margin:8px 0!important;padding:8px 12px!important;font-size:12px!important}
      .table-shell{border-radius:0 0 12px 12px!important;scrollbar-color:#7c8582 #e9eceb}
      .table-shell::-webkit-scrollbar{height:12px}
      .table-shell::-webkit-scrollbar-track{background:#e9eceb}
      .table-shell::-webkit-scrollbar-thumb{border:2px solid #e9eceb;border-radius:999px;background:#7c8582}
      .amzwn-table-tools{display:flex;gap:12px;align-items:center;margin-top:8px;padding:9px 12px;border:1px solid var(--line);border-bottom:0;border-radius:12px 12px 0 0;background:#fff}
      .amzwn-table-tools__title{font-size:13px;white-space:nowrap}
      .amzwn-table-tools__count{color:var(--muted);font-size:12px;white-space:nowrap}
      .amzwn-table-search{width:min(340px,50vw);height:36px;display:flex;align-items:center;gap:7px;margin-left:auto;padding:0 11px;border:1px solid #d8dde5;border-radius:9px;background:#fff}
      .amzwn-table-search:focus-within{border-color:#3e8d7f;box-shadow:0 0 0 3px #9cd2c338}
      .amzwn-table-search span{color:#667085;font-size:18px}
      .amzwn-table-search input{width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;font:inherit;font-size:12px}
      .amzwn-pagination{display:flex;gap:6px;align-items:center;justify-content:center;padding:13px 8px 3px}
      .amzwn-pagination button{min-width:34px;height:32px;padding:0 9px;border:1px solid #d8dde5;border-radius:7px;color:#344054;background:#fff;cursor:pointer;font:inherit;font-size:12px}
      .amzwn-pagination button:hover:not(:disabled){border-color:#3e8d7f;color:#176b5e}
      .amzwn-pagination button[aria-current="page"]{border-color:#16836f;color:#fff;background:#16836f;font-weight:700}
      .amzwn-pagination button:disabled{cursor:not-allowed;opacity:.38}
      @media(max-width:720px){.wrap{padding:8px!important}.hero{padding:12px 14px!important}.hero h1{font-size:18px!important}.metrics{grid-template-columns:1fr 1fr!important}.amzwn-table-tools{align-items:flex-start;flex-wrap:wrap}.amzwn-table-search{width:100%;order:3;margin-left:0}.amzwn-table-tools__count{margin-left:auto}}
    </style>`;
    if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${viewerStyles}`);
    return `<!doctype html><html><head>${baseTag}${viewerStyles}</head><body>${html}</body></html>`;
  }

  function addReportControls(frame) {
    const frameDocument = frame.contentDocument;
    const tableShell = frameDocument?.querySelector(".table-shell");
    const table = tableShell?.querySelector("table");
    const rows = table ? Array.from(table.querySelectorAll("tbody tr")) : [];
    if (!tableShell || !table || !rows.length) return;

    removeReportControls();

    const pageSize = 50;
    let currentPage = 1;
    let filteredRows = rows;

    const controls = frameDocument.createElement("div");
    controls.className = "amzwn-table-tools";

    const sectionTitle = frameDocument.createElement("strong");
    sectionTitle.className = "amzwn-table-tools__title";
    sectionTitle.textContent = "关键词明细";

    const count = frameDocument.createElement("span");
    count.className = "amzwn-table-tools__count";

    const searchGroup = frameDocument.createElement("label");
    searchGroup.className = "amzwn-table-search";
    searchGroup.innerHTML = '<span aria-hidden="true">⌕</span>';

    const searchInput = frameDocument.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "搜索关键词或 ASIN";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "在当前报告中搜索关键词或 ASIN");
    searchGroup.append(searchInput);

    controls.append(sectionTitle, count, searchGroup);
    tableShell.before(controls);

    const pagination = frameDocument.createElement("nav");
    pagination.className = "amzwn-pagination";
    pagination.setAttribute("aria-label", "关键词分页");
    tableShell.after(pagination);

    const changePage = (page) => {
      currentPage = page;
      renderPage();
      controls.scrollIntoView({ block: "start" });
    };

    const pageButton = (label, page, options = {}) => {
      const button = frameDocument.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = Boolean(options.disabled);
      if (options.current) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => changePage(page));
      return button;
    };

    const renderPage = () => {
      const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
      currentPage = Math.min(currentPage, totalPages);
      const start = (currentPage - 1) * pageSize;
      const pageRows = filteredRows.slice(start, start + pageSize);
      const visibleRows = new Set(pageRows);
      rows.forEach((row) => { row.hidden = !visibleRows.has(row); });

      const queryActive = Boolean(searchInput.value.trim());
      if (!filteredRows.length) count.textContent = `显示 0 / ${rows.length}`;
      else if (queryActive) count.textContent = `显示 ${filteredRows.length} / ${rows.length}`;
      else count.textContent = `显示 ${start + 1}-${start + pageRows.length} / ${rows.length}`;

      pagination.replaceChildren();
      pagination.append(pageButton("‹", currentPage - 1, { disabled: currentPage === 1 }));
      for (let page = 1; page <= totalPages; page += 1) {
        pagination.append(pageButton(String(page), page, { current: page === currentPage }));
      }
      pagination.append(pageButton("›", currentPage + 1, { disabled: currentPage === totalPages }));
    };

    const filterRows = () => {
      const query = searchInput.value.trim().toLocaleLowerCase();
      filteredRows = rows.filter((row) => !query || row.textContent.toLocaleLowerCase().includes(query));
      currentPage = 1;
      renderPage();
    };

    searchInput.addEventListener("input", filterRows);
    renderPage();

    destroyReportControls = () => {
      searchInput.removeEventListener("input", filterRows);
      rows.forEach((row) => { row.hidden = false; });
      controls.remove();
      pagination.remove();
    };
  }

  async function renderCompletedReport() {
    if (!isValidReportUrl(task.report_url)) {
      setStatus("失败");
      showState("报告地址异常", "为了保护你的数据，本页拒绝打开不属于指定报告仓库的地址。", {
        label: "返回任务列表",
        handler: () => window.location.assign("../tool/")
      });
      return;
    }

    showState("正在载入完整报告", "报告内容较多，首次打开可能需要几秒钟。");
    try {
      const response = await fetch(task.report_url, { cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error(`REPORT_HTTP_${response.status}`);
      const html = await response.text();
      const frame = document.createElement("iframe");
      frame.className = "report-frame";
      frame.title = `${task.asin} 关键词作战总表`;
      // Scripts stay blocked. Same-origin access is enabled only so the parent
      // viewer can filter rows and synchronize the accessible top scrollbar.
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.addEventListener("load", () => {
        try {
          addReportControls(frame);
        } catch {
          removeReportControls();
        }
      }, { once: true });
      frame.srcdoc = withBaseUrl(html, task.report_url);
      stage.replaceChildren(frame);
    } catch (error) {
      showState("报告载入失败", "网络暂时无法取回报告。请稍后刷新；报告文件本身不会丢失。", {
        label: "重新载入",
        handler: renderCompletedReport
      });
    }
  }

  async function loadReport() {
    reloadButton.disabled = true;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
      setStatus("失败");
      reportTime.textContent = "任务编号无效";
      showState("找不到这份报告", "链接中的任务编号不完整，请从任务列表重新打开。", {
        label: "返回任务列表",
        handler: () => window.location.assign("../tool/")
      });
      reloadButton.disabled = false;
      return;
    }

    try {
      const result = await app.client
        .from("keyword_tasks")
        .select("id,asin,status,report_url,failure_reason,created_at,updated_at")
        .eq("id", taskId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        setStatus("失败");
        reportTime.textContent = "没有访问权限或任务不存在";
        showState("找不到这份报告", "请确认你登录的是提交这条任务的账号。", {
          label: "返回任务列表",
          handler: () => window.location.assign("../tool/")
        });
        return;
      }

      task = result.data;
      document.title = `AMZWN｜${task.asin} 关键词报告`;
      reportTitle.textContent = `${task.asin} 关键词作战总表`;
      reportTime.textContent = `更新于 ${app.formatDate(task.updated_at)}`;
      setStatus(task.status);

      if (task.status === "已完成" && task.report_url) {
        await renderCompletedReport();
      } else if (task.status === "失败") {
        showState("这次分析没有完成", task.failure_reason || "请返回任务页重新提交；原任务不会影响下一次分析。", {
          label: "返回任务列表",
          handler: () => window.location.assign("../tool/")
        });
      } else {
        showState("报告还在生成中", task.status === "进行中" ? "工人正在汇总关键词和广告数据，请稍后刷新。" : "任务已经排队，工人即将开始处理。", {
          label: "刷新状态",
          handler: loadReport
        });
      }
    } catch (error) {
      setStatus("失败");
      reportTime.textContent = "读取失败";
      showState("暂时无法读取任务", app.messageFor(error, "请检查网络后再试。"), {
        label: "重新读取",
        handler: loadReport
      });
    } finally {
      reloadButton.disabled = false;
    }
  }

  reloadButton.addEventListener("click", () => {
    if (task?.status === "已完成") renderCompletedReport();
    else loadReport();
  });

  app.requireSession("../")
    .then((session) => {
      if (session) loadReport();
    })
    .catch(() => window.location.replace("../"));
})();
