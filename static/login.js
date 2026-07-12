const form = document.getElementById("loginForm");
const username = document.getElementById("username");
const password = document.getElementById("password");
const submit = document.getElementById("loginSubmit");
const error = document.getElementById("loginError");
const toggle = document.getElementById("togglePassword");

const requestedNext = new URLSearchParams(window.location.search).get("next") || "/";
const nextPath = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";

toggle.addEventListener("click", () => {
  const visible = password.type === "text";
  password.type = visible ? "password" : "text";
  toggle.textContent = visible ? "显示" : "隐藏";
  toggle.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
  password.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = "正在登录";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.value.trim(), password: password.value }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "登录失败");
    window.location.replace(nextPath);
  } catch (requestError) {
    error.textContent = requestError.message;
    error.hidden = false;
    password.select();
  } finally {
    submit.disabled = false;
    submit.textContent = "登录";
  }
});

username.focus();
