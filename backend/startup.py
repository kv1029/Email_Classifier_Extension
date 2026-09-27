# startup.py
import nltk
import ssl

# This block handles potential SSL certificate issues when downloading
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

print("Downloading NLTK 'punkt' and 'stopwords' packages...")
nltk.download('punkt')
nltk.download('stopwords')
print("NLTK packages downloaded successfully.")

