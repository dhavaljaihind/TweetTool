async function getMyRole() {
  try {
    const r = await fetch("/admin/myRole", { credentials: "include" });
    const data = await r.json();
    return data.role || "normal";
  } catch (e) {
    return "normal";
  }
}

async function loadAdmins() {
  const role = await getMyRole();

  // If not super admin, hide everything
  if (role !== "super") {
    document.body.textContent = "";

    const wrap = document.createElement("div");
    wrap.className = "dashboard-container";
    wrap.style.marginTop = "40px";

    const card = document.createElement("div");
    card.className = "card glass-card";
    card.style.textAlign = "center";

    const h2 = document.createElement("h2");
    h2.style.color = "#d32f2f";
    h2.innerText = "Access Denied";

    const p = document.createElement("p");
    p.innerText = "Super Admin only.";

    const a = document.createElement("a");
    a.href = "/dashboard.html";
    a.className = "logout-btn";
    a.style.display = "inline-block";
    a.style.marginTop = "10px";
    a.style.textDecoration = "none";
    a.innerText = "Back";

    card.appendChild(h2);
    card.appendChild(p);
    card.appendChild(a);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    return;
  }

  try {
    const res = await fetch("/admin/getAdmins", { credentials: "include" });
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast("Failed to load admins ❌", 3000);
      return;
    }

    const admins = Array.isArray(data.admins) ? data.admins : [];

    const box = document.getElementById("adminsList");
    box.innerHTML = "";

    if (admins.length === 0) {
      box.innerHTML = "<p>No admins found.</p>";
      return;
    }

    admins.forEach((a) => {
      const row = document.createElement("div");
      row.className = "leader-row";

      const span = document.createElement("span");
      span.innerText = `${a.username} (${a.role})`;

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "10px";
      actions.style.alignItems = "center";

      const btn = document.createElement("button");
      btn.className = "delete-btn";
      btn.type = "button";
      btn.innerText = "Delete";
      btn.addEventListener("click", () => deleteAdmin(a.username));

      actions.appendChild(btn);
      row.appendChild(span);
      row.appendChild(actions);

      box.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    showToast("Error loading admins ❌", 3000);
  }
}

async function addAdmin() {
  const username = (document.getElementById("username").value || "").trim();
  const password = (document.getElementById("password").value || "").trim();
  const role = document.getElementById("role").value;

  if (!username) {
    showToast("Username required", 3000);
    return;
  }
  if (password.length < 8) {
    showToast("Password must be at least 8 characters", 3000);
    return;
  }

  try {
    const res = await fetch("/admin/addAdmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password, role }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      showToast("Admin added ✅", 3000);
      document.getElementById("username").value = "";
      document.getElementById("password").value = "";
      document.getElementById("role").value = "normal";
      loadAdmins();
    } else {
      showToast(data.message || "Failed to add admin ❌", 3000);
    }
  } catch (e) {
    console.error(e);
    showToast("Failed to add admin ❌", 3000);
  }
}

async function deleteAdmin(username) {
  const ok = confirm(`Delete admin "${username}"?`);
  if (!ok) return;

  try {
    const res = await fetch(`/admin/deleteAdmin/${encodeURIComponent(username)}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      showToast("Admin deleted ✅", 3000);
      loadAdmins();
    } else {
      showToast(data.message || "Failed to delete ❌", 3000);
    }
  } catch (e) {
    console.error(e);
    showToast("Failed to delete ❌", 3000);
  }
}

/* Make functions available to HTML onclick */
window.addAdmin = addAdmin;
window.deleteAdmin = deleteAdmin;

/* INIT */
loadAdmins();

document.getElementById("addAdminBtn")?.addEventListener("click", addAdmin);