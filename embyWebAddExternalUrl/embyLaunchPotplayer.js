// ==UserScript==
// @name         embyLaunchPotplayer
// @name:en      embyLaunchPotplayer
// @name:zh      embyLaunchPotplayer
// @name:zh-CN   embyLaunchPotplayer
// @namespace    http://tampermonkey.net/
// @version      1.1.27
// @description  emby/jellfin launch extetnal player
// @description:zh-cn emby/jellfin 调用外部播放器
// @description:en  emby/jellfin to external player
// @license      MIT
// @author       @bpking
// @github       https://github.com/bpking1/embyExternalUrl
// @match        *://*/web/index.html
// @match        *://*/web/
// ==/UserScript==

(function () {
    'use strict';
    const iconConfig = {
        // 图标来源,以下三选一,注释为只留一个,3 的优先级最高
        // 1.add icons from jsdelivr, network
        baseUrl: "https://emby-external-url.7o7o.cc/embyWebAddExternalUrl/icons",
        // baseUrl: "https://fastly.jsdelivr.net/gh/bpking1/embyExternalUrl@main/embyWebAddExternalUrl/icons",
        // 2.server local icons, same as /emby-server/system/dashboard-ui/icons
        // baseUrl: "icons",
        // 3.add icons from Base64, script inner, this script size 22.5KB to 74KB,
        // 自行复制 ./iconsExt.js 内容到此脚本的 getIconsExt 中
        // 移除最后几个冗余的自定义开关
        removeCustomBtns: false,
    };
    // 启用后将修改直接串流链接为真实文件名,方便第三方播放器友好显示和匹配,
    // 默认不启用,强依赖 nginx-emby2Alist location two rewrite,如发现原始链接播放失败,请关闭此选项
    const useRealFileName = false;
    // 以下为内部使用变量,请勿更改
    let isEmby = "";
    // 非空时，外部播放使用额外部分自己的条目，而不是详情页主视频
    let playbackItemId = null;
    let partCommandRegistered = false;
    const additionalPartIds = new Set();
    const mark = "embyLaunchPotplayer";
    const playBtnsWrapperId = "ExternalPlayersBtns";
    const lsKeys = {
        iconOnly: `${mark}-iconOnly`,
        hideByOS: `${mark}-hideByOS`,
        notCurrentPot: `${mark}-notCurrentPot`,
        strmDirect: `${mark}-strmDirect`,
    };
    const OS = {
        isAndroid: () => /android/i.test(navigator.userAgent),
        isIOS: () => /iPad|iPhone|iPod/i.test(navigator.userAgent),
        isMacOS: () => /Macintosh|MacIntel/i.test(navigator.userAgent),
        isApple: () => OS.isMacOS() || OS.isIOS(),
        isWindows: () => /compatible|Windows/i.test(navigator.userAgent),
        isMobile: () => OS.isAndroid() || OS.isIOS(),
        isUbuntu: () => /Ubuntu/i.test(navigator.userAgent),
        // isAndroidEmbyNoisyX: () => OS.isAndroid() && ApiClient.appVersion().includes('-'),
        // isEmbyNoisyX: () => ApiClient.appVersion().includes('-'),
        isOthers: () => Object.entries(OS).filter(([key, val]) => key !== 'isOthers').every(([key, val]) => !val()),
    };
    const playBtns = [
        { id: "embyPot", title: "Potplayer", iconId: "icon-PotPlayer"
            , onClick: embyPot, osCheck: [OS.isWindows], },
        { id: "embyVlc", title: "VLC", iconId: "icon-VLC", onClick: embyVlc, },
        { id: "embyIINA", title: "IINA", iconId: "icon-IINA"
            , onClick: embyIINA, osCheck: [OS.isMacOS], },
        { id: "embyNPlayer", title: "NPlayer", iconId: "icon-NPlayer", onClick: embyNPlayer, },
        { id: "embyMX", title: "MXPlayer", iconId: "icon-MXPlayer"
            , onClick: embyMX, osCheck: [OS.isAndroid], },
        { id: "embyMXPro", title: "MXPlayerPro", iconId: "icon-MXPlayerPro"
            , onClick: embyMXPro, osCheck: [OS.isAndroid], },
        { id: "embyInfuse", title: "Infuse", iconId: "icon-infuse"
            , onClick: embyInfuse, osCheck: [OS.isApple], },
        { id: "embyStellarPlayer", title: "恒星播放器", iconId: "icon-StellarPlayer"
            , onClick: embyStellarPlayer, osCheck: [OS.isWindows, OS.isMacOS, OS.isAndroid], },
        { id: "embyMPV", title: "MPV", iconId: "icon-MPV", onClick: embyMPV, },
        { id: "embyDDPlay", title: "弹弹Play", iconId: "icon-DDPlay"
            , onClick: embyDDPlay, osCheck: [OS.isWindows, OS.isAndroid], },
        { id: "embyFileball", title: "Fileball", iconId: "icon-Fileball"
            , onClick: embyFileball, osCheck: [OS.isApple], },
        { id: "embyOmniPlayer", title: "OmniPlayer", iconId: "icon-OmniPlayer"
            , onClick: embyOmniPlayer, osCheck: [OS.isMacOS], },
        { id: "embyFigPlayer", title: "FigPlayer", iconId: "icon-FigPlayer"
            , onClick: embyFigPlayer, osCheck: [OS.isMacOS], },
        { id: "embySenPlayer", title: "SenPlayer", iconId: "icon-SenPlayer"
            , onClick: embySenPlayer, osCheck: [OS.isIOS], },
        { id: "embyCopyUrl", title: "复制串流地址", iconId: "icon-Copy", onClick: embyCopyUrl, },
    ];
    const customBtns = [
        { id: "hideByOS", title: "异构播放器", iconName: "more", onClick: hideByOSHandler, },
        { id: "iconOnly", title: "显示模式", iconName: "open_in_full", onClick: iconOnlyHandler, },
        { id: "notCurrentPot", title: "多开Potplayer", iconName: "select_window", onClick: notCurrentPotHandler, },
        { id: "strmDirect", title: "STRM直通", desc: "AList注意关sign,否则不要开启此选项,任然由服务端处理sign"
            , iconName: "media_link", onClick: strmDirectHandler,
        },
    ];
    if (!iconConfig.removeCustomBtns) {
        playBtns.push(...customBtns);
    }
    const fileNameReg = /.*[\\/]|(\?.*)?$/g;
    const selectors = {
        // 详情页评分,上映日期信息栏
        embyMediaInfoDiv: "div[is='emby-scroller']:not(.hide) .mediaInfo:not(.hide)",
        jellfinMediaInfoDiv: ".itemMiscInfo-primary:not(.hide)",
        // 电视直播详情页创建录制按钮
        embyBtnManualRecording: "div[is='emby-scroller']:not(.hide) .btnManualRecording:not(.hide)",
        // 电视直播详情页停止录制按钮
        jellfinBtnCancelTimer: ".btnCancelTimer:not(.hide)",
        // 详情页播放收藏那排按钮
        embyMainDetailButtons: "div[is='emby-scroller']:not(.hide) .mainDetailButtons",
        jellfinMainDetailButtons: "div.itemDetailPage:not(.hide) div.detailPagePrimaryContainer",
        // 详情页字幕选择下拉框
        selectSubtitles: "div[is='emby-scroller']:not(.hide) select.selectSubtitles",
        // 详情页多版本选择下拉框
        selectSource: "div[is='emby-scroller']:not(.hide) select.selectSource:not([disabled])",
    };

    function init() {
        let playBtnsWrapper = document.getElementById(playBtnsWrapperId);
        if (playBtnsWrapper) {
            playBtnsWrapper.remove();
        }
        let mainDetailButtons = document.querySelector(selectors.embyMainDetailButtons);
        function generateButtonHTML({ id, title, desc, iconId, iconName }) {
            return `
                <button
                    id="${id}"
                    type="button"
                    class="detailButton emby-button emby-button-backdropfilter raised-backdropfilter detailButton-primary"
                    title="${desc ? desc : title}"
                >
                    <div class="detailButton-content">
                        <i class="md-icon detailButton-icon button-icon button-icon-left" id="${iconId}">
                        ${iconName ? iconName : '　'}
                        </i>
                        <span class="button-text">${title}</span>
                    </div>
                </button>
            `;
        }
        let buttonHtml = `<div id="${playBtnsWrapperId}" class="detailButtons flex align-items-flex-start flex-wrap-wrap detail-lineItem">`;
        playBtns.forEach(btn => {
            buttonHtml += generateButtonHTML(btn);
        });
        buttonHtml += `</div>`;

        if (!isEmby) {
            // jellfin
            mainDetailButtons = document.querySelector(selectors.jellfinMainDetailButtons);
        }

        mainDetailButtons.insertAdjacentHTML("afterend", buttonHtml);

        if (!isEmby) {
            // jellfin add class, detailPagePrimaryContainer、button-flat
            let playBtnsWrapper = document.getElementById("ExternalPlayersBtns");
            // style to cover .layout-mobile
            playBtnsWrapper.style.display = "flex";
            // playBtnsWrapper.style["justifyContent"] = "center";
            playBtnsWrapper.classList.add("detailPagePrimaryContainer");
            let btns = playBtnsWrapper.getElementsByTagName("button");
            for (let i = 0; i < btns.length; i++) {
                btns[i].classList.add("button-flat");
            }
        }

        // add event
        playBtns.forEach(btn => {
            const btnEle = document.querySelector(`#${btn.id}`);
            if (btnEle) {
                btnEle.onclick = btn.onClick;
            }
        });

        const iconBaseUrl = iconConfig.baseUrl;
        const icons = [
            // if url exists, use url property, if id diff icon name, use name property
            { id: "icon-PotPlayer", name: "icon-PotPlayer.webp", fontSize: "1.4em" },
            { id: "icon-VLC", fontSize: "1.3em" },
            { id: "icon-IINA", fontSize: "1.4em" },
            { id: "icon-NPlayer", fontSize: "1.3em" },
            { id: "icon-MXPlayer", fontSize: "1.4em" },
            { id: "icon-MXPlayerPro", fontSize: "1.4em" },
            { id: "icon-infuse", fontSize: "1.4em" },
            { id: "icon-StellarPlayer", fontSize: "1.4em" },
            { id: "icon-MPV", fontSize: "1.4em" },
            { id: "icon-DDPlay", fontSize: "1.4em" },
            { id: "icon-Fileball", fontSize: "1.4em" },
            { id: "icon-SenPlayer", fontSize: "1.4em" },
            { id: "icon-OmniPlayer", fontSize: "1.4em" },
            { id: "icon-FigPlayer", fontSize: "1.4em" },
            { id: "icon-Copy", fontSize: "1.4em" },
        ];
        const iconsExt = getIconsExt();
        icons.map((icon, index) => {
            const element = document.querySelector(`#${icon.id}`);
            if (element) {
                // if url exists, use url property, if id diff icon name, use name property
                icon.url = typeof iconsExt !== 'undefined' && iconsExt && iconsExt[index] ? iconsExt[index].url : undefined;
                const url = icon.url || `${iconBaseUrl}/${icon.name || `${icon.id}.webp`}`;
                element.style.cssText += `
                    background-image: url(${url});
                    background-repeat: no-repeat;
                    background-size: 100% 100%;
                    font-size: ${icon.fontSize};
                `;
            }
        });
        if (!iconConfig.removeCustomBtns) {
            hideByOSHandler();
            iconOnlyHandler();
            notCurrentPotHandler();
            strmDirectHandler();
        }
    }

    // copy from ./iconsExt,如果更改了以下内容,请同步更改 ./iconsExt.js
    function getIconsExt() {
        // base64 data total size 72.5 KB from embyWebAddExternalUrl/icons/min, sync modify
        const iconsExt = [];
        return iconsExt;
    }

    function showFlag() {
        let mediaInfoDiv = document.querySelector(selectors.embyMediaInfoDiv);
        let btnManualRecording = document.querySelector(selectors.embyBtnManualRecording);
        if (!isEmby) {
            mediaInfoDiv = document.querySelector(selectors.jellfinBtnManualRecording);
            btnManualRecording = document.querySelector(selectors.jellfinBtnCancelTimer);
        }
        return !!mediaInfoDiv || !!btnManualRecording;
    }

    async function getItemWithSources(userId, itemId) {
        let item = await ApiClient.getItem(userId, itemId);
        if (item.MediaSources && item.MediaSources.length > 0) {
            return item;
        }
        if (typeof ApiClient.getUrl === "function" && typeof ApiClient.getJSON === "function") {
            const url = ApiClient.getUrl(`Users/${userId}/Items/${itemId}`, {
                Fields: "MediaSources,MediaStreams,Path,UserData",
            });
            item = await ApiClient.getJSON(url);
        }
        return item;
    }

    async function getItemInfo() {
        let userId = ApiClient._serverInfo.UserId;
        if (playbackItemId) {
            console.log("additionalPartItemId: " + playbackItemId);
            return await getItemWithSources(userId, playbackItemId);
        }
        let itemId = /\?id=([A-Za-z0-9]+)/.exec(window.location.hash)[1];
        let response = await ApiClient.getItem(userId, itemId);
        // 继续播放当前剧集的下一集
        if (response.Type == "Series") {
            let seriesNextUpItems = await ApiClient.getNextUpEpisodes({ SeriesId: itemId, UserId: userId });
            if (seriesNextUpItems.Items.length > 0) {
                console.log("nextUpItemId: " + seriesNextUpItems.Items[0].Id);
                return await ApiClient.getItem(userId, seriesNextUpItems.Items[0].Id);
            }
        }
        // 播放当前季season的第一集
        if (response.Type == "Season") {
            let seasonItems = await ApiClient.getItems(userId, { parentId: itemId });
            console.log("seasonItemId: " + seasonItems.Items[0].Id);
            return await ApiClient.getItem(userId, seasonItems.Items[0].Id);
        }
        // 播放当前集或电影
        if (response.MediaSources?.length > 0) {
            console.log("itemId:  " + itemId);
            return response;
        }
        // 默认播放第一个,集/播放列表第一个媒体
        let firstItems = await ApiClient.getItems(userId, { parentId: itemId, Recursive: true, IsFolder: false, Limit: 1 });
        console.log("firstItemId: " + firstItems.Items[0].Id);
        return await ApiClient.getItem(userId, firstItems.Items[0].Id);
    }

    function getSeek(position) {
        let ticks = position * 10000;
        let parts = []
            , hours = ticks / 36e9;
        (hours = Math.floor(hours)) && parts.push(hours);
        let minutes = (ticks -= 36e9 * hours) / 6e8;
        ticks -= 6e8 * (minutes = Math.floor(minutes)),
            minutes < 10 && hours && (minutes = "0" + minutes),
            parts.push(minutes);
        let seconds = ticks / 1e7;
        return (seconds = Math.floor(seconds)) < 10 && (seconds = "0" + seconds),
            parts.push(seconds),
            parts.join(":")
    }

    function getSubPath(mediaSource) {
        const streams = mediaSource.MediaStreams || [];
        // 额外部分不使用详情页上主视频选中的字幕序号
        let selectSubtitles = playbackItemId ? null : document.querySelector(selectors.selectSubtitles);
        let subTitlePath = '';
        //返回选中的外挂字幕
        if (selectSubtitles && selectSubtitles.value > 0) {
            let SubIndex = streams.findIndex(m => m.Index == selectSubtitles.value && m.IsExternal);
            if (SubIndex > -1) {
                let subtitleCodec = streams[SubIndex].Codec;
                subTitlePath = `/${mediaSource.Id}/Subtitles/${selectSubtitles.value}/Stream.${subtitleCodec}`;
            }
        }
        else {
            //默认尝试返回第一个外挂中文字幕
            let chiSubIndex = streams.findIndex(m => m.Language == "chi" && m.IsExternal);
            if (chiSubIndex > -1) {
                let subtitleCodec = streams[chiSubIndex].Codec;
                subTitlePath = `/${mediaSource.Id}/Subtitles/${chiSubIndex}/Stream.${subtitleCodec}`;
            } else {
                //尝试返回第一个外挂字幕
                let externalSubIndex = streams.findIndex(m => m.IsExternal);
                if (externalSubIndex > -1) {
                    let subtitleCodec = streams[externalSubIndex].Codec;
                    subTitlePath = `/${mediaSource.Id}/Subtitles/${externalSubIndex}/Stream.${subtitleCodec}`;
                }
            }

        }
        return subTitlePath;
    }

    async function getEmbyMediaInfo() {
        let itemInfo = await getItemInfo();
        if (!itemInfo || !itemInfo.MediaSources || itemInfo.MediaSources.length === 0) {
            console.error("没有可用的媒体源", playbackItemId || itemInfo);
            throw new Error("没有可用的媒体源");
        }
        let mediaSourceId = itemInfo.MediaSources[0].Id;
        if (!playbackItemId) {
            let selectSource = document.querySelector(selectors.selectSource);
            if (selectSource && selectSource.value.length > 0) {
                mediaSourceId = selectSource.value;
            }
        }
        // let selectAudio = document.querySelector("div[is='emby-scroller']:not(.hide) select.selectAudio:not([disabled])");
        const accessToken = ApiClient.accessToken();
        let mediaSource = itemInfo.MediaSources.find(m => m.Id == mediaSourceId) || itemInfo.MediaSources[0];
        let uri = isEmby ? "/emby/videos" : "/Items";
        let baseUrl = `${ApiClient._serverAddress}${uri}/${itemInfo.Id}`;
        let subPath = getSubPath(mediaSource);
        let subUrl = subPath.length > 0 ? `${baseUrl}${subPath}?api_key=${accessToken}` : "";
        let streamUrl = `${baseUrl}/`;
        const sourcePath = mediaSource.Path || "";
        if (sourcePath.startsWith("http") && localStorage.getItem(lsKeys.strmDirect) === "1") {
            streamUrl = decodeURIComponent(sourcePath);
        } else {
            const nameForFile = sourcePath || mediaSource.Name || itemInfo.Name || "video";
            let fileName = mediaSource.IsInfiniteStream ? `master.m3u8` : decodeURIComponent(nameForFile.replace(fileNameReg, ""));
            if (isEmby) {
                if (mediaSource.IsInfiniteStream) {
                    streamUrl += useRealFileName && mediaSource.Name ? `${mediaSource.Name}.m3u8` : fileName;
                } else {
                    // origin link: /emby/videos/401929/stream.xxx?xxx
                    // modify link: /emby/videos/401929/stream/xxx.xxx?xxx
                    // this is not important, hit "/emby/videos/401929/" path level still worked
                    streamUrl += useRealFileName ? `stream/${fileName}` : `stream.${mediaSource.Container}`;
                }
            } else {
                streamUrl += `Download`;
                streamUrl += useRealFileName ? `/${fileName}` : "";
            }
            streamUrl += `?api_key=${accessToken}&Static=true&MediaSourceId=${mediaSourceId}&DeviceId=${ApiClient._deviceId}`;
        }
        const playbackTicks = itemInfo.UserData && itemInfo.UserData.PlaybackPositionTicks;
        let position = playbackTicks ? parseInt(playbackTicks / 10000) : 0;
        let intent = await getIntent(mediaSource, position);
        console.log(streamUrl, subUrl, intent);
        return {
            streamUrl: streamUrl,
            subUrl: subUrl,
            intent: intent,
        }
    }

    async function getIntent(mediaSource, position) {
        // 直播节目查询items接口没有path
        const titlePath = mediaSource.Path || mediaSource.Name || "video";
        let title = mediaSource.IsInfiniteStream
            ? mediaSource.Name
            : decodeURIComponent(titlePath.replace(fileNameReg, ""));
        let externalSubs = (mediaSource.MediaStreams || []).filter(m => m.IsExternal == true);
        let subs = ''; // 要求是android.net.uri[] ?
        let subs_name = '';
        let subs_filename = '';
        let subs_enable = '';
        if (externalSubs) {
            subs_name = externalSubs.map(s => s.DisplayTitle);
            subs_filename = externalSubs.map(s => (s.Path || "").split('/').pop());
        }
        return {
            title: title,
            position: position,
            subs: subs,
            subs_name: subs_name,
            subs_filename: subs_filename,
            subs_enable: subs_enable
        };
    }

    // URL with "intent" scheme only support
    // String => 'S'
    // Boolean =>'B'
    // Byte => 'b'
    // Character => 'c'
    // Double => 'd'
    // Float => 'f'
    // Integer => 'i'
    // Long => 'l'
    // Short => 's'

    async function embyPot() {
        const mediaInfo = await getEmbyMediaInfo();
        const intent = mediaInfo.intent;
        const notCurrentPotArg = localStorage.getItem(lsKeys.notCurrentPot) === "1" ? "" : "/current";
        let potUrl = `potplayer://${encodeURI(mediaInfo.streamUrl)} /sub=${encodeURI(mediaInfo.subUrl)} ${notCurrentPotArg} /seek=${getSeek(intent.position)} /title="${intent.title}"`;
        await writeClipboard(potUrl);
        console.log("成功写入剪切板真实深度链接: ", potUrl);
        // 测试出无空格也行,potplayer 对于 DeepLink 会自动转换为命令行参数,全量参数: PotPlayer 关于 => 命令行选项
        potUrl = `potplayer://${notCurrentPotArg}/clipboard`;
        window.open(potUrl, "_self");
    }

    // async function embyPot() {
    //     let mediaInfo = await getEmbyMediaInfo();
    //     let intent = mediaInfo.intent;
    //     let potUrl = `potplayer://${encodeURI(mediaInfo.streamUrl)} /sub=${encodeURI(mediaInfo.subUrl)} /current /seek=${getSeek(intent.position)}`;
    //     potUrl += useRealFileName ? '' : ` /title="${intent.title}"`;
    //     console.log(potUrl);
    //     window.open(potUrl, "_self");
    // }

    // https://wiki.videolan.org/Android_Player_Intents/
    async function embyVlc() {
        let mediaInfo = await getEmbyMediaInfo();
        let intent = mediaInfo.intent;
        // android subtitles:  https://code.videolan.org/videolan/vlc-android/-/issues/1903
        let vlcUrl = `intent:${encodeURI(mediaInfo.streamUrl)}#Intent;package=org.videolan.vlc;type=video/*;S.subtitles_location=${encodeURI(mediaInfo.subUrl)};S.title=${encodeURI(intent.title)};i.position=${intent.position};end`;
        if (OS.isWindows()) {
            // 桌面端需要额外设置,参考这个项目:
            // new: https://github.com/northsea4/vlc-protocol
            // old: https://github.com/stefansundin/vlc-protocol
            vlcUrl = `vlc://${encodeURI(mediaInfo.streamUrl)}`;
        }
        if (OS.isIOS()) {
            // https://wiki.videolan.org/Documentation:IOS/#x-callback-url
            // https://code.videolan.org/videolan/vlc-ios/-/commit/55e27ed69e2fce7d87c47c9342f8889fda356aa9
            vlcUrl = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(mediaInfo.streamUrl)}&sub=${encodeURIComponent(mediaInfo.subUrl)}`;
        }
        console.log(vlcUrl);
        window.open(vlcUrl, "_self");
    }

    // https://github.com/iina/iina/issues/1991
    async function embyIINA() {
        let mediaInfo = await getEmbyMediaInfo();
        let iinaUrl = `iina://weblink?url=${encodeURIComponent(mediaInfo.streamUrl)}&new_window=1`;
        console.log(`iinaUrl= ${iinaUrl}`);
        window.open(iinaUrl, "_self");
    }

    // https://sites.google.com/site/mxvpen/api
    // https://mx.j2inter.com/api
    // https://support.mxplayer.in/support/solutions/folders/43000574903
    async function embyMX() {
        const mediaInfo = await getEmbyMediaInfo();
        const intent = mediaInfo.intent;
        // mxPlayer free
        const packageName = "com.mxtech.videoplayer.ad";
        const url = `intent:${encodeURI(mediaInfo.streamUrl)}#Intent;package=${packageName};S.title=${encodeURI(intent.title)};i.position=${intent.position};end`;
        console.log(url);
        window.open(url, "_self");
    }

    async function embyMXPro() {
        const mediaInfo = await getEmbyMediaInfo();
        const intent = mediaInfo.intent;
        // mxPlayer Pro
        const packageName = "com.mxtech.videoplayer.pro";
        const url = `intent:${encodeURI(mediaInfo.streamUrl)}#Intent;package=${packageName};S.title=${encodeURI(intent.title)};i.position=${intent.position};end`;
        console.log(url);
        window.open(url, "_self");
    }

    async function embyNPlayer() {
        let mediaInfo = await getEmbyMediaInfo();
        let nUrl = OS.isMacOS()
            ? `nplayer-mac://weblink?url=${encodeURIComponent(mediaInfo.streamUrl)}&new_window=1` 
            : `nplayer-${encodeURI(mediaInfo.streamUrl)}`;
        console.log(nUrl);
        window.open(nUrl, "_self");
    }

    async function embyInfuse() {
        let mediaInfo = await getEmbyMediaInfo();
        // sub 参数限制: 播放带有外挂字幕的单个视频文件（Infuse 7.6.2 及以上版本）
        // see: https://support.firecore.com/hc/zh-cn/articles/215090997
        let infuseUrl = `infuse://x-callback-url/play?url=${encodeURIComponent(mediaInfo.streamUrl)}&sub=${encodeURIComponent(mediaInfo.subUrl)}`;
        console.log(`infuseUrl= ${infuseUrl}`);
        window.open(infuseUrl, "_self");
    }

    // StellarPlayer
    async function embyStellarPlayer() {
        let mediaInfo = await getEmbyMediaInfo();
        let stellarPlayerUrl = `stellar://play/${encodeURI(mediaInfo.streamUrl)}`;
        console.log(`stellarPlayerUrl= ${stellarPlayerUrl}`);
        window.open(stellarPlayerUrl, "_self");
    }

    // MPV
    async function embyMPV() {
        let mediaInfo = await getEmbyMediaInfo();
        //桌面端需要额外设置,使用这个项目: https://github.com/akiirui/mpv-handler
        let streamUrl64 = btoa(String.fromCharCode.apply(null, new Uint8Array(new TextEncoder().encode(mediaInfo.streamUrl))))
            .replace(/\//g, "_").replace(/\+/g, "-").replace(/\=/g, "");
        let MPVUrl = `mpv://play/${streamUrl64}`;
        if (mediaInfo.subUrl.length > 0) {
            let subUrl64 = btoa(mediaInfo.subUrl).replace(/\//g, "_").replace(/\+/g, "-").replace(/\=/g, "");
            MPVUrl = `mpv://play/${streamUrl64}/?subfile=${subUrl64}`;
        }

        if (OS.isIOS() || OS.isAndroid()) {
            MPVUrl = `mpv://${encodeURI(mediaInfo.streamUrl)}`;
        }

        console.log(MPVUrl);
        window.open(MPVUrl, "_self");
    }

    // see https://greasyfork.org/zh-CN/scripts/443916
    async function embyDDPlay() {
        // 检查是否windows本地路径
        const fullPathEle = document.querySelector(".mediaSources .mediaSource .sectionTitle > div:not([class]):first-child");
        let fullPath = fullPathEle ? fullPathEle.innerText : "";
        let ddplayUrl;
        if (new RegExp('^[a-zA-Z]:').test(fullPath)) {
            ddplayUrl = `ddplay:${encodeURIComponent(fullPath)}`;
        } else {
            console.log("文件路径不是本地路径,将使用串流播放");
            const mediaInfo = await getEmbyMediaInfo();
            const intent = mediaInfo.intent;
            if (!fullPath) {
                fullPath = intent.title;
            }
            const urlPart = mediaInfo.streamUrl + `|filePath=${fullPath}`;
            ddplayUrl = `ddplay:${encodeURIComponent(urlPart)}`;
            if (OS.isAndroid()) {
                // Subtitles Not Supported: https://github.com/kaedei/dandanplay-libraryindex/blob/master/api/ClientProtocol.md
                ddplayUrl = `intent:${encodeURI(urlPart)}#Intent;package=com.xyoye.dandanplay;type=video/*;end`;
            }
        }
        console.log(`ddplayUrl= ${ddplayUrl}`);
        window.open(ddplayUrl, "_self");
    }

    async function embyFileball() {
        const mediaInfo = await getEmbyMediaInfo();
        // see: app 关于, URL Schemes
        const url = `filebox://play?url=${encodeURIComponent(mediaInfo.streamUrl)}`;
        console.log(`FileballUrl= ${url}`);
        window.open(url, "_self");
    }

    async function embyOmniPlayer() {
        const mediaInfo = await getEmbyMediaInfo();
        // see: https://github.com/AlistGo/alist-web/blob/main/src/pages/home/previews/video_box.tsx
        const url = `omniplayer://weblink?url=${encodeURIComponent(mediaInfo.streamUrl)}`;
        console.log(`OmniPlayerUrl= ${url}`);
        window.open(url, "_self");
    }

    async function embyFigPlayer() {
        const mediaInfo = await getEmbyMediaInfo();
        // see: https://github.com/AlistGo/alist-web/blob/main/src/pages/home/previews/video_box.tsx
        const url = `figplayer://weblink?url=${encodeURIComponent(mediaInfo.streamUrl)}`;
        console.log(`FigPlayerUrl= ${url}`);
        window.open(url, "_self");
    }

    async function embySenPlayer() {
        const mediaInfo = await getEmbyMediaInfo();
        // see: app 关于, URL Schemes
        const url = `SenPlayer://x-callback-url/play?url=${encodeURIComponent(mediaInfo.streamUrl)}`;
        console.log(`SenPlayerUrl= ${url}`);
        window.open(url, "_self");
    }

    function lsCheckSetBoolean(event, lsKeyName) {
        let flag = localStorage.getItem(lsKeyName) === "1";
        if (event) {
            flag = !flag;
            localStorage.setItem(lsKeyName, flag ? "1" : "0");
        }
        return flag;
    }

    function hideByOSHandler(event) {
        const btn = document.getElementById("hideByOS");
        if (!btn) {
            return;
        }
        const flag = lsCheckSetBoolean(event, lsKeys.hideByOS);
        const playBtnsWrapper = document.getElementById(playBtnsWrapperId);
        const buttonEleArr = playBtnsWrapper.querySelectorAll("button");
        buttonEleArr.forEach(btnEle => {
            const btn = playBtns.find(btn => btn.id === btnEle.id);
            const shouldHide = flag && btn.osCheck && !btn.osCheck.some(check => check());
            console.log(`${btn.id} Should Hide: ${shouldHide}`);
            btnEle.style.display = shouldHide ? 'none' : 'block';
        });
        btn.classList.toggle("button-submit", flag);
    }

    function iconOnlyHandler(event) {
        const btn = document.getElementById("iconOnly");
        if (!btn) {
            return;
        }
        const flag = lsCheckSetBoolean(event, lsKeys.iconOnly);
        const playBtnsWrapper = document.getElementById(playBtnsWrapperId);
        const spans = playBtnsWrapper.querySelectorAll("span");
        spans.forEach(span => {
            span.hidden = flag;
        });
        const iArr = playBtnsWrapper.querySelectorAll("i");
        iArr.forEach(iEle => {
            iEle.classList.toggle("button-icon-left", !flag);
        });
        btn.classList.toggle("button-submit", flag);
    }

    function notCurrentPotHandler(event) {
        const btn = document.getElementById("notCurrentPot");
        if (!btn) {
            return;
        }
        const flag = lsCheckSetBoolean(event, lsKeys.notCurrentPot);
        btn.classList.toggle("button-submit", flag);
    }

    function strmDirectHandler(event) {
        const btn = document.getElementById("strmDirect");
        if (!btn) {
            return;
        }
        const flag = lsCheckSetBoolean(event, lsKeys.strmDirect);
        btn.classList.toggle("button-submit", flag);
    }

    async function embyCopyUrl() {
        const mediaInfo = await getEmbyMediaInfo();
        const streamUrl = encodeURI(mediaInfo.streamUrl);
        if (await writeClipboard(streamUrl)) {
            console.log(`copyUrl = ${streamUrl}`);
            this.innerText = '复制成功';
        }
    }

    async function writeClipboard(text) {
        let flag = false;
        if (navigator.clipboard) {
            // 火狐上 need https
            try {
                await navigator.clipboard.writeText(text);
                flag = true;
                console.log("成功使用 navigator.clipboard 现代剪切板实现");
            } catch (error) {
                console.error('navigator.clipboard 复制到剪贴板时发生错误:', error);
            }
        } else {
            flag = writeClipboardLegacy(text);
            console.log("不存在 navigator.clipboard 现代剪切板实现,使用旧版实现");
        }
        return flag;
    }

    function writeClipboardLegacy(text) {
        let textarea = document.createElement('textarea');
        document.body.appendChild(textarea);
        textarea.style.position = 'absolute';
        textarea.style.clip = 'rect(0 0 0 0)';
        textarea.value = text;
        textarea.select();
        if (document.execCommand('copy', true)) {
            return true;
        }
        return false;
    }

    function externalPlayersForMenu() {
        const hideByOS = localStorage.getItem(lsKeys.hideByOS) === "1";
        return playBtns.filter(btn => {
            if (customBtns.some(item => item.id === btn.id)) {
                return false;
            }
            if (hideByOS && btn.osCheck && !btn.osCheck.some(check => check())) {
                return false;
            }
            return true;
        });
    }

    function isAdditionalPartContext(options) {
        const items = options && (options.items || (options.item ? [options.item] : []));
        const item = items && items[0];
        if (!item || !item.Id) {
            return false;
        }
        const extraType = item.ExtraType;
        const fromType = extraType === "AdditionalPart" || extraType === 10;
        const element = options.itemElement || options.positionTo;
        const fromCard = !!(element && element.closest && element.closest(".additionalPartsItemsContainer"));
        if (fromType || fromCard || additionalPartIds.has(String(item.Id))) {
            additionalPartIds.add(String(item.Id));
            return true;
        }
        return false;
    }

    function registerAdditionalPartCommand() {
        if (partCommandRegistered || !window.Emby || typeof Emby.importModule !== "function") {
            return;
        }
        partCommandRegistered = true;
        Emby.importModule("./modules/common/itemmanager/itemmanager.js").then(module => {
            const manager = module && (module.default || module);
            if (!manager || typeof manager.registerCommandSource !== "function") {
                partCommandRegistered = false;
                return;
            }
            manager.registerCommandSource({
                getCommands(options) {
                    if (!isAdditionalPartContext(options)) {
                        return [];
                    }
                    return externalPlayersForMenu().map(btn => ({
                        name: "外部播放 · " + btn.title,
                        id: "external-" + btn.id,
                        icon: "open_in_new",
                    }));
                },
                executeCommand(command, items) {
                    const player = playBtns.find(btn => "external-" + btn.id === command);
                    const item = items && items[0];
                    if (!player || !item || !item.Id) {
                        return Promise.resolve();
                    }
                    playbackItemId = item.Id;
                    return Promise.resolve().then(() => player.onClick()).finally(() => {
                        playbackItemId = null;
                    });
                },
            });
        }).catch(() => {
            partCommandRegistered = false;
        });
    }

    const partCommandTimer = setInterval(() => {
        if (!window.Emby || typeof Emby.importModule !== "function") {
            return;
        }
        clearInterval(partCommandTimer);
        registerAdditionalPartCommand();
    }, 500);

    // 标题以「番号 + 标题」开头时，番号可点击复制
    const codeTitleRe = /^(?:[\[【(]\s*)?((?:FC2-?(?:PPV-?)?\d{5,8}|\d{2,6}[A-Z]{2,12}-\d{3,5}|[A-Z]\d{2,3}-\d{3,5}|[A-Z]{2,12}-\d{3,5})(?:-(?:C|UC|U|CD\d{1,2}|4K|FHD|HD|LE))?)(?:\s*[\]】)])?(?:(\s*[-–—]\s*|[_．.·]+|\s+)(.+)|([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}].*))?$/iu;
    const blockedCodePrefix = /^(?:HD|SD|FHD|UHD|HDR|DVD|BD|BLURAY|EP|VOL|NO|PART|CD|ID|AVC|HEVC|AAC)$/i;
    const codeTitleSelector = [
        ".detailNameContainer h1",
        ".detailNameContainer h3",
        ".cardText:not(.cardText-secondary)",
        ".listItemBodyText:not(.listItemBodyText-secondary)",
    ].join(",");

    function normalizeCodeTitle(text) {
        return (text || "").replace(/[－—–]/g, "-").replace(/　/g, " ").trim();
    }

    function splitCodeTitle(text) {
        const normalized = normalizeCodeTitle(text);
        if (!normalized || normalized.length > 300) {
            return null;
        }
        const matched = normalized.match(codeTitleRe);
        if (!matched) {
            return null;
        }
        const code = matched[1];
        const prefix = code.match(/^(?:\d+)?([A-Z]+)/i);
        if (!prefix || blockedCodePrefix.test(prefix[1])) {
            return null;
        }
        const separator = matched[2] || "";
        const rest = matched[3] || matched[4] || "";
        return { code, separator, rest };
    }

    function ensureCodeStyle() {
        if (document.getElementById("embyLaunchPotplayer-code-style")) {
            return;
        }
        const style = document.createElement("style");
        style.id = "embyLaunchPotplayer-code-style";
        style.textContent = [
            ".embyLaunchPotplayer-code{cursor:pointer;display:inline-flex;align-items:center;vertical-align:middle;margin-inline-start:.28em;color:inherit;opacity:.8;}",
            ".embyLaunchPotplayer-code .md-icon{font-size:.68em;width:1em;height:1em;line-height:1;margin:0;}",
            ".embyLaunchPotplayer-code:hover{opacity:1;}",
            ".embyLaunchPotplayer-code.is-copied{color:#3dd68c;opacity:1;}",
        ].join("");
        document.head.appendChild(style);
    }

    function codeTitleText(el) {
        let text = "";
        el.childNodes.forEach(node => {
            if (node.nodeType === 1 && node.classList.contains("embyLaunchPotplayer-code")) {
                return;
            }
            text += node.textContent || "";
        });
        return normalizeCodeTitle(text);
    }

    function decorateCodeTitle(el) {
        if (!el || el.nodeType !== 1 || !el.matches(codeTitleSelector)) {
            return;
        }
        const text = codeTitleText(el);
        const chip = el.querySelector(":scope > .embyLaunchPotplayer-code");
        if (el.dataset.launchCodeSource === text && (el.dataset.launchCodeHit !== "1" || chip)) {
            return;
        }
        const parsed = splitCodeTitle(text);
        el.dataset.launchCodeSource = text;
        el.dataset.launchCodeHit = parsed ? "1" : "0";
        if (!parsed || el.querySelector("img, a, button, input, textarea")) {
            el.dataset.launchCodeHit = "0";
            return;
        }
        const codeEl = document.createElement("span");
        codeEl.className = "embyLaunchPotplayer-code";
        codeEl.dataset.code = parsed.code;
        codeEl.title = "点击复制番号";
        const icon = document.createElement("i");
        icon.className = "md-icon";
        icon.textContent = "content_paste";
        codeEl.appendChild(icon);
        el.textContent = "";
        el.appendChild(document.createTextNode(parsed.code));
        el.appendChild(codeEl);
        if (parsed.rest) {
            el.appendChild(document.createTextNode(parsed.separator + parsed.rest));
        }
    }

    function scanCodeTitles(root) {
        if (!root) {
            return;
        }
        if (root.nodeType === 3) {
            decorateCodeTitle(root.parentElement);
            return;
        }
        if (root.nodeType !== 1) {
            return;
        }
        decorateCodeTitle(root);
        if (root.querySelectorAll) {
            root.querySelectorAll(codeTitleSelector).forEach(decorateCodeTitle);
        }
    }

    function flashCopiedCode(codeEl, ok) {
        codeEl.classList.toggle("is-copied", ok);
        codeEl.title = ok ? "已复制" : "复制失败";
        setTimeout(() => {
            codeEl.classList.remove("is-copied");
            codeEl.title = "点击复制番号";
        }, 1200);
    }

    function stopCodeEvent(event) {
        const codeEl = event.target.closest && event.target.closest(".embyLaunchPotplayer-code");
        if (!codeEl) {
            return;
        }
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    document.addEventListener("pointerdown", stopCodeEvent, true);
    document.addEventListener("pointerup", stopCodeEvent, true);

    document.addEventListener("click", (event) => {
        const codeEl = event.target.closest && event.target.closest(".embyLaunchPotplayer-code");
        if (!codeEl) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        writeClipboard(codeEl.dataset.code || "").then((ok) => {
            flashCopiedCode(codeEl, !!ok);
        });
    }, true);

    function watchCodeTitles() {
        ensureCodeStyle();
        scanCodeTitles(document.body);
        const observer = new MutationObserver((records) => {
            records.forEach((record) => {
                if (record.type === "characterData") {
                    scanCodeTitles(record.target.parentElement);
                    return;
                }
                record.addedNodes.forEach(scanCodeTitles);
            });
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (document.body) {
        watchCodeTitles();
    } else {
        document.addEventListener("DOMContentLoaded", watchCodeTitles);
    }

    // emby/jellyfin CustomEvent
    // see: https://github.com/MediaBrowser/emby-web-defaultskin/blob/822273018b82a4c63c2df7618020fb837656868d/nowplaying/videoosd.js#L691
    // monitor dom changements
    document.addEventListener("viewbeforeshow", function (e) {
        console.log("viewbeforeshow", e);
        if (isEmby === "") {
            isEmby = !!e.detail.contextPath;
        }
        let isItemDetailPage;
        if (isEmby) {
            isItemDetailPage = e.detail.contextPath.startsWith("/item?id=");
        } else {
            isItemDetailPage = e.detail.params && e.detail.params.id;
        }
        if (isItemDetailPage) {
            registerAdditionalPartCommand();
            const mutation = new MutationObserver(function() {
                if (showFlag()) {
                    init();
                    mutation.disconnect();
                }
            })
            mutation.observe(document.body, {
                childList: true,
                characterData: true,
                subtree: true,
            })
        }
    });

})();
