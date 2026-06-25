import json
import os

import requests


api_key = os.getenv("OPENROUTER_API_KEY")

if not api_key:
    raise RuntimeError("Set OPENROUTER_API_KEY before running this script.")

# First API call with reasoning
response = requests.post(
  url="https://openrouter.ai/api/v1/chat/completions",
  headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
  },
  data=json.dumps({
    "model": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "messages": [
      {
        "role": "user",
        "content": "How many r's are in the word 'strawberry'?"
      }
    ],
    "reasoning": {"enabled": True}
  }),
  timeout=30,
)

payload = response.json()
print("Status:", response.status_code)
print(json.dumps(payload, indent=2))

if payload.get("choices"):
  message = payload["choices"][0]["message"]
  print("\nAssistant:")
  print(message.get("content", ""))