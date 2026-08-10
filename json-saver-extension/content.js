// Kjører i isolated world - eneste sted chrome.runtime er tilgjengelig.
// Lytter på events fra inject.js (som kjører i MAIN world og faktisk
// fanger fetch/XHR) og sender dem videre til background.js.

console.log('[JSON Saver][content] content.js lastet i isolated world');

window.addEventListener('__json_saver_captured__', (event) => {
  console.log('[JSON Saver][content] mottok capture, sender til background:', event.detail.url);
  chrome.runtime.sendMessage({
    type: 'JSON_CAPTURED',
    data: event.detail.data,
    url: event.detail.url,
    timestamp: event.detail.timestamp
  }).catch(() => {}); // Ignore hvis extension context er invalidert
});
