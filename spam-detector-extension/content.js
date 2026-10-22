// content.js
let lastScannedSignature = "";
let debounceTimer = null;

function scanCurrentEmail() {
  // 1. Grab the main email body in Gmail
  const emailBodyElement = document.querySelector(".a3s.aiL");
  if (!emailBodyElement) return;

  const emailText = emailBodyElement.innerText.trim();
  if (!emailText) return;

  // 2. Grab the Subject and Sender Email from Gmail's header DOM
  const subjectElement = document.querySelector("h2.hP");
  const subjectText = subjectElement ? subjectElement.innerText.trim() : "";

  const senderElement = document.querySelector("span.gD");
  const senderEmail = senderElement ? (senderElement.getAttribute("email") || senderElement.innerText.trim()) : "";

  // Combine subject + body for better context, and create a unique signature
  const fullContent = `${subjectText}\n${emailText}`.trim();
  const currentSignature = `${senderEmail}::${fullContent}`;

  // Skip if we already scanned this exact email view
  if (currentSignature === lastScannedSignature && document.querySelector(".spam-alert-banner")) {
    return;
  }
  lastScannedSignature = currentSignature;

  // Remove any old banner before requesting a new prediction
  const existingBanner = document.querySelector(".spam-alert-banner");
  if (existingBanner) existingBanner.remove();

  // 3. Send content + sender to background.js -> FastAPI backend
  chrome.runtime.sendMessage(
    {
      action: "checkSpam",
      text: fullContent,
      sender: senderEmail
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Extension runtime error:", chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        displayAlert(emailBodyElement, response.data.category, response.data.probability);
      } else {
        console.error(
          "Spam detector backend error:",
          response ? response.error : "Unknown error or backend is down"
        );
      }
    }
  );
}

function displayAlert(container, category, probability) {
  // Remove any duplicate banner that might have rendered during async fetch
  const existingBanner = document.querySelector(".spam-alert-banner");
  if (existingBanner) existingBanner.remove();

  const banner = document.createElement("div");
  // Cap displayed percentage at 99% so probabilistic models never claim 100% certainty
  const pct = Math.min(99, Math.max(1, Math.round(probability * 100)));

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

  // Insert the banner right above the email body container
  container.parentNode.insertBefore(banner, container);
}

// Debounced MutationObserver so rapid Gmail DOM updates only trigger one scan
const observer = new MutationObserver((mutations) => {
  // Ignore mutations caused by inserting our own banner
  for (const mutation of mutations) {
    if (
      mutation.addedNodes.length > 0 &&
      mutation.addedNodes[0].classList &&
      mutation.addedNodes[0].classList.contains("spam-alert-banner")
    ) {
      return;
    }
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scanCurrentEmail, 400);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});