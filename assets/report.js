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
    stage.classList.remove("report-stage--expanded");
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
      html,body{height:auto!important;overflow:visible!important}
      body{min-height:0!important}
      .wrap{box-sizing:border-box!important;height:auto!important;display:block!important;overflow:visible!important;padding:14px 18px 12px!important}
      .hero{padding:16px 20px!important;border-radius:14px!important;box-shadow:none!important}
      .hero h1{margin:0 0 3px!important;font-size:22px!important}
      .hero p{display:inline-block!important;margin:2px 18px 0 0!important;font-size:11px!important}
      .metrics{gap:8px!important;margin:10px 0!important}
      .metric{padding:9px 12px!important}
      .metric b{margin-top:1px!important;font-size:18px!important}
      .note{margin:8px 0!important;padding:8px 12px!important;font-size:12px!important}
      .table-shell{min-height:0!important;overflow-x:auto!important;overflow-y:hidden!important;border-radius:0 0 12px 12px!important;scrollbar-width:none!important}
      .table-shell::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
      .amzwn-table-tools{display:flex;gap:12px;align-items:center;margin-top:8px;padding:9px 12px;border:1px solid var(--line);border-bottom:0;border-radius:12px 12px 0 0;background:#fff}
      .amzwn-table-tools__title{font-size:13px;white-space:nowrap}
      .amzwn-table-tools__count{color:var(--muted);font-size:12px;white-space:nowrap}
      .amzwn-signal-filter{height:36px;display:flex;align-items:center;gap:8px;margin-left:auto;padding:0 9px 0 11px;border:1px solid #d8dde5;border-radius:9px;background:#fff;color:#667085;font-size:12px;white-space:nowrap}
      .amzwn-signal-filter:focus-within{border-color:#3e8d7f;box-shadow:0 0 0 3px #9cd2c338}
      .amzwn-signal-filter select{max-width:190px;border:0;outline:0;background:transparent;color:#243147;font:inherit;font-weight:650;cursor:pointer}
      .amzwn-table-search{width:min(310px,42vw);height:36px;display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #d8dde5;border-radius:9px;background:#fff}
      .amzwn-table-search:focus-within{border-color:#3e8d7f;box-shadow:0 0 0 3px #9cd2c338}
      .amzwn-table-search span{color:#667085;font-size:18px}
      .amzwn-table-search input{width:100%;min-width:0;padding:0;border:0;outline:0;background:transparent;font:inherit;font-size:12px}
      .table-shell table{min-width:2450px!important}
      th:nth-child(3),td:nth-child(3){width:132px!important;text-align:left!important}
      th:nth-child(10),td:nth-child(10){width:100px!important;text-align:right!important}
      th:nth-child(11),td:nth-child(11){width:240px!important;text-align:left!important}
      th:nth-child(12),td:nth-child(12){width:110px!important}
      th:nth-child(13),td:nth-child(13){width:155px!important}
      th:nth-child(18),td:nth-child(18){width:110px!important;text-align:right!important}
      th:nth-child(19),td:nth-child(19){width:330px!important;text-align:left!important}
      .amzwn-signal-cell{white-space:normal}
      .amzwn-signal-chip{display:inline-flex;align-items:center;justify-content:center;min-width:68px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:750;line-height:1.35;white-space:nowrap}
      .amzwn-signal-detail{display:block;margin-top:5px;color:#788397;font-size:10px;line-height:1.35}
      .amzwn-signal--scale{background:#e7f6ed;color:#13734b}
      .amzwn-signal--defend{background:#e4f3f1;color:#176b5e}
      .amzwn-signal--test{background:#f0ebff;color:#6753b7}
      .amzwn-signal--risk{background:#fff0f0;color:#b42318}
      .amzwn-signal--longtail{background:#fff4df;color:#985b08}
      .amzwn-signal--observe{background:#eef2f6;color:#596579}
      .amzwn-pagination{display:flex;gap:6px;align-items:center;justify-content:center;padding:10px 8px 0}
      .amzwn-pagination button{min-width:34px;height:32px;padding:0 9px;border:1px solid #d8dde5;border-radius:7px;color:#344054;background:#fff;cursor:pointer;font:inherit;font-size:12px}
      .amzwn-pagination button:hover:not(:disabled){border-color:#3e8d7f;color:#176b5e}
      .amzwn-pagination button[aria-current="page"]{border-color:#16836f;color:#fff;background:#16836f;font-weight:700}
      .amzwn-pagination button:disabled{cursor:not-allowed;opacity:.38}
      .footer{margin:5px 0 0!important;font-size:10px!important;line-height:1.3!important}
      @media(max-width:720px){.wrap{padding:8px!important}.hero{padding:12px 14px!important}.hero h1{font-size:18px!important}.hero p{display:none!important}.metrics{grid-template-columns:1fr 1fr!important}.note{display:none!important}.amzwn-table-tools{align-items:flex-start;flex-wrap:wrap}.amzwn-table-tools__count{margin-left:auto}.amzwn-signal-filter{width:100%;order:3;margin-left:0}.amzwn-signal-filter select{max-width:none;flex:1}.amzwn-table-search{width:100%;order:4}}
    </style>`;
    if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${viewerStyles}`);
    return `<!doctype html><html><head>${baseTag}${viewerStyles}</head><body>${html}</body></html>`;
  }

  function addReportControls(frame) {
    const frameDocument = frame.contentDocument;
    const tableShell = frameDocument?.querySelector(".table-shell");
    const table = tableShell?.querySelector("table");
    const reportContent = frameDocument?.querySelector(".wrap") || frameDocument?.body;
    const rows = table ? Array.from(table.querySelectorAll("tbody tr")) : [];
    if (!tableShell || !table || !reportContent || !rows.length) return;

    const signalDefinitions = {
      "守住放大": { key: "scale", label: "↑ 放量", detail: "已出单 · ACOS达标" },
      "优势防守": { key: "defend", label: "◆ 守位", detail: "自然位 · 点击优势" },
      "精准测试": { key: "test", label: "◇ 试投", detail: "高流量 · 可进入" },
      "降价止损": { key: "risk", label: "↓ 止损", detail: "高花费 · 暂无订单" },
      "转向长尾": { key: "longtail", label: "↗ 换长尾", detail: "头部竞争集中" },
      "继续观察": { key: "observe", label: "· 观察", detail: "暂未触发动作" }
    };
    const signalOrder = ["守住放大", "优势防守", "精准测试", "降价止损", "转向长尾", "继续观察"];
    const signalCounts = new Map(signalOrder.map((label) => [signalDefinitions[label].key, 0]));
    const headerRow = table.querySelector("thead tr");
    const keywordHeader = headerRow?.children[1];
    if (keywordHeader) {
      keywordHeader.textContent = "关键词";
      const signalHeader = frameDocument.createElement("th");
      signalHeader.textContent = "作战信号";
      keywordHeader.after(signalHeader);
    }
    rows.forEach((row) => {
      const keywordCell = row.children[1];
      if (!keywordCell) return;
      const categoryBadge = keywordCell.querySelector(".badge");
      const categoryLabel = categoryBadge?.textContent?.trim() || "继续观察";
      const signal = signalDefinitions[categoryLabel] || signalDefinitions["继续观察"];
      row.dataset.amzwnSignal = signal.key;
      signalCounts.set(signal.key, (signalCounts.get(signal.key) || 0) + 1);
      categoryBadge?.remove();

      const signalCell = frameDocument.createElement("td");
      signalCell.className = "amzwn-signal-cell";
      const signalChip = frameDocument.createElement("span");
      signalChip.className = `amzwn-signal-chip amzwn-signal--${signal.key}`;
      signalChip.textContent = signal.label;
      const signalDetail = frameDocument.createElement("small");
      signalDetail.className = "amzwn-signal-detail";
      signalDetail.textContent = signal.detail;
      signalCell.append(signalChip, signalDetail);
      keywordCell.after(signalCell);
    });

    removeReportControls();
    stage.classList.add("report-stage--expanded");

    const pageSize = 50;
    let currentPage = 1;
    let filteredRows = rows;
    let syncingScroll = false;
    let resizeFrameId = 0;
    let positionFrameId = 0;

    const controls = frameDocument.createElement("div");
    controls.className = "amzwn-table-tools";

    const sectionTitle = frameDocument.createElement("strong");
    sectionTitle.className = "amzwn-table-tools__title";
    sectionTitle.textContent = "关键词明细";

    const count = frameDocument.createElement("span");
    count.className = "amzwn-table-tools__count";

    const signalFilter = frameDocument.createElement("label");
    signalFilter.className = "amzwn-signal-filter";
    const signalFilterLabel = frameDocument.createElement("span");
    signalFilterLabel.textContent = "作战信号";
    const signalSelect = frameDocument.createElement("select");
    signalSelect.setAttribute("aria-label", "按作战信号筛选关键词");
    const allSignalsOption = frameDocument.createElement("option");
    allSignalsOption.value = "all";
    allSignalsOption.textContent = `全部信号（${rows.length}）`;
    signalSelect.append(allSignalsOption);
    signalOrder.forEach((categoryLabel) => {
      const signal = signalDefinitions[categoryLabel];
      const option = frameDocument.createElement("option");
      option.value = signal.key;
      option.textContent = `${signal.label}（${signalCounts.get(signal.key) || 0}）`;
      signalSelect.append(option);
    });
    signalFilter.append(signalFilterLabel, signalSelect);

    const searchGroup = frameDocument.createElement("label");
    searchGroup.className = "amzwn-table-search";
    searchGroup.innerHTML = '<span aria-hidden="true">⌕</span>';

    const searchInput = frameDocument.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "搜索关键词或 ASIN";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-label", "在当前报告中搜索关键词或 ASIN");
    searchGroup.append(searchInput);

    controls.append(sectionTitle, count, signalFilter, searchGroup);
    tableShell.before(controls);

    const pagination = frameDocument.createElement("nav");
    pagination.className = "amzwn-pagination";
    pagination.setAttribute("aria-label", "关键词分页");
    tableShell.after(pagination);

    const followRail = document.createElement("div");
    followRail.className = "report-follow-scroll";
    followRail.tabIndex = 0;
    followRail.setAttribute("role", "scrollbar");
    followRail.setAttribute("aria-label", "关键词表格横向滑条");
    followRail.setAttribute("aria-orientation", "horizontal");
    const followTrack = document.createElement("div");
    followTrack.className = "report-follow-scroll__track";
    followRail.append(followTrack);
    document.body.append(followRail);

    const updateRailPosition = () => {
      positionFrameId = 0;
      const frameRect = frame.getBoundingClientRect();
      const shellRect = tableShell.getBoundingClientRect();
      const tableTop = frameRect.top + shellRect.top;
      const tableBottom = frameRect.top + shellRect.bottom;
      const visibleTop = Math.max(0, tableTop);
      const visibleBottom = Math.min(window.innerHeight, tableBottom);
      const hasVerticalSpace = visibleBottom - visibleTop > 24;
      const hasHorizontalOverflow = tableShell.scrollWidth - tableShell.clientWidth > 2;

      if (!hasVerticalSpace || !hasHorizontalOverflow) {
        followRail.classList.remove("is-visible");
        return;
      }

      const railHeight = 18;
      const left = Math.max(0, frameRect.left + shellRect.left);
      const right = Math.min(window.innerWidth, frameRect.left + shellRect.right);
      const top = Math.min(window.innerHeight - railHeight - 4, tableBottom - railHeight);
      followRail.style.left = `${Math.round(left)}px`;
      followRail.style.top = `${Math.round(Math.max(0, top))}px`;
      followRail.style.width = `${Math.max(80, Math.round(right - left))}px`;
      followRail.classList.add("is-visible");
    };

    const scheduleRailPosition = () => {
      if (positionFrameId) return;
      positionFrameId = window.requestAnimationFrame(updateRailPosition);
    };

    const updateFrameSize = () => {
      resizeFrameId = 0;
      const nextHeight = Math.ceil(Math.max(
        reportContent.scrollHeight,
        reportContent.offsetHeight,
        reportContent.getBoundingClientRect().height
      ));
      if (nextHeight > 0) frame.style.height = `${nextHeight}px`;
      followTrack.style.width = `${Math.max(table.scrollWidth, tableShell.scrollWidth)}px`;
      const maxScroll = Math.max(0, tableShell.scrollWidth - tableShell.clientWidth);
      followRail.setAttribute("aria-valuemin", "0");
      followRail.setAttribute("aria-valuemax", String(Math.round(maxScroll)));
      followRail.setAttribute("aria-valuenow", String(Math.round(tableShell.scrollLeft)));
      scheduleRailPosition();
    };

    const scheduleFrameSize = () => {
      if (resizeFrameId) return;
      resizeFrameId = window.requestAnimationFrame(updateFrameSize);
    };

    const syncFromRail = () => {
      if (syncingScroll) return;
      syncingScroll = true;
      tableShell.scrollLeft = followRail.scrollLeft;
      followRail.setAttribute("aria-valuenow", String(Math.round(followRail.scrollLeft)));
      window.requestAnimationFrame(() => { syncingScroll = false; });
    };

    const syncFromTable = () => {
      if (syncingScroll) return;
      syncingScroll = true;
      followRail.scrollLeft = tableShell.scrollLeft;
      followRail.setAttribute("aria-valuenow", String(Math.round(tableShell.scrollLeft)));
      window.requestAnimationFrame(() => { syncingScroll = false; });
    };

    const moveRailWithKeyboard = (event) => {
      const maxScroll = Math.max(0, followRail.scrollWidth - followRail.clientWidth);
      let target = null;
      if (event.key === "ArrowLeft") target = followRail.scrollLeft - 80;
      if (event.key === "ArrowRight") target = followRail.scrollLeft + 80;
      if (event.key === "PageUp") target = followRail.scrollLeft - followRail.clientWidth * 0.8;
      if (event.key === "PageDown") target = followRail.scrollLeft + followRail.clientWidth * 0.8;
      if (event.key === "Home") target = 0;
      if (event.key === "End") target = maxScroll;
      if (target === null) return;
      event.preventDefault();
      followRail.scrollLeft = Math.max(0, Math.min(maxScroll, target));
    };

    const scrollToTableStart = () => {
      const frameRect = frame.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      const target = window.scrollY + frameRect.top + controlsRect.top - 76;
      window.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    };

    const changePage = (page) => {
      currentPage = page;
      renderPage();
      scrollToTableStart();
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
      const signalActive = signalSelect.value !== "all";
      if (!filteredRows.length) count.textContent = `显示 0 / ${rows.length}`;
      else if (queryActive || signalActive) count.textContent = `显示 ${filteredRows.length} / ${rows.length}`;
      else count.textContent = `显示 ${start + 1}-${start + pageRows.length} / ${rows.length}`;

      pagination.replaceChildren();
      pagination.append(pageButton("‹", currentPage - 1, { disabled: currentPage === 1 }));
      for (let page = 1; page <= totalPages; page += 1) {
        pagination.append(pageButton(String(page), page, { current: page === currentPage }));
      }
      pagination.append(pageButton("›", currentPage + 1, { disabled: currentPage === totalPages }));
      scheduleFrameSize();
    };

    const filterRows = () => {
      const query = searchInput.value.trim().toLocaleLowerCase();
      const selectedSignal = signalSelect.value;
      filteredRows = rows.filter((row) => {
        const matchesSignal = selectedSignal === "all" || row.dataset.amzwnSignal === selectedSignal;
        const matchesQuery = !query || row.textContent.toLocaleLowerCase().includes(query);
        return matchesSignal && matchesQuery;
      });
      currentPage = 1;
      renderPage();
      tableShell.scrollLeft = 0;
      followRail.scrollLeft = 0;
    };

    followRail.addEventListener("scroll", syncFromRail, { passive: true });
    followRail.addEventListener("keydown", moveRailWithKeyboard);
    tableShell.addEventListener("scroll", syncFromTable, { passive: true });
    searchInput.addEventListener("input", filterRows);
    signalSelect.addEventListener("change", filterRows);
    window.addEventListener("scroll", scheduleRailPosition, { passive: true });
    window.addEventListener("resize", scheduleFrameSize);
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(scheduleFrameSize) : null;
    resizeObserver?.observe(reportContent);
    resizeObserver?.observe(table);
    renderPage();
    scheduleFrameSize();

    destroyReportControls = () => {
      followRail.removeEventListener("scroll", syncFromRail);
      followRail.removeEventListener("keydown", moveRailWithKeyboard);
      tableShell.removeEventListener("scroll", syncFromTable);
      searchInput.removeEventListener("input", filterRows);
      signalSelect.removeEventListener("change", filterRows);
      window.removeEventListener("scroll", scheduleRailPosition);
      window.removeEventListener("resize", scheduleFrameSize);
      resizeObserver?.disconnect();
      if (resizeFrameId) window.cancelAnimationFrame(resizeFrameId);
      if (positionFrameId) window.cancelAnimationFrame(positionFrameId);
      rows.forEach((row) => { row.hidden = false; });
      controls.remove();
      pagination.remove();
      followRail.remove();
      frame.style.height = "";
      stage.classList.remove("report-stage--expanded");
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
      // viewer can filter rows, resize the report, and sync the follow scrollbar.
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.addEventListener("load", () => {
        try {
          addReportControls(frame);
        } catch {
          removeReportControls();
          frame.style.height = "";
          stage.classList.remove("report-stage--expanded");
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
