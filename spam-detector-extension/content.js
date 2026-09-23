let lastScannedText = "";

function scanCurrentEmail() {
  const emailBodyElement = document.querySelector(".a3s.aiL");
  if (!emailBodyElement) return;

  const emailText = emailBodyElement.innerText.trim();

  if (!emailText || emailText === lastScannedText) return;
  lastScannedText = emailText;

  const existingBanner = document.querySelector(".spam-alert-banner");
  if (existingBanner) existingBanner.remove();

  fetch("https://email-classifier-extension-1.onrender.com/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: emailText })
  })
    .then((res) => res.json())
    .then((data) => {
      // FIX: data.is_spam ki jagah data.category kar diya gaya hai
      displayAlert(emailBodyElement, data.category, data.probability);
    })
    .catch((err) => {
      console.error("Spam detector backend error:", err);
    });
}

// FIX: Purana wala displayAlert delete kar diya gaya hai. Sirf naya wala rakha hai.
function displayAlert(container, category, probability) {
  const banner = document.createElement("div");
  const pct = Math.round(probability * 100);
  
  if (category === "Ham") {
      banner.className = "spam-alert-banner spam-alert-safe";
      banner.innerText = `✅ Safe: Verified non-spam message (${pct}% confidence)`;
  } else if (category === "Phish") {
      banner.className = "spam-alert-banner spam-alert-danger";
      banner.innerText = `🚨 PHISHING WARNING: Do not click links! (${pct}% confidence)`;
  } else {
      banner.className = "spam-alert-banner spam-alert-warning"; 
      banner.innerText = `⚠️ Spam: Promotional or junk mail (${pct}% confidence)`;
  }

  container.parentNode.insertBefore(banner, container);
}

const observer = new MutationObserver(() => {
  scanCurrentEmail();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
