chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkSpam") {
    fetch("https://email-classifier-extension-1.onrender.com/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: request.text })
    })
      .then(res => res.json())
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.toString() }));
    return true;
  }
});