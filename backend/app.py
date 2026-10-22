# app.py
import re
import joblib
import nltk
from nltk.corpus import stopwords
from nltk.stem import PorterStemmer
from nltk.tokenize import word_tokenize
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# 1. Define Updated Model Architecture (Must match training notebook)
class EmailClassifierNet(nn.Module):
    def __init__(self, input_size, hidden_size=128, num_classes=3):
        super().__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.bn1 = nn.BatchNorm1d(hidden_size)
        self.dropout = nn.Dropout(0.4)
        self.fc2 = nn.Linear(hidden_size, num_classes)

    def forward(self, x):
        # Expects 2D input: [batch_size, input_size]
        x = F.relu(self.bn1(self.fc1(x)))
        x = self.dropout(x)
        return self.fc2(x)

# 2. Load Artifacts
tf = joblib.load("tfidf_vectorizer.pkl")
input_size = len(tf.get_feature_names_out())

model = EmailClassifierNet(input_size=input_size, hidden_size=128, num_classes=3)
model.load_state_dict(torch.load("spam_rnn_model.pth", map_location=torch.device("cpu")))
model.eval()

# Ensure NLTK data is available
try:
    stop_words = set(stopwords.words("english"))
except LookupError:
    nltk.download("stopwords")
    stop_words = set(stopwords.words("english"))

try:
    word_tokenize("test")
except LookupError:
    nltk.download("punkt")
    nltk.download("punkt_tab")

ps = PorterStemmer()

# 3. Preprocessing Function (Exact match with training notebook)
def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"<.*?>", " ", text)
    text = re.sub(r"http\S+|www\.\S+", " ", text)
    text = re.sub(r"escapenumber\w*|escpenumb\w*", " ", text)
    text = re.sub(r"[^a-z\s]", " ", text)
    
    tokens = word_tokenize(text)
    filtered = [
        ps.stem(w) for w in tokens 
        if w not in stop_words and len(w) > 2
    ]
    return " ".join(filtered)

# Trusted sender domains to prevent false-positive phishing alerts on automated notices
TRUSTED_DOMAINS = {
    "replit.com",
    "unstop.news",
    "unstop.com",
    "internshala.com",
    "mail.internshala.com",
    "github.com",
    "google.com",
    "linkedin.com",
}

# 4. FastAPI Setup
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

class EmailPayload(BaseModel):
    content: str
    sender: Optional[str] = None  # Optional: pass sender email from content.js if available

@app.post("/predict")
def predict_spam(payload: EmailPayload):
    cleaned = clean_text(payload.content)
    if not cleaned.strip():
        return {"category": "Ham", "probability": 0.0}

    # Shape is already (1, 5000) -> 2D tensor
    vec = tf.transform([cleaned]).toarray()
    tensor = torch.from_numpy(vec).float()

    # Temperature > 1.0 softens extreme 100% confidence spikes
    temperature = 1.5

    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits / temperature, dim=1).squeeze()
        predicted_idx = int(torch.argmax(probabilities))
        confidence = float(probabilities[predicted_idx])

    labels = {0: "Ham", 1: "Phish", 2: "Spam"}
    category = labels[predicted_idx]

    # Optional Domain Check: If sender or text clearly belongs to a verified domain, 
    # downgrade false-positive "Phish" alerts to "Ham" or "Spam"
    if payload.sender:
        domain = payload.sender.split("@")[-1].strip(">").lower()
        if domain in TRUSTED_DOMAINS and category == "Phish":
            category = "Ham"

    return {
        "category": category,
        "probability": round(confidence, 4)
    }