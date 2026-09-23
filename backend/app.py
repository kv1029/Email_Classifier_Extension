import re
import joblib
import nltk
from nltk.corpus import stopwords
from nltk.stem import PorterStemmer
from nltk.tokenize import word_tokenize
import torch
import torch.nn as nn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

nltk.download("punkt", quiet=True)
nltk.download("stopwords", quiet=True)

# 1. Define Model Architecture (Updated for 3 classes)
class RNN(nn.Module):
    def __init__(self, input_size, hidden_size=128, num_layers=1):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.rnn = nn.RNN(input_size, hidden_size, num_layers, batch_first=True)
        # CHANGED: 3 neurons for Ham, Phish, and Spam
        self.fc = nn.Linear(hidden_size, 3)

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        out, _ = self.rnn(x, h0)
        out = self.fc(out[:, -1, :])
        return out

# 2. Load Artifacts
tf = joblib.load("tfidf_vectorizer.pkl")
input_size = len(tf.get_feature_names_out())
model = RNN(input_size=input_size)
model.load_state_dict(torch.load("spam_rnn_model.pth", map_location=torch.device("cpu")))
model.eval()

ps = PorterStemmer()
stop_words = set(stopwords.words("english"))

# 3. Preprocessing Functions
def clean_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"<.*?>", "", text)
    text = re.sub(r"[^A-Za-z0-9\s]", "", text)
    tokens = word_tokenize(text)
    filtered = [ps.stem(w) for w in tokens if w not in stop_words]
    return " ".join(filtered)

# 4. FastAPI Setup
app = FastAPI()

# Allow requests from the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class EmailPayload(BaseModel):
    content: str

@app.post("/predict")
def predict_spam(payload: EmailPayload):
    cleaned = clean_text(payload.content)
    if not cleaned.strip():
        # CHANGED: Return 'category' instead of 'is_spam'
        return {"category": "Ham", "probability": 0.0}

    vec = tf.transform([cleaned]).toarray()
    tensor = torch.from_numpy(vec).float().unsqueeze(1)

    with torch.no_grad():
        output = model(tensor)
        
        # CHANGED: Apply Softmax to get probabilities for all 3 classes
        probabilities = torch.softmax(output, dim=1).squeeze()
        
        # Get the index (0, 1, or 2) with the highest score
        predicted_idx = int(torch.argmax(probabilities))
        
        # Extract the confidence score for the winning class
        confidence = float(probabilities[predicted_idx])

    # Map the numerical prediction back to text
    labels = {0: "Ham", 1: "Phish", 2: "Spam"}

    return {
        "category": labels[predicted_idx],
        "probability": round(confidence, 4)
    }