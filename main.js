const port = chrome.runtime.connect()
document.addEventListener("DOMContentLoaded", () => {
    // Load the saved credential string and display it on startup
    chrome.storage.local.get(['api_credentials'], (result) => {
        if (result.api_credentials) {
            document.getElementById('api_creds_input').value = result.api_credentials;
        }
    });

    // Add a click listener for the "Save Credentials" button
    document.getElementById("save_creds_btn").addEventListener("click", () => {
        const creds = document.getElementById("api_creds_input").value;

        // Check that the user has pasted something that looks correct
        if (creds && creds.includes('&api_key=') && creds.includes('&user_id=')) {
            chrome.storage.local.set({ api_credentials: creds }, () => {
                const btn = document.getElementById("save_creds_btn");
                btn.textContent = "Saved!";
                setTimeout(() => { btn.textContent = "Save Credentials"; }, 2000);
            });
        } else {
            const btn = document.getElementById("save_creds_btn");
            btn.textContent = "Invalid Format! Paste the full string.";
            setTimeout(() => { btn.textContent = "Save Credentials"; }, 3000);
        }
    });
});
const infobox = document.getElementById("infobox")
const cpgl = document.getElementById("cpgl")
const dgpi = document.getElementById("dgpi")
const closetabs = document.getElementById("closetabs")
const autoclosetabs = document.getElementById("autoclosetabs")
const nnnblock = document.getElementById("nnnblock")

chrome.storage.local.get(null, options => {
    autoclosetabs.checked = options.autoclosetabs
    nnnblock.checked = !options.nnnblock
})

port.onMessage.addListener(message => {
    if(message.type === "action"){
        if(message.action === "setInfobox"){
            infobox.style.color = message.data.textColor
            infobox.innerText = message.data.content

            window.scrollTo(0, document.body.scrollHeight)
        } else if(message.action === "clipboardWriteText"){
            navigator.clipboard.writeText(message.data.content)
        }
    }
})

function tabOperation(type, data){
    port.postMessage({ type, data })
}

cpgl.addEventListener("click", (ev) => tabOperation("cpgl"))
dgpi.addEventListener("click", (ev) => tabOperation("dgpi"))
closetabs.addEventListener("click", (ev) => tabOperation("closetabs"))
autoclosetabs.addEventListener("change", (ev) => tabOperation("autoclosetabs_swchange", autoclosetabs.checked))
nnnblock.addEventListener("change", (ev) => tabOperation("nnnblock_swchange", nnnblock.checked))

// Download progress is kept in storage by the worker, so it survives the popup closing.
const progressbox = document.getElementById("progressbox")
const progresstext = document.getElementById("progresstext")
const progressbar = document.getElementById("progressbar")
const progresscurrent = document.getElementById("progresscurrent")
const progressfailed = document.getElementById("progressfailed")
const canceldl = document.getElementById("canceldl")

function renderProgress(job){
    if(!job){
        progressbox.style.display = "none"
        return
    }

    const running = job.status === "running"
    progressbox.style.display = ""
    progresstext.innerText = running
        ? `Downloading ${Math.min(job.done + 1, job.total)}/${job.total}`
        : `${job.status === "cancelled" ? "Cancelled" : "Finished"}: ${job.done}/${job.total} processed`
    progressbar.max = job.total
    progressbar.value = job.done
    progresscurrent.innerText = running ? job.current : ""
    canceldl.style.display = running ? "" : "none"
    dgpi.disabled = running
    progressfailed.innerText = job.failed.length ? `${job.failed.length} failed:\n` + job.failed.join("\n") : ""
}

chrome.storage.local.get('dljob', ({ dljob }) => renderProgress(dljob))

chrome.storage.onChanged.addListener((changes, area) => {
    if(area === "local" && changes.dljob) renderProgress(changes.dljob.newValue)
})

canceldl.addEventListener("click", () => {
    chrome.storage.local.get('dljob', ({ dljob }) => {
        if(dljob && dljob.status === "running"){
            dljob.status = "cancelled"
            chrome.storage.local.set({ dljob })
        }
    })
})
