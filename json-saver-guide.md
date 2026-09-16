# JSON Saver Chrome Extension

En enkel og fokusert Chrome extension for å lagre JSON-respons fra spesifikke domener direkte til fil.

## Oversikt

Denne extension:
- Fanger alle JSON-responses fra fetch og XMLHttpRequest
- Filtrerer kun responses fra domener du velger
- Lagrer captures i Chrome storage
- Tillater deg å laste ned alt som en JSON-fil
- Behandler dataene videre med ditt eget verktøy

---

## Installasjons-guide

### Steg 1: Opprett mappen og filene

1. Opprett en ny mappe, f.eks. `json-saver-extension`
2. Opprett disse 6 filene inne i mappen:
   - `manifest.json`
   - `inject.js`
   - `content.js`
   - `background.js`
   - `popup.html`
   - `popup.js`

### Steg 2: Kopier koden

Se kodefilene under og kopier hver fil.

### Steg 3: Installer i Chrome

1. Åpne Chrome og gå til: `chrome://extensions/`
2. Slå på **"Developer mode"** (toggle øverst til høyre)
3. Klikk **"Load unpacked"**
4. Velg mappen `json-saver-extension`
5. Extension skal nå vises i listen og i Chrome-verktøylinjen

### Steg 4: Bruk

1. Klikk extension-ikonet i Chrome-verktøylinjen
2. Skriv inn domener du vil lagre fra (f.eks. `api.example.com, api.other.com`)
3. Klikk "Lagre domener"
4. Naviger til nettsider som bruker disse API-ene
5. Extension vil automatisk fange alle JSON-responses
6. Klikk "Last ned JSON" for å få en fil med alle captures

---

## Filkoder

### 1. manifest.json

```json
{
  "manifest_version": 3,
  "name": "JSON Saver",
  "version": "1.0",
  "description": "Lagrer JSON-respons fra valgte domener",
  "permissions": [
    "storage",
    "downloads",
    "webRequest"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "JSON Saver"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["inject.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}
```

> **Viktig:** `content_scripts` kjører normalt i et *isolated world* - et eget
> JS-miljø som deler DOM med siden, men IKKE delelig JS-tilstand som
> `window.fetch`. Overstyrer man `window.fetch` der, treffer det bare
> extension sin egen usynlige kopi - siden sitt eget script fortsetter å
> bruke den ekte `fetch`, og ingenting blir fanget. Derfor må selve
> overstyringen skje i `"world": "MAIN"` (siden sitt eget JS-miljø), mens
> `chrome.runtime`-kallene (som kun finnes i isolated world) skjer i en egen
> fil som lytter på en `CustomEvent` fra MAIN world-scriptet.

### 2. inject.js

Denne filen kjører i **siden sitt eget JS-miljø** (`world: "MAIN"`) og fanger
alle fetch- og XMLHttpRequest-kall siden selv gjør. Den sender resultatet
videre som en `CustomEvent` fordi `chrome.runtime` ikke finnes i MAIN world.

```javascript
const EVENT_NAME = '__json_saver_captured__';

// Fang fetch requests
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const clone = response.clone();

  try {
    const json = await clone.json();
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: {
        data: json,
        url: response.url,
        timestamp: new Date().toISOString()
      }
    }));
  } catch (e) {
    // Ikke JSON, ignorer
  }

  return response;
};

// Fang XMLHttpRequest
const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url) {
  this._url = url;
  return originalXHROpen.apply(this, arguments);
};

XMLHttpRequest.prototype.send = function() {
  const xhr = this;
  const originalOnReadyStateChange = this.onreadystatechange;

  this.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      try {
        const json = JSON.parse(xhr.responseText);
        window.dispatchEvent(new CustomEvent(EVENT_NAME, {
          detail: {
            data: json,
            url: xhr._url,
            timestamp: new Date().toISOString()
          }
        }));
      } catch (e) {
        // Ikke JSON
      }
    }
    return originalOnReadyStateChange?.apply(this, arguments);
  };

  return originalXHRSend.apply(this, arguments);
};
```

### 3. content.js

Denne filen kjører i isolated world - eneste sted `chrome.runtime` er
tilgjengelig. Den lytter på `CustomEvent`-et fra `inject.js` og sender det
videre til `background.js`.

