flowchart TB
    subgraph PAGE_WORLD ["MAIN World - Siden sitt eget JS-milje"]
        Website[Nettsidens scripts]
        InjectJS[inject.js - Monkey-patcher fetch og XHR]
        Website -->|kaller fetch / XHR| InjectJS
    end

    subgraph ISOLATED_WORLD ["ISOLATED World - Extension Context"]
        ContentJS[content.js]
    end

    subgraph EXTENSION_BACKGROUND ["Service Worker / Extension Background"]
        BackgroundJS[background.js]
        ChromeStorage[(chrome.storage.local)]
        Downloads[chrome.downloads]
        
        BackgroundJS <--> ChromeStorage
        BackgroundJS --> Downloads
    end

    subgraph EXTENSION_POPUP ["Popup UI"]
        PopupJS[popup.js]
        PopupHTML[popup.html]
        PopupJS <--> PopupHTML
    end

    %% Eventer og Meldinger
    InjectJS -->|window.dispatchEvent CustomEvent| ContentJS
    ContentJS -->|chrome.runtime.sendMessage JSON_CAPTURED| BackgroundJS
    PopupJS <-->|chrome.runtime.sendMessage| BackgroundJS
