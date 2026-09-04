(function (global) {
  "use strict";

  const ASIN_PATTERN = /^B0[A-Z0-9]{8}$/;

  function normalizeAsin(value) {
    const asin = String(value || "").trim().toUpperCase();
    if (!ASIN_PATTERN.test(asin)) throw new Error("ASIN 需要 10 位并以 B0 开头");
    return asin;
  }

  function normalizeCompetitors(values, ownAsin) {
    const competitors = Array.from(values || []).map(normalizeAsin);
    if (competitors.length < 3 || competitors.length > 5) {
      throw new Error("请填写 3–5 个竞品 ASIN");
    }
    const all = [normalizeAsin(ownAsin)].concat(competitors);
    if (new Set(all).size !== all.length) throw new Error("自己与竞品 ASIN 不能重复");
    return competitors;
  }

  function normalizeCoreKeyword(value) {
    const keyword = String(value || "").trim().replace(/\s+/g, " ");
    if (keyword.length > 200 || /[\u0000-\u001f\u007f]/.test(keyword)) {
      throw new Error("核心关键词不能超过 200 字符，也不能包含控制字符");
    }
    return keyword || null;
  }

  function apiEndpoint(authCheckUrl, route) {
    const url = new URL(authCheckUrl);
    if (url.pathname !== "/api/auth-check") throw new Error("安全接口地址格式不正确");
    const separator = String(route).indexOf("?");
    url.pathname = separator < 0 ? route : String(route).slice(0, separator);
    url.search = separator < 0 ? "" : String(route).slice(separator);
    url.hash = "";
    return url.href;
  }

  function prepareMediaPackage(document, authority) {
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("媒体清单必须是 JSON 对象");
    }
    if (!Array.isArray(document.products)) throw new Error("媒体清单缺少 products 数组");
    return Object.assign({}, document, {
      taskId: authority.taskId,
      configRevision: authority.configRevision,
      site: authority.site,
      nonce: authority.nonce,
      humanReview: { status: "未确认" }
    });
  }

  global.AMZWN_MODULE3 = Object.freeze({
    normalizeAsin: normalizeAsin,
    normalizeCompetitors: normalizeCompetitors,
    normalizeCoreKeyword: normalizeCoreKeyword,
    apiEndpoint: apiEndpoint,
    prepareMediaPackage: prepareMediaPackage
  });
})(typeof window === "object" ? window : globalThis);
