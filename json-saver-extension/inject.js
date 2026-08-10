// Kjører i siden sitt eget JS-miljø (MAIN world), slik at det faktisk
// overstyrer fetch/XHR som siden selv bruker. Isolated-world content scripts
// kan ikke gjøre dette - de patcher bare sin egen, usynlige kopi av window.

const EVENT_NAME = '__json_saver_captured__';

// Fang fetch requests
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const clone = response.clone();

  try {
    const json = await clone.json();
    console.log('[JSON Saver][inject] fetch JSON fanget:', response.url);
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
        console.log('[JSON Saver][inject] XHR JSON fanget:', xhr._url);
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
