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

  const recoveryMarker = "amzwn.password-recovery";
  const recoveryWaiters = new Set();
  let passwordRecoverySeen = false;

  function setRecoveryMarker(active) {
    try {
      if (active) window.sessionStorage.setItem(recoveryMarker, "1");
      else window.sessionStorage.removeItem(recoveryMarker);
    } catch (_) {
      // sessionStorage can be unavailable in hardened browsers. The in-memory
      // PASSWORD_RECOVERY event remains the source of truth for this page load.
    }
  }

  function hasRecoveryMarker() {
    try {
      return window.sessionStorage.getItem(recoveryMarker) === "1";
    } catch (_) {
      return false;
    }
  }

  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
      passwordRecoverySeen = true;
      setRecoveryMarker(true);
      for (const waiter of recoveryWaiters) waiter.resolve(session);
      recoveryWaiters.clear();
      return;
    }
    if (event === "SIGNED_OUT") {
      passwordRecoverySeen = false;
      setRecoveryMarker(false);
    }
  });

  function messageFor(error, fallback) {
    const text = String(error && error.message ? error.message : "").toLowerCase();
    if (text.includes("invalid login credentials")) return "邮箱或密码不正确，请检查后重试。";
    if (text.includes("email not confirmed")) return "请先打开注册邮件完成邮箱确认。";
    if (text.includes("user already registered")) return "这个邮箱已经注册，请直接登录。";
    if (text.includes("same password") || text.includes("different from the old password")) return "新密码不能与当前密码相同。";
    if (text.includes("weak password")) return "新密码强度不足，请增加长度或复杂度。";
    if (text.includes("session missing") || text.includes("invalid refresh token") || text.includes("refresh token not found")) return "重置链接无效或已过期，请重新发送。";
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

  async function waitForPasswordRecoverySession(timeoutMs) {
    if (passwordRecoverySeen || hasRecoveryMarker()) {
      const session = await currentSession();
      if (session) return session;
      passwordRecoverySeen = false;
      setRecoveryMarker(false);
    }

    const wait = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 10000;
    return new Promise((resolve) => {
      const waiter = { resolve, timer: null };
      waiter.timer = window.setTimeout(() => {
        recoveryWaiters.delete(waiter);
        resolve(null);
      }, wait);
      waiter.resolve = (session) => {
        window.clearTimeout(waiter.timer);
        resolve(session);
      };
      recoveryWaiters.add(waiter);
    });
  }

  async function clearPasswordRecoverySession() {
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error) throw result.error;
    passwordRecoverySeen = false;
    setRecoveryMarker(false);
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
    waitForPasswordRecoverySession,
    clearPasswordRecoverySession,
    requireSession,
    messageFor,
    setBusy,
    formatDate
  });
})();
