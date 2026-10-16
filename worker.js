const baseuri = "https://gelbooru.com"

// Gelbooru's image CDN redirects requests without a Referer to an HTML page,
// which is what ends up saved as .htm. Add the Referer to the extension's own
// (non-tab) requests to gelbooru hosts so downloads get the real file.
chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [{
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "Referer", operation: "set", value: baseuri + "/" }]
        },
        condition: { requestDomains: ["gelbooru.com"], tabIds: [-1] }
    }]
})

// Service workers have no URL.createObjectURL, so downloads need a data URL.
async function blobToDataUrl(blob){
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ""
    for(let i = 0; i < bytes.length; i += 0x8000){
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`
}

async function downloadPost(id, credentials, setCurrent){
    // The credential string already starts with '&', so we don't add another one.
    const response = await fetch(`${baseuri}/index.php?page=dapi&s=post&q=index&json=1&id=${id}${credentials}`)

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}. Server: ${errorText.substring(0, 200)}`)
    }

    const data = await response.json()

    if (!data || !data.post || data.post.length === 0) {
        throw new Error(`API returned no 'post' data.`)
    }
    const post = data.post[0]
    const imageUrl = post.file_url
    const fileExtension = imageUrl.substring(imageUrl.lastIndexOf('.'))
    const filename = `gelbooru_${post.id}_${post.md5}${fileExtension}`

    await setCurrent(filename)

    // Fetch the file ourselves (the Referer rule applies to this request,
    // but not to chrome.downloads), then save the bytes as a data URL.
    const imgResponse = await fetch(imageUrl, { credentials: "include" })
    const contentType = imgResponse.headers.get("content-type") || ""
    if (!imgResponse.ok || contentType.startsWith("text/html")) {
        throw new Error(`Image server returned ${imgResponse.status} ${contentType} instead of the file (hotlink block).`)
    }
    const dataUrl = await blobToDataUrl(await imgResponse.blob())
    await chrome.downloads.download({ url: dataUrl, filename: filename, conflictAction: "uniquify" })
}

// Works through storage.dljob.queue one post at a time, saving progress after
// each so the popup can show it and the job can resume if the worker restarts.
let jobRunning = false

async function runDownloadJob(){
    if (jobRunning) return
    jobRunning = true

    // Extension API calls keep the service worker from being suspended mid-job.
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000)

    try {
        let { dljob, api_credentials } = await chrome.storage.local.get(['dljob', 'api_credentials'])

        while (dljob && dljob.status === "running" && dljob.queue.length > 0) {
            const id = dljob.queue[0]

            // Save progress without overwriting a cancel made from the popup meanwhile.
            const saveJob = async () => {
                const latest = (await chrome.storage.local.get('dljob')).dljob
                if (latest && latest.status === "cancelled") dljob.status = "cancelled"
                await chrome.storage.local.set({ dljob })
            }

            try {
                await downloadPost(id, api_credentials || "", filename => {
                    dljob.current = filename
                    return saveJob()
                })
            } catch (error) {
                dljob.failed.push(`${id}: ${error.message}`)
            }

            dljob.queue.shift()
            dljob.done++
            if (dljob.queue.length === 0) dljob.status = "finished"
            await saveJob()

            if (dljob.status === "running") await new Promise(r => setTimeout(r, 500))
        }
    } finally {
        clearInterval(keepAlive)
        jobRunning = false
    }
}

// Resume an unfinished job if the service worker was restarted.
chrome.storage.local.get('dljob').then(({ dljob }) => {
    if (dljob && dljob.status === "running") runDownloadJob()
})

function parseURIParameters(uri){
    if(typeof uri !== "string") return null

    const splt = "<s>"
    const pstr = uri.split("?").join(splt).split("&").join(splt).split(splt).slice(1)
    const objParams = {}

    pstr.forEach(ps => {
        const k = ps.split("=")

        objParams[k[0]] = decodeURIComponent(k[1])
    })

    return objParams
}

function isNNN(){
    const curDate = new Date()

    return (new Date(`1 November ${curDate.getFullYear()}`) < curDate) && (new Date(`31 November ${curDate.getFullYear()}`) > curDate)
}

