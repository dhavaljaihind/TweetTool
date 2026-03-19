let analyticsData = [];

function clearElement(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

async function loadAnalytics() {

    const res = await fetch("/admin/getAnalytics", { credentials: "include" });
    const data = await res.json();

    if (!data.success) return;

    analyticsData = data.recent;

    document.getElementById("totalClicks").innerText = data.summary.total;

    renderUsers(data.summary.byUser);
    renderTweets(data.summary.byTweet);
    renderRecent(analyticsData);
}

function renderUsers(users){
    const box = document.getElementById("topUsers");
    clearElement(box);

    (users || []).forEach((u) => {
        const row = document.createElement("div");
        row.className = "leader-row";

        const span = document.createElement("span");
        span.innerText = `${u.name || ""} (${u.mobile || ""})`;

        const b = document.createElement("b");
        b.innerText = String(u.count ?? 0);

        row.appendChild(span);
        row.appendChild(b);
        box.appendChild(row);
    });
}

function renderTweets(tweets){
    const box = document.getElementById("topTweets");
    clearElement(box);

    (tweets || []).forEach((t) => {
        const row = document.createElement("div");
        row.className = "leader-row";

        const span = document.createElement("span");
        span.innerText = t.preview || "";

        const b = document.createElement("b");
        b.innerText = String(t.count ?? 0);

        row.appendChild(span);
        row.appendChild(b);
        box.appendChild(row);
    });
}

function renderRecent(list){
    const box = document.getElementById("recentActivity");
    clearElement(box);

    (list || []).forEach((a) => {
        const card = document.createElement("div");
        card.className = "tweet-manage-card glass-card";

        const name = document.createElement("b");
        name.innerText = a.name || "";

        const info1 = document.createElement("div");
        info1.innerText = `(${a.mobile || ""})`;

        const info2 = document.createElement("div");
        info2.innerText = `Tweet: ${a.tweetPreview || ""}`;

        const info3 = document.createElement("div");
        info3.innerText = `Time: ${a.at ? new Date(a.at).toLocaleString() : ""}`;

        card.appendChild(name);
        card.appendChild(info1);
        card.appendChild(info2);
        card.appendChild(info3);
        box.appendChild(card);
    });
}

/* SEARCH USER */

document.getElementById("searchUser").addEventListener("input", function(){

    const q = this.value.toLowerCase();

    const filtered = analyticsData.filter(a =>
        (a.name || "").toLowerCase().includes(q) ||
        (a.mobile || "").includes(q) ||
        (a.userId || "").toLowerCase().includes(q)
    );

    renderRecent(filtered);

});

loadAnalytics();