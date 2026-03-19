async function login() {
    const username = (document.getElementById("username").value || "").trim();
    const password = String(document.getElementById("password").value || "");

    const res = await fetch("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
        window.location.href = "/dashboard.html";
    } else {
        const msg = data.message || (res.status === 429
            ? "Too many login attempts. Please try again later."
            : "Invalid credentials");

        const errorEl = document.getElementById("error");
        if (errorEl) {
            errorEl.innerText = msg;
        } else {
            alert(msg);
        }
    }
}

window.login = login;
document.getElementById("loginBtn")?.addEventListener("click", login);