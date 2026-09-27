// content.js
let lastScannedText = "";

function scanCurrentEmail() {
  // --- THIS SELECTOR LOGIC IS UPDATED FOR BETTER RELIABILITY ---
  const emailBodyElement = document.querySelector(".a3s.aiL");
  if (!emailBodyElement) {
    // If the primary selector fails, do nothing for now. 
    // More complex fallback logic could be added here if needed.
    return;
  }

  const emailText = emailBodyElement.innerText.trim();

  if (!emailText || emailText === lastScannedText) return;
  lastScannedText = emailText;

  const existingBanner = document.querySelector(".spam-alert-banner");
  if (existingBanner) existingBanner.remove();

  chrome.runtime.sendMessage(
    { action: "checkSpam", text: emailText },
    (response) => {
      if (response && response.success) {
        displayAlert(emailBodyElement, response.data.category, response.data.probability);
      } else {
        console.error("Spam detector backend error:", response ? response.error : "Unknown error or backend is down");
      }
    }
  );
}

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

  // Insert the banner before the main email content container
  container.parentNode.insertBefore(banner, container);
}

// Using a MutationObserver is correct for detecting navigation within Gmail
const observer = new MutationObserver(() => {
  // A short delay can prevent the script from running before the email is fully rendered
  setTimeout(scanCurrentEmail, 500);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
