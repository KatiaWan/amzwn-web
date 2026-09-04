(function () {
  "use strict";

  const app = window.AMZWN;
  const recovery = window.AMZWN_AUTH_RECOVERY;
  const tabs = Array.from(document.querySelectorAll(".auth-tab"));
  const title = document.querySelector("#auth-title");
  const subtitle = document.querySelector("#auth-subtitle");
  const submitLabel = document.querySelector("#auth-submit-label");
  const submitButton = document.querySelector("#auth-submit");
  const emailInput = document.querySelector('input[name="email"]');
  const passwordInput = document.querySelector('input[name="password"]');
  const passwordField = document.querySelector("#password-field");
  const forgotButton = document.querySelector("#forgot-password");
  const backToLoginButton = document.querySelector("#back-to-login");
  const form = document.querySelector("#auth-form");
  const status = document.querySelector("#form-status");
  let mode = "login";

  const copy = {
    login: {
      title: "继续你的关键词作战",
      subtitle: "登录后提交任务，并查看只属于你的分析报告。",
      button: "登录并进入工具",
      hint: "使用已注册邮箱登录；新用户请先切换到“注册”。",
      autocomplete: "current-password"
    },
    signup: {
      title: "创建你的作战空间",
      subtitle: "注册后先完成邮箱确认，再回来提交第一条任务。",
      button: "注册并发送确认邮件",
      hint: "我们会把确认邮件发送到你的邮箱。",
      autocomplete: "new-password"
    },
    forgot: {
      title: "重设登录密码",
      subtitle: "输入注册邮箱，我们会发送一次性密码重置链接。",
      button: "发送重置邮件",
      hint: "重置链接只能使用一次；请在邮件到达后尽快完成设置。",
      autocomplete: "current-password"
    }
  };

  function setMode(nextMode) {
    if (!copy[nextMode]) return;
    mode = nextMode;
    for (const tab of tabs) {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    title.textContent = copy[mode].title;
    subtitle.textContent = copy[mode].subtitle;
    submitLabel.textContent = copy[mode].button;
    passwordInput.autocomplete = copy[mode].autocomplete;
    passwordInput.required = mode !== "forgot";
    passwordField.hidden = mode === "forgot";
    forgotButton.hidden = mode !== "login";
    backToLoginButton.hidden = mode !== "forgot";
    status.textContent = copy[mode].hint;
    status.className = "form-status";
    if (mode === "forgot") {
      passwordInput.value = "";
      emailInput.focus();
    }
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  }
  forgotButton.addEventListener("click", () => setMode("forgot"));
  backToLoginButton.addEventListener("click", () => setMode("login"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    status.className = "form-status";
    const pendingCopy = mode === "login"
      ? ["正在验证账号…", "正在登录…"]
      : mode === "signup"
        ? ["正在创建账号…", "正在注册…"]
        : ["正在发送重置邮件…", "正在发送…"];
    status.textContent = pendingCopy[0];
    app.setBusy(submitButton, true, pendingCopy[1]);

    try {
      if (mode === "login") {
        const result = await app.client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        window.location.replace("tool/");
        return;
      }

      if (mode === "forgot") {
        await recovery.requestPasswordReset(app.client, email, window.location.href);
        form.reset();
        status.className = "form-status is-success";
        status.textContent = "如果该邮箱已注册，你会收到密码重置邮件。请查看收件箱和垃圾邮件。";
        return;
      }

      const result = await app.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: new URL("./", window.location.href).href }
      });
      if (result.error) throw result.error;
      if (result.data.session) {
        window.location.replace("tool/");
        return;
      }
      form.reset();
      setMode("login");
      status.className = "form-status is-success";
      status.textContent = "注册成功。请打开邮箱完成确认，再回来登录。";
    } catch (error) {
      status.className = "form-status is-error";
      const fallback = mode === "forgot"
        ? "重置邮件暂时无法发送，请稍后重试。"
        : "登录服务暂时没有响应，请稍后重试。";
      status.textContent = app.messageFor(error, fallback);
    } finally {
      app.setBusy(submitButton, false);
      submitLabel.textContent = copy[mode].button;
    }
  });

  async function initialize() {
    const currentUrl = new URL(window.location.href);
    const resetSucceeded = currentUrl.searchParams.get("passwordReset") === "success";
    if (resetSucceeded) {
      window.history.replaceState(null, "", `${currentUrl.pathname}${currentUrl.hash}`);
      status.className = "form-status is-success";
      status.textContent = "密码已更新，请使用新密码登录。";
    }

    if (recovery.hasRecoveryIntent(window.location.href)) {
      status.className = "form-status";
      status.textContent = "正在验证密码重置链接…";
      const session = await app.waitForPasswordRecoverySession(10000);
      if (!session) {
        status.className = "form-status is-error";
        status.textContent = "重置链接无效或已过期，请重新发送。";
        return;
      }
      window.history.replaceState(null, "", currentUrl.pathname);
      window.location.replace(recovery.resetPageUrl(currentUrl.href));
      return;
    }

    const session = await app.currentSession();
    if (session) window.location.replace("tool/");
  }

  initialize().catch(() => {
      status.className = "form-status is-error";
      status.textContent = "登录服务暂时没有响应，请刷新页面重试。";
  });
})();