```javascript
window.addEventListener('__json_saver_captured__', (event) => {
  chrome.runtime.sendMessage({
    type: 'JSON_CAPTURED',
    data: event.detail.data,
    url: event.detail.url,
    timestamp: event.detail.timestamp
  }).catch(() => {}); // Ignore hvis extension context er invalidert
});
```

### 4. background.js

Service worker som lagrer captures og filtrerer på domener.

```javascript
const DEFAULT_DOMAINS = ['api.example.com'];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'JSON_CAPTURED') {
    chrome.storage.local.get(['targetDomains'], (result) => {
      const domains = result.targetDomains || DEFAULT_DOMAINS;
      const url = new URL(request.url);
      
      // Sjekk om domenet skal lagres
      if (domains.some(domain => url.hostname.includes(domain))) {
        saveCapture(request);
      }
    });
  }
  
  if (request.type === 'GET_CAPTURES') {
    chrome.storage.local.get(['captures'], (result) => {
      sendResponse(result.captures || []);
    });
  }
  
  if (request.type === 'DOWNLOAD_ALL') {
    chrome.storage.local.get(['captures'], (result) => {
      const captures = result.captures || [];
      downloadAsFile(captures);
    });
  }
  
  if (request.type === 'CLEAR_CAPTURES') {
    chrome.storage.local.set({ captures: [] });
    sendResponse({ success: true });
  }
  
  if (request.type === 'SET_DOMAINS') {
    chrome.storage.local.set({ targetDomains: request.domains });
    sendResponse({ success: true });
  }
});

function saveCapture(data) {
  chrome.storage.local.get(['captures'], (result) => {
    const captures = result.captures || [];
    captures.push(data);
    
    // Behold bare siste 1000 captures
    if (captures.length > 1000) {
      captures.shift();
    }
    
    chrome.storage.local.set({ captures });
  });
}

function downloadAsFile(captures) {
  const jsonStr = JSON.stringify(captures, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: `json-capture-${Date.now()}.json`,
    saveAs: true
  });
}
```

### 5. popup.html

UI for extension-popup-et.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      width: 400px;
      padding: 15px;
      margin: 0;
      background: #f5f5f5;
    }
    h2 { margin-top: 0; font-size: 18px; }
    .section { background: white; padding: 12px; margin-bottom: 10px; border-radius: 4px; }
    label { display: block; margin-bottom: 8px; font-weight: 500; }
    textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      resize: vertical;
      height: 60px;
    }
    .button-group {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    button {
      flex: 1;
      padding: 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    .btn-primary { background: #007bff; color: white; }
    .btn-primary:hover { background: #0056b3; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #545b62; }
    .btn-danger { background: #dc3545; color: white; }
    .btn-danger:hover { background: #bb2d3b; }
    .status {
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
      margin-top: 10px;
    }
    .status.success { background: #d4edda; color: #155724; }
    .status.info { background: #d1ecf1; color: #0c5460; }
    #capturelist {
      max-height: 150px;
      overflow-y: auto;
      background: #f9f9f9;
      padding: 8px;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
    }
    .capture-item {
      padding: 4px;
      border-bottom: 1px solid #eee;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <h2>JSON Saver</h2>
  
  <div class="section">
    <label>Domener å lagre (komma-separert):</label>
    <textarea id="domains" placeholder="api.example.com, api.another.com"></textarea>
    <button class="btn-primary" id="saveDomains" style="width: 100%; margin-top: 8px;">Lagre domener</button>
    <div id="statusDomains" class="status" style="display: none;"></div>
  </div>
  
  <div class="section">
    <label>Lagrede responses:</label>
    <div id="capturelist">Laster...</div>
    <div class="status info" id="captureCount" style="display: none; margin-top: 8px;"></div>
  </div>
  
  <div class="section">
    <div class="button-group">
      <button class="btn-primary" id="downloadBtn">📥 Last ned JSON</button>
      <button class="btn-danger" id="clearBtn">🗑️ Tøm</button>
    </div>
  </div>
  
  <script src="popup.js"></script>
</body>
</html>
```

### 6. popup.js

JavaScript for UI-interaksjon.

```javascript
document.addEventListener('DOMContentLoaded', () => {
  loadDomains();
  loadCaptures();
  setupListeners();
  
  // Refresh hvert 2. sekund
  setInterval(loadCaptures, 2000);
});

function loadDomains() {
  chrome.storage.local.get(['targetDomains'], (result) => {
    const domains = result.targetDomains || [];
    document.getElementById('domains').value = domains.join(', ');
  });
}

function setupListeners() {
  document.getElementById('saveDomains').addEventListener('click', () => {
    const domainsText = document.getElementById('domains').value;
    const domains = domainsText
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);
    
    chrome.runtime.sendMessage(
      { type: 'SET_DOMAINS', domains },
      (response) => {
        const status = document.getElementById('statusDomains');
        status.textContent = `✓ Lagret ${domains.length} domene(r)`;
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 3000);
      }
    );
  });
  
  document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DOWNLOAD_ALL' });
  });
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Slett alle lagrede responses?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURES' }, () => {
        loadCaptures();
      });
    }
  });
}

