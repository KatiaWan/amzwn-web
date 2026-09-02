(function () {
  "use strict";

  const config = window.AMZWN_CONFIG;
  if (!config || !window.supabase) {
    throw new Error("AMZWN_INIT_FAILED");
  }

  const client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublicKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  function messageFor(error, fallback) {
    const text = String(error && error.message ? error.message : "").toLowerCase();
    if (text.includes("invalid login credentials")) return "邮箱或密码不正确，请检查后重试。";
    if (text.includes("email not confirmed")) return "请先打开注册邮件完成邮箱确认。";
    if (text.includes("user already registered")) return "这个邮箱已经注册，请直接登录。";
    if (text.includes("password should be")) return "密码至少需要 6 位。";
    if (text.includes("unable to validate email")) return "邮箱格式不正确，请检查。";
    if (text.includes("rate limit") || text.includes("security purposes")) return "操作太频繁，请稍后再试。";
    if (text.includes("failed to fetch") || text.includes("network")) return "网络连接失败，请检查网络后重试。";
    return fallback || "操作没有完成，请稍后再试。";
  }

  async function currentSession() {
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    return result.data.session;
  }

  async function requireSession(loginPath) {
    const session = await currentSession();
    if (!session) {
      window.location.replace(loginPath || "../");
      return null;
    }
    return session;
  }

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.querySelector("span")?.textContent || button.textContent;
      }
      const label = button.querySelector("span");
      if (label) label.textContent = busyLabel;
      else button.textContent = busyLabel;
    } else if (button.dataset.originalLabel) {
      const label = button.querySelector("span");
      if (label) label.textContent = button.dataset.originalLabel;
      else button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  }

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  }

  window.AMZWN = Object.freeze({
    client,
    config,
    currentSession,
    requireSession,
    messageFor,
    setBusy,
    formatDate
  });
})();
