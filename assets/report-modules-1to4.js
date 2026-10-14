/* Private report module viewer. This public file contains no report rows or images. */
(function (root) {
  "use strict";
  const MODULES = ["01", "02", "03", "04", "05", "06"];
  const NAMES = [
    "关键词作战总表", "自然位标杆", "否定词清单",
    "竞对对比", "图片诊断与优化", "综合判断与优化"
  ];
  const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https://m.media-amazon.com; font-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";
  const CHILD_STYLE = "<style>#desktop-modules,#mobile-module-select,#module-nav,#module-select,.nav-wrap{display:none!important}</style>";
  const PARENT_STYLE = `<style id="amzwn-modules-1to4-style">
    .report-stage.amzwn-module-stage{height:auto;min-height:0;overflow:visible}
    .amzwn-module-tabs{display:flex;gap:4px;overflow-x:auto;padding:8px;margin:0 0 10px;background:#fff;border:1px solid #dfe5ec;border-radius:12px}
    .amzwn-module-tabs button{flex:0 0 auto;padding:10px 12px;border:0;border-bottom:3px solid transparent;background:transparent;color:#475467;font:inherit;font-size:13px;font-weight:600;line-height:1.35;cursor:pointer}
    .amzwn-module-tabs button[aria-current="page"]{border-color:#ec6b23;color:#963c0a;background:#fff6f0}
    .amzwn-module-select{display:none;width:100%;min-height:44px;margin:0 0 10px;padding:8px 12px;border:1px solid #dfe5ec;border-radius:10px;background:#fff;font:inherit;font-size:14px;font-weight:600;line-height:1.4}
    .amzwn-module-view{display:block;width:100%;height:calc(100vh - 170px);min-height:560px;border:0;background:#fff}
    .amzwn-module-view[hidden],.report-frame[hidden]{display:none!important}
    @media(max-width:760px){.amzwn-module-tabs{display:none}.amzwn-module-select{display:block}.amzwn-module-view{height:calc(100dvh - 155px);min-height:420px}}
  </style>`;
  let mounted = null;

  function safeDocument(html) {
    if (typeof html !== "string" || !/^\s*<!doctype html>/i.test(html) ||
        html.length > 12 * 1024 * 1024) throw new Error("PRIVATE_MODULE_HTML_INVALID");
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
    return html.replace(/<head([^>]*)>/i, (_, attrs) => `<head${attrs}>${meta}${CHILD_STYLE}`);
  }

  function readBundle(frame, task) {
    const node = frame.contentDocument?.getElementById("amzwn-private-module-bundle");
    if (!node) return null;
    const bundle = JSON.parse(node.textContent);
    if (bundle.schemaVersion !== 1 || bundle.taskId !== task?.id ||
        bundle.asin !== task?.asin || bundle.site !== "US" ||
        !bundle.modules || !["01", "02", "03", "04"].every(
          key => typeof bundle.modules[key] === "string")) {
      throw new Error("PRIVATE_MODULE_BUNDLE_IDENTITY_MISMATCH");
    }
    return bundle;
  }

  function mount(frame, context) {
    if (mounted) mounted.dispose();
    const task = context?.task;
    const bundle = readBundle(frame, task);
    if (!bundle) return false;
    const stage = frame.parentElement;
    if (!stage) throw new Error("REPORT_STAGE_MISSING");
    stage.classList.add("amzwn-module-stage");
    if (!document.getElementById("amzwn-modules-1to4-style")) {
      document.head.insertAdjacentHTML("beforeend", PARENT_STYLE);
    }

    const tabs = document.createElement("nav");
    tabs.className = "amzwn-module-tabs";
    tabs.setAttribute("aria-label", "报告模块");
    const select = document.createElement("select");
    select.className = "amzwn-module-select";
    select.setAttribute("aria-label", "选择报告模块");
    for (let i = 0; i < MODULES.length; i++) {
      const number = MODULES[i], label = `${number} ${NAMES[i]}`;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.module = number;
      button.textContent = label;
      tabs.append(button);
      select.add(new Option(label, number));
    }
    stage.prepend(select);
    stage.prepend(tabs);
    const views = new Map();
    let active = "01";

    function show(number) {
      if (!MODULES.includes(number)) return;
      active = number;
      for (const button of tabs.querySelectorAll("button")) {
        if (button.dataset.module === number) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
      select.value = number;
      const legacy = Number(number) >= 5;
      frame.hidden = !legacy;
      if (legacy) {
        const toggle = frame.contentDocument?.getElementById(`module-toggle-${number}`);
        if (toggle) toggle.checked = true;
      }
      for (const [key, view] of views) view.hidden = key !== number;
      if (!legacy) {
        let view = views.get(number);
        if (!view) {
          view = document.createElement("iframe");
          view.className = "amzwn-module-view";
          view.title = `${number} ${NAMES[Number(number) - 1]}`;
          view.setAttribute("sandbox", "allow-scripts");
          view.setAttribute("referrerpolicy", "no-referrer");
          view.srcdoc = safeDocument(bundle.modules[number]);
          stage.append(view);
          views.set(number, view);
        }
        view.hidden = false;
      }
    }
    const handleTabs = event => {
      const button = event.target.closest("button[data-module]");
      if (button && tabs.contains(button)) show(button.dataset.module);
    };
    const handleSelect = () => show(select.value);
    tabs.addEventListener("click", handleTabs);
    select.addEventListener("change", handleSelect);
    const legacyDoc = frame.contentDocument;
    const legacyMenu = legacyDoc?.querySelector(".module-menu");
    const legacyLayout = legacyDoc?.querySelector(".report-layout");
    if (legacyMenu) legacyMenu.style.display = "none";
    if (legacyLayout) legacyLayout.style.gridTemplateColumns = "minmax(0,1fr)";
    show("01");
    mounted = {
      dispose() {
        tabs.removeEventListener("click", handleTabs);
        select.removeEventListener("change", handleSelect);
        tabs.remove();
        select.remove();
        for (const view of views.values()) view.remove();
        frame.hidden = false;
        stage.classList.remove("amzwn-module-stage");
        if (legacyMenu) legacyMenu.style.display = "";
        if (legacyLayout) legacyLayout.style.gridTemplateColumns = "";
      },
      show,
      get active() { return active; }
    };
    return true;
  }

  root.AMZWN_REPORT_MODULES_1TO4 = {
    mount,
    clear() { if (mounted) { mounted.dispose(); mounted = null; } }
  };
})(window);
