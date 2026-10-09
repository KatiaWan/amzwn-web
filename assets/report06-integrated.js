(function (root) {
  "use strict";
  // This file contains view and rule code only. The 212 rows and parameter
  // defaults are embedded solely in the access-controlled report object.
  const SAMPLE_TASK_ID = "b5c39fe3-1f0b-47a1-b1c7-fb73a25f46d6";
  const SOURCE_HASHES = Object.freeze({
    "master-table.json": "3c3ea94ddab73ce59aebeb24e00a588941182245b08309f83b407140c902cb1c",
    "organic-rank.json": "3f7746d92cf29e00114d24f9912e0065a2e81193e416b48b31de1e5ebcd72693",
    "negatives.json": "27b30a4ad3d40091ab53e85a32a998d9d3fca08a2c63d9914dc826a346990fb5"
  });
  const coreScope = {};
(function (root) {
  "use strict";
  const keys = ["pause", "negative", "down", "hold", "up", "observe", "confirm"];
  const labels = { pause: "候选暂停具体目标", negative: "候选否定搜索词", down: "候选降低出价", hold: "守", up: "候选提高出价", observe: "观察", confirm: "需确认" };
  const cents = (value) => Math.round(Number(value) * 100);
  const money = (value) => value == null ? "—" : `$${Number(value).toFixed(2)}`;
  const pct = (value) => `${Number(value).toFixed(2).replace(/\.00$/, "")}%`;
  const acosText = (spend, sales) => sales > 0 ? pct(100 * spend / sales) : "—";
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function defaults(document) {
    return Object.fromEntries(Object.entries(document.sampleAssumptions).map(([key, entry]) => [key, entry.value]));
  }
  function validate(params) {
    const errors = [];
    const integer = ["noOrderMinClicks", "minClicksForOrderDecision", "minOrdersForAcosDecision", "minOrdersForIncrease", "reviewDays"];
    const required = ["targetAcosPct", "increaseAcosPct", "noOrderMinClicks", "noOrderMinSpendUsd", "minClicksForOrderDecision", "minOrdersForAcosDecision", "minOrdersForIncrease", "maxTeachingSpendForIncreaseUsd", "bidIncreasePct", "bidDecreasePct", "reviewDays"];
    for (const key of required) {
      if (!own(params, key) || params[key] == null || !Number.isFinite(params[key]) || params[key] <= 0) errors.push(`${key} 必须是大于0的数字`);
    }
    for (const key of integer) if (Number.isFinite(params[key]) && !Number.isInteger(params[key])) errors.push(`${key} 必须是整数`);
    for (const key of ["breakEvenAcosPct", "zeroOrderStopLossUsd", "rollbackOrderDropPct"]) {
      if (params[key] != null && (!Number.isFinite(params[key]) || params[key] <= 0)) errors.push(`${key} 留空或填大于0的数字`);
    }
    if (params.increaseAcosPct > params.targetAcosPct) errors.push("加价ACOS线高于目标ACOS；降价与加价条件可能重叠，请分别调整，系统不会暗改25%样例值");
    if (params.breakEvenAcosPct != null && params.targetAcosPct > params.breakEvenAcosPct) errors.push("目标ACOS高于保本ACOS；需先制定经批准的限期亏损规则，本教学页不自动放行");
    if (params.breakEvenAcosPct != null && params.increaseAcosPct > params.breakEvenAcosPct) errors.push("加价ACOS线高于保本ACOS，不能在未批准亏损时给加价候选");
    if (params.zeroOrderStopLossUsd != null && params.zeroOrderStopLossUsd < params.noOrderMinSpendUsd) errors.push("零单止损额低于零单最低花费样本；会在样本形成前触发暂停，请重新审定两者");
    if (params.minOrdersForIncrease < params.minOrdersForAcosDecision) errors.push("加价最低订单数不能少于进入有订单判断的最低订单数");
    if (params.bidIncreasePct > 100 || params.bidDecreasePct > 100) errors.push("单次出价调幅不能超过100%；该上限仅用于防止无效演示输入");
    if (params.rollbackOrderDropPct != null && params.rollbackOrderDropPct > 100) errors.push("订单下滑回撤比例须不超过100%");
    if (params.targetAcosPct > 1000 || params.increaseAcosPct > 1000 || (params.breakEvenAcosPct ?? 0) > 1000) errors.push("ACOS输入超过演示计算上限1000%，请核对是否误填百分号");
    return errors;
  }
  function parseInputs(values, base) {
    const result = { ...base }, errors = [];
    for (const [key, rawValue] of Object.entries(values)) {
      const raw = String(rawValue).trim();
      const optional = ["breakEvenAcosPct", "zeroOrderStopLossUsd", "rollbackOrderDropPct"].includes(key);
      if (optional && raw === "") { result[key] = null; continue; }
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) { errors.push(`${key} 请输入数字，最多两位小数${optional ? "；或留空" : ""}`); continue; }
      result[key] = Number(raw);
    }
    return { params: result, errors: [...errors, ...(errors.length ? [] : validate(result))] };
  }
  const output = (code, evidence, limitations, review, specificTarget) => ({ code, label: labels[code], evidence, limitations, review, specificTarget, campaignBudget: "待判断：缺活动预算、消耗节奏及其他目标表现", realExecutable: "待判断" });
  const baseLimits = (document) => {
    const list = [];
    if (!document.evidence.adReportPeriod) list.push("广告报表无起止日，不能验证观察天数或归因延迟");
    return list;
  };
  function decide(row, params, document, flags = {}) {
    const ad = row.teachingAd, limits = baseLimits(document), rank = row.organicRankHistorical;
    const bidLimits = document.evidence.specificTargetMappingVerified ? limits : [...limits, "搜索词未映射到可单独调整的真实投放目标；出价仅为候选"];
    const rankNote = rank == null ? "没有该词的留存自然位" : `仅有${row.organicSnapshotDate}一次自然位${rank}名，可作当时位置参考，不能判断升降`;
    const review = `按教学假设${params.reviewDays}天复查；原报表无起止日，不能从本页认定到期；${params.rollbackOrderDropPct == null ? "订单下滑回撤线未确认" : `订单较调整前下滑${pct(params.rollbackOrderDropPct)}时复核回撤`}`;
    if (!ad || ad.clicks == null || ad.spendUsd == null || ad.salesUsd == null || ad.orders == null) {
      return output("confirm", ["演示报表未覆盖该词的点击、花费、订单和销售额", rankNote], ["补该词真实广告数据；排名位置不能代替广告表现", ...limits], "补齐广告数据后重算", "不调整");
    }
    const clicks = ad.clicks, orders = ad.orders, spend = cents(ad.spendUsd), sales = cents(ad.salesUsd);
    if (!Number.isInteger(clicks) || clicks < 0 || !Number.isInteger(orders) || orders < 0 || !Number.isFinite(spend) || spend < 0 || !Number.isFinite(sales) || sales < 0) {
      return output("confirm", ["广告原始量无效", rankNote], ["先核对原报表", ...limits], "数据纠正后重算", "不调整");
    }
    const facts = `${clicks}点击、${money(ad.spendUsd)}花费、${orders}单、${money(ad.salesUsd)}广告归因销售额`;
    const common = [facts, rankNote];
    if (orders === 0) {
      if (sales > 0) return output("confirm", common, ["零单却有销售额，归因口径矛盾", ...limits], "核对订单和销售额", "不调整");
      if (clicks < params.noOrderMinClicks || spend < cents(params.noOrderMinSpendUsd)) {
        return output("observe", [...common, `未同时达到零单样本${params.noOrderMinClicks}点击和${money(params.noOrderMinSpendUsd)}花费`], limits, review, "不调整");
      }
      const irrelevant = flags.irrelevantConfirmed === true;
      const isolated = flags.isolatedTargetConfirmed === true;
      const negativeSafe = flags.negativeScopeConfirmed === true;
      const lossReached = params.zeroOrderStopLossUsd != null && spend >= cents(params.zeroOrderStopLossUsd);
      if (isolated && (irrelevant || lossReached)) {
        const why = irrelevant ? "人工确认该词不相关" : `达到假设已批准的零单止损额${money(params.zeroOrderStopLossUsd)}；即使词相关也可讨论暂停`;
        return output("pause", [...common, why, "已假设核实对应具体目标可单独暂停"], ["仅暂停具体投放目标，不等于否定搜索词或停整个活动", ...limits], review, "候选：暂停已核实的具体投放目标");
      }
      if (irrelevant && negativeSafe) return output("negative", [...common, "人工确认不相关，且假设已核实否词匹配范围不会误伤有效词"], ["否定搜索词不同于暂停目标；仍需人工审核后端匹配方式", ...limits], review, "不调整出价；否词另由人工审核");
      if ((lossReached || irrelevant) && !isolated) return output("pause", [...common, irrelevant ? "假设已人工确认该词不相关" : `达到假设已批准的零单止损额${money(params.zeroOrderStopLossUsd)}`], ["尚未把搜索词准确对应到可单独暂停的目标；这只是待核对的暂停候选，不能直接执行", "暂停目标不等于否定搜索词或停整个活动", ...limits], "先核对活动、广告组、具体目标及是否共享其他有效词", "候选：核对后才考虑暂停具体目标");
      const relevance = own(flags, "relevance") ? flags.relevance : row.module03Relevance;
      if (["related", "competitor_related"].includes(relevance)) return output("down", [...common, "词义相关，零单已过教学点击与花费门槛"], ["只是具体目标降出价候选；相关词不机械否定或暂停", ...bidLimits], review, `候选：具体目标出价-${pct(params.bidDecreasePct)}`);
      const missing = ["尚未确认词义、具体目标隔离或安全否词范围，不能在暂停／否词／降价之间替你选择"];
      return output("confirm", [...common, "零单样本达到教学门槛"], [...missing, ...limits], "先人工核对相关性、目标映射和否词范围", "不调整");
    }
    if (sales === 0) return output("confirm", common, ["有订单但销售额为0，ACOS不可算", ...limits], "核对归因口径", "不调整");
    if (clicks < params.minClicksForOrderDecision || orders < params.minOrdersForAcosDecision) {
      return output("observe", [...common, `未同时达到${params.minClicksForOrderDecision}点击、${params.minOrdersForAcosDecision}单的教学样本`], limits, review, "不调整");
    }
    const acos = acosText(spend, sales), targetBps = Math.round(params.targetAcosPct * 100), increaseBps = Math.round(params.increaseAcosPct * 100);
    const aboveTarget = spend * 10000 > sales * targetBps;
    const aboveBreakEven = params.breakEvenAcosPct != null && spend * 10000 > sales * Math.round(params.breakEvenAcosPct * 100);
    const costLimit = params.breakEvenAcosPct == null ? ["没有真实保本／获准亏损边界；不能据此宣称盈利或执行调价"] : [];
    if (aboveTarget || aboveBreakEven) return output("down", [...common, `ACOS ${acos}${aboveTarget ? `高于教学目标${pct(params.targetAcosPct)}` : "虽在目标内，但高于所设保本边界"}`, "有订单只排除零单停词分支，不阻断降出价"], [...costLimit, ...bidLimits], review, `候选：具体目标出价-${pct(params.bidDecreasePct)}`);
    if (orders >= params.minOrdersForIncrease && spend * 10000 <= sales * increaseBps && spend <= cents(params.maxTeachingSpendForIncreaseUsd)) {
      return output("up", [...common, `ACOS ${acos}不高于独立加价线${pct(params.increaseAcosPct)}`, `达到${params.minOrdersForIncrease}单，加价教学花费未超过${money(params.maxTeachingSpendForIncreaseUsd)}`], [...costLimit, "阶段与投放目的未确认；本页未启用基于排名或限期亏损的加价策略", ...bidLimits], review, `候选：具体目标出价+${pct(params.bidIncreasePct)}`);
    }
    const why = orders < params.minOrdersForIncrease ? `仅${orders}单，未达加价所需${params.minOrdersForIncrease}单` : spend * 10000 > sales * increaseBps ? `ACOS ${acos}高于加价线${pct(params.increaseAcosPct)}` : `花费超过加价教学上限${money(params.maxTeachingSpendForIncreaseUsd)}`;
    return output("hold", [...common, `ACOS ${acos}不高于教学目标${pct(params.targetAcosPct)}`, why], [...costLimit, ...limits], review, "具体目标出价保持");
  }
  function computeRows(data, params, document) { return data.rows.map((row) => ({ ...row, advice: decide(row, params, document) })); }
  function counts(rows) { const result = Object.fromEntries(keys.map((key) => [key, 0])); for (const row of rows) result[row.advice.code]++; return result; }
  root.Report06Comprehensive = { keys, labels, defaults, validate, parseInputs, decide, computeRows, counts, money, pct, acosText };
})(coreScope);

function mountReport06UI(scope, data, config) {
  "use strict";
  const core = coreScope.Report06Comprehensive;
  const initial = core.defaults(config);
  const state = { params: { ...initial }, rows: [], selected: { bedroom: "base", "bedroom lights": "base", "outdoor led lights": "base" } };
  const $ = (id) => scope.getElementById(id);
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const displayLabels = { pause: "建议暂停具体目标", negative: "建议否定搜索词", down: "建议降低出价", hold: "建议维持出价", up: "建议提高出价", observe: "继续观察", confirm: "还需确认" };
  function plain(value) {
    return String(value)
      .replaceAll("假设已人工确认", "如果人工已确认").replaceAll("已假设核实", "如果已核实").replaceAll("假设已核实", "如果已核实").replaceAll("假设已批准", "如果已批准")
      .replaceAll("演示报表未覆盖该词的", "当前资料缺少该词的").replaceAll("演示报表", "当前资料")
      .replaceAll("补该词真实广告数据；排名位置不能代替广告表现", "补充该词广告数据；排名位置不能代替广告表现")
      .replaceAll("搜索词未映射到可单独调整的真实投放目标；出价仅为候选", "此词对应的具体投放目标还需核实；不能直接调整出价")
      .replaceAll("演示计算上限", "计算上限").replaceAll("无效演示输入", "无效输入")
      .replaceAll("按教学假设", "按当前设置").replaceAll("教学目标", "设定目标").replaceAll("教学样本", "设定样本")
      .replaceAll("教学点击与花费门槛", "设定点击与花费门槛").replaceAll("加价教学花费", "加价花费")
      .replaceAll("教学花费上限", "设定花费上限").replaceAll("教学门槛", "设定门槛")
      .replaceAll("教学", "当前设置").replaceAll("演示", "当前资料").replaceAll("候选", "建议")
      .replaceAll("本当前设置页", "此页").replaceAll("25%样例值", "输入值");
  }
  const bulletList = (items) => `<ul>${items.map((item) => `<li>${esc(plain(item))}</li>`).join("")}</ul>`;
  const facts = (row) => row.teachingAd.clicks == null ? "暂无该词广告数据" : `${row.teachingAd.clicks}点击 · ${row.teachingAd.orders}单 · ${core.money(row.teachingAd.spendUsd)}花费 · ${core.money(row.teachingAd.salesUsd)}销售额 · ACOS ${core.acosText(row.teachingAd.spendUsd, row.teachingAd.salesUsd)}`;
  const perWordLimits = (items) => items.filter((item) => !item.startsWith("广告报表无起止日") && !item.startsWith("没有真实保本") && !item.startsWith("阶段与投放目的"));
  function operation(a) {
    const amount = a.specificTarget.match(/[+-](\d+(?:\.\d+)?%)/)?.[1];
    if (a.code === "up") return `建议将具体投放目标出价提高${amount || "设定幅度"}；需人工决定是否执行`;
    if (a.code === "down") return `建议将具体投放目标出价降低${amount || "设定幅度"}；需人工决定是否执行`;
    if (a.code === "pause") return a.specificTarget.includes("核对后") ? "先核对搜索词对应的具体目标，再考虑暂停；目前不能直接执行" : "建议核实具体目标后考虑暂停；需人工决定是否执行";
    if (a.code === "negative") return "建议单独审核是否否定搜索词及匹配范围；暂不调整出价";
    if (a.code === "hold") return "建议维持目前的具体目标出价";
    return a.code === "observe" ? "暂不调整，继续观察" : "暂不调整，先补齐所列资料";
  }
  const reviewText = (a) => plain(a.review).replaceAll("原报表无起止日，不能从本页认定到期", "复查起算日还需确认");
  const rowByTerm = (term) => data.rows.find((row) => row.term === term);
  const demos = [
    { term: "bedroom", cases: [
      { id: "base", label: "当前条件", desc: "不改条件" },
      { id: "moreOrders", label: "若加价要至少5单", desc: "只提高加价订单门槛；原词仍只有4单", change: (p) => ({ ...p, minOrdersForIncrease: Math.max(5, p.minOrdersForIncrease, p.minOrdersForAcosDecision) }) },
    ] },
    { term: "bedroom lights", cases: [
      { id: "base", label: "当前条件", desc: "不改条件" },
      { id: "sample", label: "若判成本至少要7单", desc: "提高有订单样本门槛；原词只有6单", change: (p) => ({ ...p, minOrdersForAcosDecision: Math.max(7, p.minOrdersForAcosDecision), minOrdersForIncrease: Math.max(7, p.minOrdersForIncrease) }) },
      { id: "target", label: "若目标改为45%", desc: "只改变目标数值；是否可接受仍需成本依据", change: (p) => ({ ...p, targetAcosPct: Math.max(45, p.targetAcosPct) }) },
    ] },
    { term: "outdoor led lights", cases: [
      { id: "base", label: "当前条件", desc: "不增加任何确认" },
      { id: "pause", label: "若批准$20止损且目标可隔离", desc: "如果零单损失上限及具体目标隔离均已核实；不要求词不相关", change: (p) => ({ ...p, zeroOrderStopLossUsd: 20 }), flags: { isolatedTargetConfirmed: true } },
      { id: "negative", label: "若确认不相关且否词范围安全", desc: "如果语义与否词匹配范围均经人工确认；这与暂停目标不同", flags: { irrelevantConfirmed: true, negativeScopeConfirmed: true } },
    ] },
  ];

  function detailHtml(row) {
    const a = row.advice;
    const limits = perWordLimits(a.limitations);
    const confirm = limits.length ? bulletList(limits) : '<p>本词暂无额外缺口；共通的数据限制见上方说明。</p>';
    return `<div class="detail"><h4>操作建议</h4><p>${esc(operation(a))}。广告活动预算暂无调整建议，需另看活动级数据。</p><h4>建议原因</h4>${bulletList(a.evidence)}<h4>还需确认</h4>${confirm}<h4>复查条件</h4><p>${esc(reviewText(a))}</p></div>`;
  }
  function shortReason(row) {
    const a = row.advice;
    if (a.code === "confirm") return plain(perWordLimits(a.limitations)[0] || a.evidence[0]);
    return plain(a.evidence[2] || a.evidence[1] || a.evidence[0]);
  }
  function rowHtml(row) {
    const a = row.advice;
    return `<details class="entry" id="word-${row.number}" data-code="${a.code}"><summary><span class="term">${esc(row.term)}</span><span class="tag ${a.code}">${esc(displayLabels[a.code])}</span><span class="short">${esc(facts(row))}；${esc(shortReason(row))}</span><span class="more">查看原因</span></summary>${detailHtml(row)}</details>`;
  }
  function renderList() {
    const list = $("list"), open = new Set([...list.querySelectorAll("details[open]")].map((item) => item.id));
    const query = $("search").value.trim().toLowerCase(), code = $("action-filter").value;
    const visible = state.rows.filter((row) => row.term.includes(query) && (!code || row.advice.code === code));
    list.innerHTML = visible.length ? visible.map(rowHtml).join("") : '<p class="empty">没有匹配词；请清空筛选。</p>';
    for (const id of open) { const item = $(id); if (item) item.open = true; }
    $("shown").textContent = `显示 ${visible.length} / ${state.rows.length} 词`;
  }
  function scenarioResult(definition, choice) {
    const row = rowByTerm(definition.term);
    const params = choice.change ? choice.change(state.params) : state.params;
    const errors = core.validate(params);
    if (errors.length) return { error: errors.join("；") };
    return { advice: core.decide(row, params, config, choice.flags || {}), params };
  }
  function demoHtml(definition) {
    const row = rowByTerm(definition.term);
    const selected = definition.cases.find((item) => item.id === state.selected[definition.term]) || definition.cases[0];
    const result = scenarioResult(definition, selected);
    const options = definition.cases.map((item) => `<button type="button" data-term="${esc(definition.term)}" data-case="${item.id}" aria-pressed="${item.id === selected.id}">${esc(item.label)}</button>`).join("");
    const output = result.error ? `<b>当前设置有冲突</b><span>${esc(plain(result.error))}</span>` : `<b>${esc(displayLabels[result.advice.code])}</b><span>${esc(plain(result.advice.evidence.filter((item) => !item.includes("自然位")).slice(-2).join("；")))}</span><small>${esc(selected.desc)}。${esc(plain(perWordLimits(result.advice.limitations)[0] || "相关资料仍需人工核实"))}</small>`;
    return `<div class="demo"><b class="term">${esc(definition.term)}</b><p class="muted">${esc(facts(row))}</p><div class="options">${options}</div><div class="demo-output" aria-live="polite">${output}</div><a class="demo-link" href="#word-${row.number}" data-open="${row.number}">查看该词建议原因</a></div>`;
  }
  function renderDemos() { $("demos").innerHTML = demos.map(demoHtml).join(""); }
  function render() {
    state.rows = core.computeRows(data, state.params, config);
    const totals = core.counts(state.rows);
    $("counts").innerHTML = core.keys.map((key) => `<span class="count">${esc(displayLabels[key])} ${totals[key]}</span>`).join("");
    $("active-note").textContent = `当前目标${core.pct(state.params.targetAcosPct)}、加价线${core.pct(state.params.increaseAcosPct)}`;
    renderDemos(); renderList();
  }
  function showError(value) { $("param-error").textContent = plain(value); $("param-error").hidden = !value; }
  function inputValues() { return Object.fromEntries([...scope.querySelectorAll("input[data-param]")].map((input) => [input.dataset.param, input.value])); }
  $("apply-params").addEventListener("click", () => {
    const checked = core.parseInputs(inputValues(), state.params);
    if (checked.errors.length) { showError(checked.errors.join("；")); return; }
    state.params = checked.params; showError(""); render();
  });
  $("reset-params").addEventListener("click", () => {
    state.params = { ...initial };
    for (const input of scope.querySelectorAll("input[data-param]")) input.value = initial[input.dataset.param] == null ? "" : String(initial[input.dataset.param]);
    state.selected = { bedroom: "base", "bedroom lights": "base", "outdoor led lights": "base" };
    showError(""); render();
  });
  $("search").addEventListener("input", renderList);
  $("action-filter").addEventListener("change", renderList);
  $("clear-filters").addEventListener("click", () => { $("search").value = ""; $("action-filter").value = ""; renderList(); });
  $("demos").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-case]");
    if (button) { state.selected[button.dataset.term] = button.dataset.case; renderDemos(); return; }
    const link = event.target.closest("a[data-open]");
    if (link) { $("search").value = ""; $("action-filter").value = ""; renderList(); const item = $(`word-${link.dataset.open}`); if (item) item.open = true; }
  });
  render();
  return { state, demos, scenarioResult, render };
}


  function validateBinding(bundle, context, ownerSha256) {
    const binding = bundle?.binding;
    const data = bundle?.data;
    const config = bundle?.config;
    if (!binding || !data || !config || !context?.task || !context?.userId) return "资料不完整";
    if (context.task.id !== SAMPLE_TASK_ID || binding.taskId !== SAMPLE_TASK_ID) return "任务编号不符";
    if (String(context.task.asin).toUpperCase() !== "B09V366BDY" || binding.asin !== "B09V366BDY") return "商品编号不符";
    if (binding.ownerSha256 !== ownerSha256) return "账号归属不符";
    if (binding.site !== "US" || data.source?.site !== "US" || data.source?.asin !== "B09V366BDY") return "站点或数据来源不符";
    if (binding.dataKind !== "COURSE_SIMULATION" || data.source.adReportKind !== "COURSE_SIMULATION") return "样例来源不符";
    if (config.mode !== "TEACHING_ONLY_UNCONFIRMED" || config.evidence?.rankTrendComparable !== false || config.evidence?.adReportPeriod !== null) return "参数来源不符";
    if (!Array.isArray(data.rows) || data.rows.length !== 212 || data.rows.filter((row) => row.inMaster200).length !== 200 || data.rows.filter((row) => row.teachingAd?.clicks != null).length !== 91) return "词表数量不符";
    if (data.rows.some((row) => row.realExecutableSuggestion !== "待判断" || row.rankImprovement != null)) return "真实建议或排名结论越界";
    for (const [name, hash] of Object.entries(SOURCE_HASHES)) {
      if (binding.sourceHashes?.[name] !== hash || data.source.inputHashes?.[name] !== hash) return "原始资料不符";
    }
    return null;
  }

  async function ownerHash(userId) {
    const bytes = new TextEncoder().encode(userId);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function mount(frame, context) {
    const doc = frame?.contentDocument;
    const payload = doc?.querySelector('script[type="application/json"][data-report06-bundle]');
    const host = doc?.getElementById("report06-host");
    const template = doc?.getElementById("report06-page");
    if (!payload && !host && !template) return false;
    if (!payload || !host || !template || host.shadowRoot) return false;
    let bundle;
    try { bundle = JSON.parse(payload.textContent); } catch { host.textContent = "报告06资料无法读取，请核对来源。"; return false; }
    const digest = await ownerHash(context.userId);
    if (!frame.isConnected || doc !== frame.contentDocument) return false;
    const session = await root.AMZWN?.currentSession();
    if (!session || session.user.id !== context.userId || !frame.isConnected) return false;
    const error = validateBinding(bundle, context, digest);
    if (error) { host.textContent = `报告06还需确认：${error}。`; return false; }
    const scope = host.attachShadow({ mode: "closed" });
    scope.append(template.content.cloneNode(true));
    // Retain the existing wording and interactions; no executable script runs
    // inside the sandboxed report iframe.
    mountReport06UI(scope, bundle.data, bundle.config);
    payload.textContent = "";
    return true;
  }

  function mountOffline(doc) {
    // A downloaded report has no authenticated session. It is already a
    // private file in the owner's possession; validate its bound content and
    // task metadata, then enable local-only interactions without any request.
    const reportTaskId = doc?.querySelector('meta[name="amzwn-task-id"]')?.content;
    const payload = doc?.querySelector('script[type="application/json"][data-report06-bundle]');
    const host = doc?.getElementById("report06-host");
    const template = doc?.getElementById("report06-page");
    if (!payload || !host || !template || host.shadowRoot) return false;
    let bundle;
    try { bundle = JSON.parse(payload.textContent); } catch { host.textContent = "报告06资料无法读取。"; return false; }
    if (reportTaskId !== SAMPLE_TASK_ID || !String(doc.title).includes("B09V366BDY") ||
        !/^[0-9a-f]{64}$/.test(bundle.binding?.ownerSha256 || "")) {
      host.textContent = "报告06任务归属还需确认。";
      return false;
    }
    const error = validateBinding(bundle, { userId: "downloaded-file", task: { id: reportTaskId, asin: "B09V366BDY" } }, bundle.binding.ownerSha256);
    if (error) { host.textContent = `报告06还需确认：${error}。`; return false; }
    const scope = host.attachShadow({ mode: "closed" });
    scope.append(template.content.cloneNode(true));
    mountReport06UI(scope, bundle.data, bundle.config);
    payload.textContent = "";
    return true;
  }

  root.AMZWN_REPORT06 = { mount, mountOffline, validateBinding };
})(window);
