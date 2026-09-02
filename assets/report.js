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

  function setStatus(status) {
    statusPill.textContent = status;
    statusPill.dataset.status = status;
  }

  function showState(title, detail, action) {
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
    if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
    return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
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
      frame.setAttribute("sandbox", "");
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
