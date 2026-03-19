fetch("/api/data")
.then(res => res.json())
.then(data => {

    const postsBox = document.getElementById("postsBox");
    const mentionsBox = document.getElementById("mentionsBox");

    if (data.mentions.length > 0) {
        const title = document.createElement("h4");
        title.innerText = "Mention Accounts (Optional)";
        mentionsBox.appendChild(title);

        data.mentions.forEach(user => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = user;

            label.appendChild(checkbox);
            label.append(" @" + user);
            mentionsBox.appendChild(label);
            mentionsBox.appendChild(document.createElement("br"));
        });
    }

    data.posts.forEach(post => {

        const card = document.createElement("div");
        card.className = "card";

        const text = document.createElement("p");
        text.innerText = post.text;

        const media = document.createElement("small");
        media.innerText = "Media: " + post.mediaUrl;

        const btn = document.createElement("button");
        btn.innerText = "Tweet";

        btn.onclick = function() {

            let finalText = post.text;

            const personalTag = document.getElementById("personalTag").value;
            if (personalTag.trim() !== "") {
                finalText += " " + personalTag;
            }

            document.querySelectorAll("input[type=checkbox]:checked")
            .forEach(box => {
                finalText += " @" + box.value;
            });

            const twitterURL =
                "https://twitter.com/intent/tweet?text=" +
                encodeURIComponent(finalText) +
                "&url=" +
                encodeURIComponent(post.mediaUrl);

            window.open(twitterURL, "_blank");
        };

        card.appendChild(text);
        card.appendChild(media);
        card.appendChild(btn);
        postsBox.appendChild(card);
    });

});