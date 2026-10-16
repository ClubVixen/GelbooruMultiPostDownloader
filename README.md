<div align="center">
    <a align="center" href="https://github.com/Thetechacker/GelbooruMultiPostDownloader">
        <img src="./assets/g_icon_nbg.png" alt="Logo" width="256" height="256">
    </a>
</div>

<h3 align="center">GelbooruMultiPostDownloader</h3>

<p align="center">A simple Chrome Extension to download all the images of all the open tabs of Gelbooru posts in just one click.</p>
<br>
<p align="center">Made with 💕 by <a href="https://github.com/Thetechacker">Thetechacker</a> & <a href="https://github.com/luainjector">lua injector</a> ;3</p>

<p align="center">Edited by <a href="https://github.com/ClubVixen">ClubVixen</a>, based on the original by Thetechacker.</p>

## Changes in this version

- **Fixed downloads saving as `.htm` files.** Gelbooru's image server blocks requests that don't come from gelbooru.com and sends a "hotlink" web page instead. The extension now adds the right Referer header and fetches each file itself, so you get the actual image.
- **API credentials.** Paste your Gelbooru API string (`&api_key=...&user_id=...`) into the popup and click Save. Downloads use the Gelbooru API.
- **Download counter.** The popup shows `Downloading 2/100` with a progress bar and the current file name.
- **Downloads keep going when the popup closes.** Progress is saved in the background, so clicking outside the popup no longer stops the batch. An interrupted batch resumes on its own.
- **Cancel button** stops the batch after the current file.
- **One failed post no longer stops everything.** It skips to the next post and lists the failures in red at the end.
- **Duplicate file names** get a number added instead of failing.
- **Host permissions** now cover every `*.gelbooru.com` image server.
