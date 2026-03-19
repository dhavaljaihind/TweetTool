const TWITTER_LIMIT = 280;

function safeText(value) {
    return String(value ?? "");
}

function safeMediaPath(value) {
    const s = String(value || "").trim();
    if (!s) return "";

    // Only allow local uploads/posts paths
    if (!s.startsWith("/uploads/posts/")) return "";

    // Block suspicious characters that can break attributes or URLs
    if (/[<>"'`\\]/.test(s)) return "";

    return s;
}

function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}
function openTweetComposer(text) {
    const encodedText = encodeURIComponent(text || "");

    const appUrl = `twitter://post?message=${encodedText}`;
    const webUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

    if (!isMobile) {
        window.open(webUrl, "_blank", "noopener,noreferrer");
        return;
    }

    const start = Date.now();

    window.location.href = appUrl;

    setTimeout(() => {
        const elapsed = Date.now() - start;
        if (elapsed < 1700) {
            window.location.href = webUrl;
        }
    }, 1200);
}

async function loadData() {
    const trendRes = await fetch("/trendSettings", { credentials: "include" });
    const trendData = await trendRes.json().catch(() => ({}));

    const tweets = await (await fetch("/getTweets", { credentials: "include" })).json();
    const mentions = await (await fetch("/getMentions", { credentials: "include" })).json();

    const container = document.getElementById("tweetsContainer");
    const trendTitleWrap = document.getElementById("trendTitleWrap");
    const trendTitleText = document.getElementById("trendTitleText");
    const trendMessageWrap = document.getElementById("trendMessageWrap");
    const trendMessageText = document.getElementById("trendMessageText");

    clearElement(container);
    if (trendTitleWrap) trendTitleWrap.style.display = "none";
    if (trendMessageWrap) trendMessageWrap.style.display = "none";
    if (trendTitleText) trendTitleText.innerText = "";
    if (trendMessageText) trendMessageText.innerText = "";

    const trendEnabled = !!trendData?.settings?.enabled;
    const trendTitle = String(trendData?.settings?.title || "").trim();
    const trendMessage = String(trendData?.settings?.message || "").trim();

    if (!trendEnabled) {
        if (trendMessageWrap) trendMessageWrap.style.display = "block";
        if (trendMessageText) {
            trendMessageText.innerText =
                trendMessage || "Currently no trends available. We will inform you when trend is available.";
        }
        return;
    }

    if (trendTitle) {
        if (trendTitleWrap) trendTitleWrap.style.display = "block";
        if (trendTitleText) trendTitleText.innerText = trendTitle;
    }

    if (!Array.isArray(tweets) || tweets.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-msg";
        p.innerText = "No posts available.";
        container.appendChild(p);
        return;
    }

    tweets.forEach(tweet => {
        const card = document.createElement("div");
        card.className = "tweet-card";

        const tweetContent = document.createElement("div");
        tweetContent.className = "tweet-content";

        const preview = document.createElement("div");
        preview.className = "tweet-preview";

        const mediaPreviewBox = document.createElement("div");
        mediaPreviewBox.className = "media-preview-box";

        const mediaPath = safeMediaPath(tweet.media);
        if (mediaPath) {
            if (mediaPath.toLowerCase().endsWith(".mp4")) {
                const video = document.createElement("video");
                video.src = mediaPath;
                video.className = "tweet-media";
                video.controls = true;
                video.preload = "metadata";
                mediaPreviewBox.appendChild(video);
            } else {
                const img = document.createElement("img");
                img.src = mediaPath;
                img.className = "tweet-media";
                img.alt = "Tweet media";
                img.loading = "lazy";
                mediaPreviewBox.appendChild(img);
            }
        }

        if (mediaPath) {
            const downloadLink = document.createElement("a");
            downloadLink.href = mediaPath;
            downloadLink.className = "download-btn";
            downloadLink.download = "";
            downloadLink.target = "_blank";
            downloadLink.rel = "noopener noreferrer";
            downloadLink.innerText = "Download Media";
            tweetContent.appendChild(downloadLink);
        }

        const counterWrapper = document.createElement("div");
        counterWrapper.className = "char-counter";

        const counter = document.createElement("span");
        counter.className = "count";
        counter.innerText = "0";

        const counterText = document.createTextNode(` / ${TWITTER_LIMIT}`);
        counterWrapper.appendChild(counter);
        counterWrapper.appendChild(counterText);

        const warning = document.createElement("div");
        warning.className = "limit-warning";

        tweetContent.appendChild(preview);
        tweetContent.appendChild(mediaPreviewBox);
        tweetContent.appendChild(counterWrapper);
        tweetContent.appendChild(warning);

        const mentionsSection = document.createElement("div");
        mentionsSection.className = "mentions-section";

        const h4 = document.createElement("h4");
        h4.innerText = "Select Mentions";
        mentionsSection.appendChild(h4);

        if (Array.isArray(mentions)) {
            mentions.forEach((m) => {
                const safeMention = safeText(m);

                const label = document.createElement("label");
                label.className = "mention-option";

                const input = document.createElement("input");
                input.type = "checkbox";
                input.value = safeMention;

                const span = document.createElement("span");
                span.innerText = safeMention;

                label.appendChild(input);
                label.appendChild(span);
                mentionsSection.appendChild(label);
            });
        }

        const btn = document.createElement("button");
        btn.className = "tweet-btn";
        btn.type = "button";
        btn.innerText = "Tweet Now 🚀";

        card.appendChild(tweetContent);
        card.appendChild(mentionsSection);
        card.appendChild(btn);

        container.appendChild(card);

        // Elements already created safely above

        let isPosted = false;

        function updateContent() {
            const selected = Array.from(
                card.querySelectorAll("input[type=checkbox]:checked")
            ).map(c => safeText(c.value)).join(" ");

            const personal = document.getElementById("personalTag").value.trim();

            const finalText =
                safeText(tweet.content) +
                (selected ? " " + selected : "") +
                (personal ? " " + personal : "");

            preview.innerText = finalText;

            const length = finalText.length;
            counter.innerText = length;

            if (length > TWITTER_LIMIT) {
                counterWrapper.classList.add("limit-exceed");
                warning.innerText = "⚠ More than 280 characters needs a verified badge on Twitter/X, but verified users can still post it.";
            } else {
                counterWrapper.classList.remove("limit-exceed");
                warning.innerText = "";
            }
        }

        btn.addEventListener("click", async () => {
            const finalText = preview.innerText;

            if (isPosted) {
                showToast("This tweet is already posted.", 2500);
                return;
            }

            if (finalText.length > TWITTER_LIMIT) {
                showToast("More than 280 characters needs a verified badge on Twitter/X. Verified users can still post it.", 3500);
            }

            try {
                await fetch("/api/trackTweet", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        tweetId: tweet.id,
                        textLen: finalText.length
                    })
                });
            } catch (e) {
                console.log("Analytics failed");
            }

            openTweetComposer(finalText);

            isPosted = true;
            btn.classList.add("tweeted");
            btn.innerText = "✅ Tweeted";
            btn.disabled = true;

            container.appendChild(card);
            card.scrollIntoView({ behavior: "smooth", block: "end" });
        });

        card.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.addEventListener("change", updateContent);
        });

        // personalTag listener is attached once after cards are rendered

        updateContent();
    });
        const personalTagEl = document.getElementById("personalTag");
    if (personalTagEl && !personalTagEl.dataset.boundTweetUpdater) {
        personalTagEl.addEventListener("input", () => {
            document.querySelectorAll("#tweetsContainer .tweet-card").forEach((card) => {
                const event = new Event("change");
                card.querySelectorAll("input[type=checkbox]").forEach((cb) => cb.dispatchEvent(event));
            });
        });
        personalTagEl.dataset.boundTweetUpdater = "1";
    }
}

loadData();