function loadCaptures() {
  chrome.runtime.sendMessage({ type: 'GET_CAPTURES' }, (captures) => {
    const list = document.getElementById('capturelist');
    const count = document.getElementById('captureCount');
    
    if (!captures || captures.length === 0) {
      list.textContent = '(ingen)';
      count.style.display = 'none';
      return;
    }
    
    list.innerHTML = captures
      .slice(-50) // Vis siste 50
      .map((c, i) => `<div class="capture-item">${i + 1}. ${new URL(c.url).pathname} @ ${new Date(c.timestamp).toLocaleTimeString()}</div>`)
      .join('');
    
    count.textContent = `${captures.length} responses lagret`;
    count.style.display = 'block';
  });
}
```

---

## Filstruktur

```
json-saver-extension/
├── manifest.json
├── inject.js
├── content.js
├── background.js
├── popup.html
└── popup.js
```

---

## Brukseksempel

1. Du besøker en nettside som bruker `api.example.com`
2. Når nettsiden gjør fetch til `api.example.com/data`, fanger extension responsen
3. Hvis `api.example.com` er lagt til i domene-listen, lagres responsen
4. Du klikker "Last ned JSON" og får en fil som ser slik ut:

```json
[
  {
    "type": "JSON_CAPTURED",
    "data": {
      "id": 1,
      "name": "Example"
    },
    "url": "https://api.example.com/data",
    "timestamp": "2024-01-15T10:30:45.123Z"
  },
  {
    "type": "JSON_CAPTURED",
    "data": {
      "id": 2,
      "name": "Another"
    },
    "url": "https://api.example.com/data",
    "timestamp": "2024-01-15T10:30:46.456Z"
  }
]
```

---

## Viktig å vite

- **Lagringsbegrensning**: Extension lagrer maksimalt 1000 responses (eldste slettes når grensen nås)
- **Domenesøk**: Du kan bruke del av domenenavn (f.eks. `example.com` matcher både `api.example.com` og `data.example.com`)
- **Timing**: Capture skjer automatisk - ikke nødvendig å trykke noe
- **Data**: Alt lagres lokalt i Chrome - ingen data sendes til servere

---

## Feilsøking

**Extension vises ikke i verktøylinjen:**
- Gå til `chrome://extensions/`
- Slå på "Developer mode"
- Sjekk at alle filene eksisterer i mappen

**Ingen responses blir fanget:**
- Sjekk at domenet er riktig stavd i popup-et
- Klikk "Lagre domener" etter endring
- Refresher nettsiden (viktig: `inject.js` kjører kun i `document_start` for
  nye sidelastinger, ikke for allerede-åpne faner)
- Sjekk at `chrome://extensions/` viser extension uten feilmeldinger, og at
  `manifest.json` faktisk inneholder `"world": "MAIN"` for `inject.js` -
  uten dette overstyres fetch/XHR bare i extension sitt isolerte miljø og
  siden sitt eget script blir aldri fanget opp
- Se i popup at responses dukker opp

**Popup-et blir tom:**
- Sjekk at popup.js er lastet (åpne DevTools for extension)
- Refresher popup-et

---

## Tips for videre behandling

Når du laster ned JSON-filen, kan du behandle den med Python, Node.js, eller ditt eget verktøy:

**Python eksempel:**
```python
import json

with open('json-capture-*.json', 'r') as f:
    captures = json.load(f)

for capture in captures:
    data = capture['data']
    url = capture['url']
    timestamp = capture['timestamp']
    # Behandle data som du trenger
    print(f"{timestamp}: {url}")
    print(json.dumps(data, indent=2))
```

---

## Lisensinformasjon

Fritt å modifisere og bruke!
