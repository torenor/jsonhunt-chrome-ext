document.addEventListener('DOMContentLoaded', () => {
  loadDomains();
  loadCaptures();
  setupListeners();

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
      () => {
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
      .slice(-50)
      .map((c, i) => `<div class="capture-item">${i + 1}. ${new URL(c.url).pathname} @ ${new Date(c.timestamp).toLocaleTimeString()}</div>`)
      .join('');

    count.textContent = `${captures.length} responses lagret`;
    count.style.display = 'block';
  });
}
