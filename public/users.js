let ALL_USERS = [];
let FILTERED_USERS = [];

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.innerText = msg || "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = String(value ?? "");
}

function updateStats(users) {
  const all = Array.isArray(users) ? users : [];
  const total = all.length;
  const blocked = all.filter((u) => !!u.isBlocked).length;
  const active = all.filter((u) => !u.isBlocked).length;
  const completed = all.filter((u) => !!u.profileCompleted).length;

  setText("totalUsersCount", total);
  setText("activeUsersCount", active);
  setText("blockedUsersCount", blocked);
  setText("completedUsersCount", completed);
}

function safeText(v) {
  return String(v ?? "");
}

function esc(s) {
  return safeText(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function norm(v) {
  return String(v ?? "").trim();
}

function normLower(v) {
  return norm(v).toLowerCase();
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean).map(norm))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function fillSelectOptions(selectId, values, defaultLabel) {
  const el = document.getElementById(selectId);
  if (!el) return;

  const current = el.value;
  const options = uniqueSorted(values);

  el.innerHTML =
    `<option value="">${defaultLabel}</option>` +
    options.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");

  if (options.includes(current)) {
    el.value = current;
  }
}

function populateUserFilters(users) {
  const list = Array.isArray(users) ? users : [];

  fillSelectOptions("filterCountry", list.map(u => u.profile?.country || ""), "All Countries");
  fillSelectOptions("filterState", list.map(u => u.profile?.states || ""), "All States");
  fillSelectOptions("filterCity", list.map(u => u.profile?.city || ""), "All Cities");
  fillSelectOptions("filterLokSabha", list.map(u => u.profile?.loksabha || u.profile?.loksabhaName || ""), "All Lok Sabha");
  fillSelectOptions("filterVidhanSabha", list.map(u => u.profile?.vidhansabha || ""), "All Vidhan Sabha");
  fillSelectOptions("filterWard", list.map(u => u.profile?.ward || ""), "All Wards");
  fillSelectOptions("filterDesignation", list.map(u => u.profile?.designation || ""), "All Designations");
}

function getActiveFilters() {
  return {
    country: normLower(document.getElementById("filterCountry")?.value),
    state: normLower(document.getElementById("filterState")?.value),
    city: normLower(document.getElementById("filterCity")?.value),
    loksabha: normLower(document.getElementById("filterLokSabha")?.value),
    vidhansabha: normLower(document.getElementById("filterVidhanSabha")?.value),
    ward: normLower(document.getElementById("filterWard")?.value),
    designation: normLower(document.getElementById("filterDesignation")?.value),
    status: normLower(document.getElementById("filterStatus")?.value),
    query: norm((document.getElementById("searchBox")?.value || "")).toLowerCase()
  };
}

function matchFilters(u, filters) {
  const profile = u?.profile || {};

  if (filters.country && normLower(profile.country) !== filters.country) return false;
  if (filters.state && normLower(profile.states) !== filters.state) return false;
  if (filters.city && normLower(profile.city) !== filters.city) return false;
  if (filters.loksabha && normLower(profile.loksabha || profile.loksabhaName) !== filters.loksabha) return false;
  if (filters.vidhansabha && normLower(profile.vidhansabha) !== filters.vidhansabha) return false;
  if (filters.ward && normLower(profile.ward) !== filters.ward) return false;
  if (filters.designation && normLower(profile.designation) !== filters.designation) return false;

  if (filters.status) {
    const status = u?.isBlocked ? "blocked" : "active";
    if (status !== filters.status) return false;
  }

  if (filters.query && !matchUser(u, filters.query)) return false;

  return true;
}

function applyUserFilters() {
  const filters = getActiveFilters();
  FILTERED_USERS = ALL_USERS.filter((u) => matchFilters(u, filters));
  updateStats(FILTERED_USERS);
  renderUsers(FILTERED_USERS);
}

function badge(isBlocked) {
  const txt = isBlocked ? "Blocked" : "Active";
  const cls = isBlocked ? "status-badge status-blocked" : "status-badge status-active";
  return `<span class="${cls}">${txt}</span>`;
}

function yesNoBadge(ok) {
  const txt = ok ? "Yes" : "No";
  const cls = ok ? "user-badge verify-yes" : "user-badge verify-no";
  return `<span class="${cls}">${txt}</span>`;
}

function fmtDate(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

async function fetchUsers() {
  const res = await fetch("/admin/getUsers", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { error: "Admin session expired. Please login again." };
  }

  const data = await res.json().catch(() => null);

  let users = [];
  if (Array.isArray(data)) users = data;
  else if (data && Array.isArray(data.users)) users = data.users;

  return { users, raw: data };
}

function matchUser(u, q) {
  q = String(q || "").trim().toLowerCase();
  if (!q) return true;

  const p = u.profile || {};

  const hay = [
    u.userid,
    u.name,
    u.email,
    u.mobile,
    u.isBlocked ? "blocked" : "active",
    u.profileCompleted ? "profile done" : "profile pending",
    p.country,
    p.states,
    p.city,
    p.loksabha,
    p.vidhansabha,
    p.ward,
    p.booth,
    p.primaryMemberNo,
    p.sakriyaSabhyaNo,
    p.designation,
    p.twitter,
    p.instagram,
    p.facebook,
    p.twitterVerified ? "twitter verified" : "",
    p.instagramVerified ? "instagram verified" : "",
    p.facebookVerified ? "facebook verified" : ""
  ]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase());

  return hay.some((x) => x.includes(q));
}

function renderUsers(users) {
  const wrap = document.getElementById("usersTableWrap");

  if (!Array.isArray(users) || users.length === 0) {
    wrap.innerHTML = `<div class="users-empty">No users found.</div>`;
    setStatus("0 users");
    updateStats([]);
    return;
  }

  setStatus(`${users.length} user(s) shown`);

  wrap.innerHTML = `
    <table style="width:100%; border-collapse:collapse; min-width:1700px;">
      <thead>
        <tr style="background:#fafafa;">
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">User ID</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Name</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Email</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Mobile</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Profile</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Profile Done</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Status</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Created</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Updated</th>
          <th style="text-align:left; padding:12px; border-bottom:1px solid #eee;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td style="padding:12px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(u.userid)}</td>

            <td style="padding:12px; border-bottom:1px solid #eee;">
              <input data-userid="${esc(u.userid)}" class="nameInput" value="${esc(u.name)}"
                style="width:180px; padding:8px; border-radius:8px; border:1px solid #ddd;" />
            </td>

            <td style="padding:12px; border-bottom:1px solid #eee;">
              <input data-userid="${esc(u.userid)}" class="emailInput" value="${esc(u.email || "")}"
                style="width:220px; padding:8px; border-radius:8px; border:1px solid #ddd;" />
            </td>

            <td style="padding:12px; border-bottom:1px solid #eee;">
              <input data-userid="${esc(u.userid)}" class="mobileInput" value="${esc(u.mobile || "")}"
                style="width:150px; padding:8px; border-radius:8px; border:1px solid #ddd;" />
            </td>

            <td style="padding:12px; border-bottom:1px solid #eee;">
              <div class="profile-mini">
                <div><b>Country:</b> ${esc(u.profile?.country || "-")}</div>
                <div><b>State:</b> ${esc(u.profile?.states || "-")}</div>
                <div><b>City:</b> ${esc(u.profile?.city || "-")}</div>
                <div><b>Lok Sabha:</b> ${esc(u.profile?.loksabha || "-")}</div>
                <div><b>Vidhan Sabha:</b> ${esc(u.profile?.vidhansabha || "-")}</div>
                <div><b>Ward:</b> ${esc(u.profile?.ward || "-")}</div>
                <div><b>Booth:</b> ${esc(u.profile?.booth || "-")}</div>
                <div><b>Primary Member No.:</b> ${esc(u.profile?.primaryMemberNo || "-")}</div>
                <div><b>Sakriya Sabhya No.:</b> ${esc(u.profile?.sakriyaSabhyaNo || "-")}</div>
                <div><b>Designation:</b> ${esc(u.profile?.designation || "-")}</div>
                <div><b>Twitter:</b> ${esc(u.profile?.twitter || "-")} ${u.profile?.twitterVerified ? "✅" : ""}</div>
                <div><b>Instagram:</b> ${esc(u.profile?.instagram || "-")} ${u.profile?.instagramVerified ? "✅" : ""}</div>
                <div><b>Facebook:</b> ${esc(u.profile?.facebook || "-")} ${u.profile?.facebookVerified ? "✅" : ""}</div>
              </div>
            </td>

            <td style="padding:12px; border-bottom:1px solid #eee;">${yesNoBadge(!!u.profileCompleted)}</td>
            <td style="padding:12px; border-bottom:1px solid #eee;">${badge(!!u.isBlocked)}</td>
            <td style="padding:12px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(fmtDate(u.createdAt))}</td>
            <td style="padding:12px; border-bottom:1px solid #eee; white-space:nowrap;">${esc(fmtDate(u.updatedAt))}</td>

            <td style="padding:12px; border-bottom:1px solid #eee; white-space:nowrap;">
              <button class="saveBtn" data-userid="${esc(u.userid)}" style="width:auto; padding:8px 12px;">Save</button>
              <button class="toggleBtn" data-userid="${esc(u.userid)}" style="width:auto; padding:8px 12px; margin-left:8px;">
                ${u.isBlocked ? "Unblock" : "Block"}
              </button>
              <button class="deleteBtn" data-userid="${esc(u.userid)}" style="width:auto; padding:8px 12px; margin-left:8px; background:#111;">
                Delete
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".saveBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userid = btn.getAttribute("data-userid");

      const nameInput = document.querySelector(`.nameInput[data-userid="${userid}"]`);
      const emailInput = document.querySelector(`.emailInput[data-userid="${userid}"]`);
      const mobileInput = document.querySelector(`.mobileInput[data-userid="${userid}"]`);

      const name = (nameInput?.value || "").trim();
      const email = String(emailInput?.value || "").trim().toLowerCase();
      const mobile = String(mobileInput?.value || "").replace(/\D/g, "");

      if (!name) {
        showToast("Name is required");
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast("Valid email is required");
        return;
      }

      if (!/^\d{10}$/.test(mobile)) {
        showToast("Valid 10 digit mobile required");
        return;
      }

      const res = await fetch(`/admin/updateUser/${encodeURIComponent(userid)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          mobile
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast(data.message || "User updated ✅");
        loadUsers();
      } else {
        showToast(data.message || "Update failed");
      }
    });
  });

  document.querySelectorAll(".toggleBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userid = btn.getAttribute("data-userid");

      const res = await fetch(`/admin/toggleBlock/${encodeURIComponent(userid)}`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast(data.message || "User status updated");
        loadUsers();
      } else {
        showToast(data.message || "Status update failed");
      }
    });
  });

  document.querySelectorAll(".deleteBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userid = btn.getAttribute("data-userid");
      const ok = confirm("Delete this user permanently?");
      if (!ok) return;

      const res = await fetch(`/admin/deleteUser/${encodeURIComponent(userid)}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast(data.message || "User deleted ❌");
        loadUsers();
      } else {
        showToast(data.message || "Delete failed");
      }
    });
  });
}

async function loadUsers() {
  try {
    setStatus("Loading users.");

    const { users, error } = await fetchUsers();
    if (error) {
      setStatus(error);
      document.getElementById("usersTableWrap").innerHTML =
        `<div class="users-empty">Go to <a href="/admin.html">Admin Login</a></div>`;
      updateStats([]);
      return;
    }

    ALL_USERS = Array.isArray(users) ? users : [];
    populateUserFilters(ALL_USERS);
    applyUserFilters();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load users.");
    document.getElementById("usersTableWrap").innerHTML =
      `<div class="users-empty">Failed to load users. Check server console.</div>`;
    updateStats([]);
  }
}

document.getElementById("searchBox")?.addEventListener("input", () => {
  applyUserFilters();
});

document.getElementById("clearSearchBtn")?.addEventListener("click", () => {
  const box = document.getElementById("searchBox");
  if (box) box.value = "";

  const filterIds = [
    "filterCountry",
    "filterState",
    "filterCity",
    "filterLokSabha",
    "filterVidhanSabha",
    "filterWard",
    "filterDesignation",
    "filterStatus"
  ];

  filterIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  applyUserFilters();
});

[
  "filterCountry",
  "filterState",
  "filterCity",
  "filterLokSabha",
  "filterVidhanSabha",
  "filterWard",
  "filterDesignation",
  "filterStatus"
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", applyUserFilters);
});

loadUsers();