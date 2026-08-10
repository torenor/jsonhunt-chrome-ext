const DEFAULT_DOMAINS = ['api.example.com'];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'JSON_CAPTURED') {
    chrome.storage.local.get(['targetDomains'], (result) => {
      const domains = result.targetDomains || DEFAULT_DOMAINS;
      const url = new URL(request.url);
      const match = domains.some(domain => url.hostname.includes(domain));
      console.log('[JSON Saver][background] mottatt:', url.hostname, '| domener:', domains, '| match:', match);

      if (match) {
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

  return true;
});

function saveCapture(data) {
  chrome.storage.local.get(['captures'], (result) => {
    const captures = result.captures || [];
    captures.push(data);

    if (captures.length > 1000) {
      captures.shift();
    }

    chrome.storage.local.set({ captures });
  });
}

function downloadAsFile(captures) {
  const jsonStr = JSON.stringify(captures, null, 2);
  // URL.createObjectURL finnes ikke i MV3 service workers - bruk data: URL i stedet
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);

  chrome.downloads.download({
    url: dataUrl,
    filename: `json-capture-${Date.now()}.json`,
    saveAs: true
  });
}