chrome.runtime.onInstalled.addListener(details => {
    if(details.reason === "install"){
        chrome.storage.local.set({ nnnblock: true })
    }

    if(isNNN()){
        chrome.storage.local.get(['nnnblock'], options => {
            if(options.nnnblock){
                chrome.tabs.query({}).then(tabs => tabs.filter(tab => tab.url.startsWith(baseuri)).forEach(tab => chrome.tabs.remove(tab.id))).catch(err => undefined)
            }
        })
    }
})

chrome.tabs.onUpdated.addListener((tabId, tab) => {
    if(isNNN()){
        if(tab.status !== "loading") return

        if(tab.url){
            if(!tab.url.startsWith(baseuri)) return
        } else {
            return
        }
    
        chrome.storage.local.get(['nnnblock'], options => {
            if(options.nnnblock){
                chrome.tabs.query({}).then(tabs => tabs.filter(tab => tab.url.startsWith(baseuri)).forEach(tab => chrome.tabs.remove(tab.id))).catch(err => undefined)
            }
        })
    }
})

chrome.runtime.onConnect.addListener(rawPort => {
    // The popup may close at any time; posting to a dead port must not throw.
    const port = { postMessage: msg => { try { rawPort.postMessage(msg) } catch(e) {} } }

    rawPort.onMessage.addListener(message => {
        let setInfobox = (content, textColor) => port.postMessage({ type: "action", action: "setInfobox", data: { content: (typeof content === "string" ? content : "noContent"), textColor: (typeof textColor === "string" ? textColor : "greenyellow") } })
        let throwError = (err) => port.postMessage({ type: "action", action: "setInfobox", data: { content: (err ? err.toString() : "noErr"), textColor: "red" } })
        let throwWarning = (warning) => port.postMessage({ type: "action", action: "setInfobox", data: { content: `/!\\ ` + (typeof warning === "string" ? warning : "noWarning"), textColor: "yellow" } })

        chrome.tabs.query({}).then(tabs => {
            var posttabs = tabs.filter(tab => {
                const up = parseURIParameters(tab.url)
    
                if(tab.url.startsWith(baseuri) && (up.page === "post") && (up.s === "view") && (!isNaN(up.id))){
                    return true
                } else {
                    return false
                }
            })

            if(message.type === "autoclosetabs_swchange"){
                chrome.storage.local.set({ autoclosetabs: message.data })
            } else if(message.type === "nnnblock_swchange"){
                chrome.storage.local.set({ nnnblock: !message.data })

                if(isNNN() && !message.data){
                    chrome.tabs.query({}).then(tabs => tabs.filter(tab => tab.url.startsWith(baseuri)).forEach(tab => chrome.tabs.remove(tab.id))).catch(throwError)
                }
            } else {
                chrome.storage.local.get(null, options => {
                    if(options.nnnblock && isNNN()){
                        throwError("Nuh-uh :/")
                        tabs.filter(tab => tab.url.startsWith(baseuri)).forEach(tab => chrome.tabs.remove(tab.id))
        
                        return
                    }
    
                    if(!posttabs.length) return throwWarning("No Gelbooru post tabs found.")
    
                    if(message.type === "cpgl"){
                        port.postMessage({ type: "action", action: "clipboardWriteText", data: { content: posttabs.map(tab => tab.url).join("\n") } })
                        setInfobox("Gelbooru post links copied to clipboard ;>>")
                    
                    
                    
                        } else if(message.type === "dgpi"){
                        const fposttabs = [...new Set(posttabs.map(tab => parseURIParameters(tab.url).id))];
                        
                        if (fposttabs.length === 0) {
                            return throwWarning("No valid Gelbooru post tabs found to download.");
                        }

                        if (!options.api_credentials) {
                            return throwError("API credential string not saved. Please check extension settings.");
                        }

                        if (jobRunning || (options.dljob && options.dljob.status === "running")) {
                            return throwWarning("A download is already in progress.");
                        }

                        // The job lives in storage so it keeps going after the popup closes.
                        chrome.storage.local.set({ dljob: { status: "running", queue: fposttabs, total: fposttabs.length, done: 0, failed: [], current: "" } }, runDownloadJob);
                    }


                    if(message.type !== "closetabs" && options.autoclosetabs){
                        posttabs.forEach(tab => chrome.tabs.remove(tab.id))
                    }
                })
            }
        }).catch(throwError)
    })
})
