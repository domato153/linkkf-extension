// --- START OF FILE controls.js (v4.1.0 - 자동 마이그레이션 포함, 완전 무결 최종본) ---
// 변경사항: 구버전(v3.x)에서 사용하던 분산된 재생 위치 기록을 새로운 중앙 저장소로
//          자동으로 가져오는 '일회성 데이터 마이그레이션' 기능 추가.
//          이를 통해 코드 업데이트 후에도 기존의 모든 시청 기록이 유지됩니다.

if (typeof window.linkkfExtensionInitialized === 'undefined') {
    window.linkkfExtensionInitialized = true;

    // ===================================================================================
    //  1. 비디오 프레임 기능 (보고자 역할 + 마이그레이션 데이터 제공자)
    // ===================================================================================
    function runVideoFrameFeatures() {
        console.log(`[FRAME] 스크립트 실행됨 (중앙화 모드). 현재 origin: ${window.location.origin}`);

        let currentVideoId = null;
        let progressSaveInterval = null;
        let isFeatureSetupDone = false;
        const urlParams = new URLSearchParams(window.location.search);

        window.addEventListener('message', (event) => {
            if (event.source !== window.top || !event.data?.type) return;

            const { type, payload } = event.data;

            switch (type) {
                case 'LINKKF_REQUEST_MIGRATION_DATA': {
                    let oldProgressData = [];
                    try {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith('linkkf-progress-')) {
                                oldProgressData.push({ key, value: localStorage.getItem(key) });
                            }
                        }
                    } catch (e) {}

                    if (oldProgressData.length > 0) {
                        console.log(`[FRAME] 구버전 데이터 ${oldProgressData.length}개 발견. 최상위 창으로 전송합니다.`);
                        window.top.postMessage({ type: 'LINKKF_RESPONSE_MIGRATION_DATA', payload: oldProgressData }, 'https://linkkf.net');
                    }
                    break;
                }
                case 'LINKKF_RESPONSE_TIME': {
                    if (payload && typeof payload.time === 'number' && isFinite(payload.time)) {
                        const timeToRestore = payload.time;
                        const videoElement = document.querySelector('video.vjs-tech');
                        if (videoElement && timeToRestore > 5 && (!payload.duration || timeToRestore < payload.duration * 0.95)) {
                            console.log(`%c[FRAME] 이어보기 데이터 수신!`, 'color: cyan; font-weight: bold;', `${timeToRestore.toFixed(0)}초부터 재생합니다.`);
                            
                            const applySeek = () => {
                                if (videoElement.currentTime < 3) {
                                    videoElement.currentTime = timeToRestore;
                                }
                            };

                            if (!videoElement.paused) {
                                applySeek();
                            } else {
                                videoElement.addEventListener('play', applySeek, { once: true });
                            }
                        }
                    }
                    break;
                }
            }
        });

        function reportProgress() {
            const videoElement = document.querySelector('video.vjs-tech');
            if (!videoElement || !currentVideoId) return;

            const isPlaying = document.querySelector('.vjs-play-control')?.classList.contains('vjs-playing');
            if ((isPlaying || videoElement.paused) && videoElement.duration > 0 && videoElement.currentTime > 5) {
                const currentTime = videoElement.currentTime;
                const duration = videoElement.duration;

                if (currentTime > duration - 15) {
                    clearProgress();
                    return;
                }
                
                window.top.postMessage({
                    type: 'LINKKF_UPDATE_TIME',
                    payload: {
                        videoId: currentVideoId,
                        time: currentTime,
                        duration: duration,
                        timestamp: Date.now()
                    }
                }, 'https://linkkf.net');
            }
        }

        function clearProgress() {
            if (!currentVideoId) return;
            window.top.postMessage({
                type: 'LINKKF_CLEAR_TIME',
                payload: { videoId: currentVideoId }
            }, 'https://linkkf.net');
            if (progressSaveInterval) clearInterval(progressSaveInterval);
        }

        function setupVideoFeatures(videoElement) {
            if (isFeatureSetupDone) return;
            isFeatureSetupDone = true;

            const rawUrlKey = urlParams.get('url');
            if (!rawUrlKey) return;
            
            currentVideoId = rawUrlKey.split('?')[0].split('#')[0];
            
            console.log(`[FRAME] 최상위 창에 '${currentVideoId}'의 재생 시간 요청...`);
            window.top.postMessage({
                type: 'LINKKF_REQUEST_TIME',
                payload: { videoId: currentVideoId }
            }, 'https://linkkf.net');

            window.addEventListener('keydown', (event) => {
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
                let executed = false;
                const seekAmount = event.ctrlKey ? 5 : 10;
                switch (event.key.toLowerCase()) {
                    case ' ': videoElement.paused ? videoElement.play() : videoElement.pause(); executed = true; break;
                    case 'arrowleft': videoElement.currentTime -= seekAmount; executed = true; break;
                    case 'arrowright': videoElement.currentTime += seekAmount; executed = true; break;
                    case 'f': document.querySelector('.vjs-fullscreen-control')?.click(); executed = true; break;
                    case 'arrowup': videoElement.volume = Math.min(1, videoElement.volume + 0.05); executed = true; break;
                    case 'arrowdown': videoElement.volume = Math.max(0, videoElement.volume - 0.05); executed = true; break;
                }
                if (executed) { event.preventDefault(); event.stopPropagation(); }
            }, { capture: true });

            if (progressSaveInterval) clearInterval(progressSaveInterval);
            progressSaveInterval = setInterval(reportProgress, 3000);
            
            videoElement.addEventListener('pause', reportProgress);
            videoElement.addEventListener('ended', clearProgress);
            window.addEventListener('pagehide', reportProgress);
            
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    reportProgress();
                }
            });
        }
        
        function initializeVideoFinder() {
            const observer = new MutationObserver((mutations, obs) => {
                const videoElement = document.querySelector('video.vjs-tech');
                if (videoElement) {
                    setupVideoFeatures(videoElement);
                    obs.disconnect();
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(() => observer.disconnect(), 30000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeVideoFinder);
        } else {
            initializeVideoFinder();
        }
    }


    // ===================================================================================
    //  2. 최상위 창 기능 (총사령부 역할 + 마이그레이션 실행자)
    // ===================================================================================
    function runTopWindowFeatures() {
        console.log('[TOP] 스크립트 실행됨 (중앙화 모드).');
        let currentTitleInfo = null;
        const MIGRATION_KEY_PREFIX = 'linkkf-migrated-origin-';

        const ProgressStore = {
            KEY: 'linkkf-central-progress',
            _data: null,
            load() {
                if (this._data) return;
                try {
                    this._data = JSON.parse(localStorage.getItem(this.KEY) || '{}');
                } catch (e) {
                    this._data = {};
                }
            },
            save() {
                localStorage.setItem(this.KEY, JSON.stringify(this._data));
            },
            get(videoId) {
                this.load();
                return this._data[videoId] || null;
            },
            set(videoId, progress) {
                this.load();
                this._data[videoId] = progress;
                this.save();
            },
            remove(videoId) {
                this.load();
                delete this._data[videoId];
                this.save();
            },
            getAll() {
                this.load();
                return this._data;
            },
            merge(importedData) {
                this.load();
                for (const videoId in importedData) {
                    if (Object.prototype.hasOwnProperty.call(importedData, videoId)) {
                        const existing = this._data[videoId];
                        const incoming = importedData[videoId];
                        if (!existing || incoming.time > existing.time) {
                            this._data[videoId] = incoming;
                        }
                    }
                }
                this.save();
            }
        };

        function runMigration(iframe) {
            let origin;
            try {
                origin = new URL(iframe.src).origin;
            } catch (e) {
                // Invalid URL, cannot migrate
                return;
            }
            
            const migrationKey = `${MIGRATION_KEY_PREFIX}${origin}`;

            if (localStorage.getItem(migrationKey)) {
                return;
            }

            console.log(`[MIGRATE] '${origin}'에 대한 구버전 데이터 마이그레이션 시작...`);

            iframe.contentWindow.postMessage({ type: 'LINKKF_REQUEST_MIGRATION_DATA' }, '*');

            const migrationListener = (event) => {
                if (event.source !== iframe.contentWindow || event.data?.type !== 'LINKKF_RESPONSE_MIGRATION_DATA') {
                    return;
                }
                
                window.removeEventListener('message', migrationListener);
                
                const dataToMigrate = event.data.payload;
                if (dataToMigrate && dataToMigrate.length > 0) {
                    console.log(`[MIGRATE] '${origin}'으로부터 ${dataToMigrate.length}개의 구버전 데이터를 수신했습니다. 중앙 저장소로 병합합니다.`);
                    const progressToMerge = {};
                    dataToMigrate.forEach(item => {
                        try {
                            const videoIdMatch = item.key.match(/linkkf-progress-(.*?)_/);
                            if (videoIdMatch && videoIdMatch[1]) {
                                const videoId = videoIdMatch[1];
                                const parsedValue = JSON.parse(item.value);
                                if (parsedValue && typeof parsedValue.time === 'number') {
                                    progressToMerge[videoId] = parsedValue;
                                }
                            }
                        } catch(e) {}
                    });
                    ProgressStore.merge(progressToMerge);
                }

                localStorage.setItem(migrationKey, 'true');
                console.log(`[MIGRATE] '${origin}' 마이그레이션 완료.`);
            };

            window.addEventListener('message', migrationListener);
            
            setTimeout(() => {
                window.removeEventListener('message', migrationListener);
            }, 5000);
        }
        
        const iframeObserver = new MutationObserver(() => {
            const iframe = document.querySelector('iframe[src*="myani.app"], iframe[src*="sub3.top"]');
            if (iframe) {
                const handleLoad = () => {
                    if (iframe.contentWindow) {
                        runMigration(iframe);
                    }
                };
                if (document.readyState === 'complete') {
                    handleLoad();
                } else {
                    iframe.addEventListener('load', handleLoad, { once: true });
                }
            }
        });
        iframeObserver.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('message', (event) => {
            if (event.source === window || !event.data?.type) return;
            if (!event.data.type.startsWith('LINKKF_')) return;

            const { type, payload } = event.data;

            switch (type) {
                case 'LINKKF_REQUEST_TIME': {
                    const { videoId } = payload;
                    const progress = ProgressStore.get(videoId);
                    if (event.source.postMessage) {
                       event.source.postMessage({ type: 'LINKKF_RESPONSE_TIME', payload: progress }, event.origin);
                    }
                    break;
                }
                case 'LINKKF_UPDATE_TIME': {
                    const { videoId, time, duration, timestamp } = payload;
                    ProgressStore.set(videoId, { time, duration, timestamp });
                    if (currentTitleInfo) {
                        createHistoryRecord({ time, duration, timestamp });
                    }
                    break;
                }
                case 'LINKKF_CLEAR_TIME': {
                    const { videoId } = payload;
                    ProgressStore.remove(videoId);
                    break;
                }
            }
        });

        function createHistoryRecord(progressData) {
            if (currentTitleInfo && progressData) {
                const episodeUrl = window.location.href;
                const historyKey = `linkkf-history-${currentTitleInfo.animeId}-${currentTitleInfo.episode}`;
                const fullTitle = `${currentTitleInfo.series} ${currentTitleInfo.episode}화`.trim();
                const historyData = {
                    title: fullTitle,
                    url: episodeUrl,
                    time: progressData.time,
                    duration: progressData.duration,
                    timestamp: progressData.timestamp,
                    animeId: currentTitleInfo.animeId
                };
                localStorage.setItem(historyKey, JSON.stringify(historyData));
            }
        }
        
        function setupTitleObserver() {
            const observer = new MutationObserver((mutations) => {
                const titleElement = document.querySelector('.player-tips-title.text-row-2 a');
                if (titleElement) {
                    const fullText = titleElement.parentElement.textContent;
                    const episodeMatch = fullText.match(/Watch\s*([\w-]+)/);
                    const animeIdMatch = titleElement.href.match(/\/ani\/(\d+)\//);

                    if (episodeMatch && animeIdMatch) {
                        const newSeriesTitle = titleElement.textContent.trim();
                        const newEpisode = episodeMatch[1];
                        const newAnimeId = animeIdMatch[1];

                        if (!currentTitleInfo || newEpisode !== currentTitleInfo.episode || newAnimeId !== currentTitleInfo.animeId) {
                            currentTitleInfo = { series: newSeriesTitle, episode: newEpisode, animeId: newAnimeId };
                            console.log('%c[TOP] 새 제목 정보 파싱 완료:', 'color: magenta; font-weight: bold;', currentTitleInfo);
                        }
                    }
                } else {
                    currentTitleInfo = null;
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
        
        function runDataCleanup() {
            const playlistAnimeIds = new Set(PlaylistManager.get().map(item => item.animeId));
            const keysToRemove = [];
            const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('linkkf-history-')) continue;

                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (!data || typeof data.timestamp !== 'number') {
                        keysToRemove.push(key);
                        continue;
                    }

                    const match = key.match(/^linkkf-history-(\d+)-/);
                    const animeId = match ? match[1] : null;

                    if (animeId) {
                        if (!playlistAnimeIds.has(animeId) && data.timestamp < oneYearAgo) {
                            keysToRemove.push(key);
                        }
                    } else if (data.timestamp < oneYearAgo) {
                        keysToRemove.push(key);
                    }
                } catch (e) {
                    keysToRemove.push(key);
                }
            }

            if (keysToRemove.length > 0) {
                keysToRemove.forEach(key => localStorage.removeItem(key));
            }
        }

        function scheduleCleanup() {
            const CLEANUP_KEY = 'linkkf-last-cleanup';
            const lastCleanup = localStorage.getItem(CLEANUP_KEY);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            if (!lastCleanup || (now - parseInt(lastCleanup, 10)) > oneDay) {
                runDataCleanup();
                localStorage.setItem(CLEANUP_KEY, now.toString());
            }
        }

        const HistoryManager = {
            get(limit = 30) {
                let allHistory = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('linkkf-history-')) {
                        try {
                            const data = JSON.parse(localStorage.getItem(key));
                            if (data?.timestamp && data.title) {
                                allHistory.push(data);
                            }
                        } catch (e) {}
                    }
                }
                allHistory.sort((a, b) => b.timestamp - a.timestamp);
                return allHistory.slice(0, limit);
            },
            clearAll() {
                if (!confirm('정말로 모든 시청 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
                
                let keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith('linkkf-history-')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                alert('모든 시청 기록이 삭제되었습니다.');
                UIModule.refreshModal('history');
            }
        };
        
        const PlaylistManager = {
            key: 'linkkf_playlist',
            addCurrent() { 
                const url = window.location.href; 
                let animeId = null, title = ''; 
                const watchMatch = url.match(/\/watch\/(\d+)\//); 
                const aniMatch = url.match(/\/ani\/(\d+)\//); 
                if (watchMatch) { 
                    animeId = watchMatch[1]; 
                    title = currentTitleInfo?.series || document.title.split(' - ')[0].replace(/ BD| 😜/g, '').replace(/\s+\d+$/, '').trim(); 
                } else if (aniMatch) { 
                    animeId = aniMatch[1]; 
                    title = document.querySelector('h1.detail-info-title, h1.page-title')?.textContent.trim() || document.title.split(' - ')[0]; 
                } else return alert('애니메이션 영상 또는 개요 페이지에서만 추가할 수 있습니다.'); 
                
                let playlist = this.get(); 
                if (playlist.some(item => item.animeId === animeId)) return alert('이미 재생목록에 추가된 애니메이션입니다.'); 
                
                playlist.unshift({ title, animeId, seriesUrl: `https://linkkf.net/ani/${animeId}/` }); 
                localStorage.setItem(this.key, JSON.stringify(playlist)); 
                alert(`'${title}'이(가) 재생목록에 추가되었습니다.`); 
                UIModule.refreshModal('playlist'); 
            },
            get() { return JSON.parse(localStorage.getItem(this.key) || '[]'); },
            remove(animeId) { let playlist = this.get(); playlist = playlist.filter(item => item.animeId !== animeId); localStorage.setItem(this.key, JSON.stringify(playlist)); UIModule.refreshModal('playlist'); },
            moveToTop(animeId) {
                let playlist = this.get();
                const itemIndex = playlist.findIndex(item => item.animeId === animeId);
                if (itemIndex > 0) {
                    const [item] = playlist.splice(itemIndex, 1);
                    playlist.unshift(item);
                    localStorage.setItem(this.key, JSON.stringify(playlist));
                }
            },
            findLastWatchedEpisode(animeId) {
                let specificAnimeHistory = [];
                const searchKeyPrefix = `linkkf-history-${animeId}-`;

                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(searchKeyPrefix)) {
                        try {
                            const data = JSON.parse(localStorage.getItem(key));
                            if (data && data.timestamp && data.url) {
                                specificAnimeHistory.push(data);
                            }
                        } catch (e) {}
                    }
                }

                if (specificAnimeHistory.length === 0) {
                    return null;
                }

                specificAnimeHistory.sort((a, b) => b.timestamp - a.timestamp);
                return specificAnimeHistory[0].url;
            },
            clearAll() {
                if (!confirm('정말로 재생목록 전체를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
                localStorage.removeItem(this.key);
                alert('재생목록이 모두 삭제되었습니다.');
                UIModule.refreshModal('playlist');
            }
        };
        
        const BackupManager = {
            gatherDataForBackup() {
                const backupData = {
                    progress: ProgressStore.getAll(),
                    playlist: [],
                    history: []
                };

                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                        if (key === PlaylistManager.key) {
                            backupData.playlist.push({ key, value: localStorage.getItem(key) });
                        } else if (key.startsWith('linkkf-history-')) {
                            backupData.history.push({ key, value: localStorage.getItem(key) });
                        }
                    }
                }
                return backupData;
            },
            exportToFile(buttonElement) {
                buttonElement.disabled = true;
                buttonElement.textContent = '내보내는 중...';
                const data = this.gatherDataForBackup();
                buttonElement.disabled = false;
                buttonElement.textContent = '파일로 다운로드';
                const progressDataSize = Object.keys(data.progress).length;
                if (progressDataSize === 0 && data.playlist.length === 0 && data.history.length === 0) {
                    return alert('백업할 데이터가 없습니다.');
                }
                const jsonString = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `linkkf_backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            },
            async exportToClipboard(buttonElement) {
                buttonElement.disabled = true;
                buttonElement.textContent = '복사하는 중...';
                const data = await this.gatherDataForBackup();
                buttonElement.disabled = false;
                buttonElement.textContent = '클립보드에 복사';
                const progressDataSize = Object.keys(data.progress).length;
                if (progressDataSize === 0 && data.playlist.length === 0 && data.history.length === 0) {
                    return alert('백업할 데이터가 없습니다.');
                }
                const jsonString = JSON.stringify(data);
                try {
                    await navigator.clipboard.writeText(jsonString);
                    alert('백업 데이터가 클립보드에 복사되었습니다.');
                } catch (err) {
                    alert('클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.');
                }
            },
            async mergeData(importedData) {
                if(importedData.playlist && Array.isArray(importedData.playlist)) {
                    const currentPlaylist = PlaylistManager.get();
                    const importedPlaylistItems = importedData.playlist.length > 0 ? JSON.parse(importedData.playlist[0].value || '[]') : [];
                    const currentPlaylistIds = new Set(currentPlaylist.map(item => item.animeId));
                    importedPlaylistItems.forEach(itemToImport => {
                        if (itemToImport && itemToImport.animeId && !currentPlaylistIds.has(itemToImport.animeId)) {
                            currentPlaylist.push(itemToImport);
                        }
                    });
                    localStorage.setItem(PlaylistManager.key, JSON.stringify(currentPlaylist));
                }
                if(importedData.history && Array.isArray(importedData.history)) {
                    importedData.history.forEach(itemToImport => {
                        try {
                            const currentRaw = localStorage.getItem(itemToImport.key);
                            const importedParsed = JSON.parse(itemToImport.value);
                            if (!importedParsed || typeof importedParsed.time !== 'number') return;
                            if (currentRaw) {
                                const currentParsed = JSON.parse(currentRaw);
                                if (importedParsed.time > currentParsed.time) {
                                    localStorage.setItem(itemToImport.key, itemToImport.value);
                                }
                            } else {
                                localStorage.setItem(itemToImport.key, itemToImport.value);
                            }
                        } catch (e) {}
                    });
                }
                if (importedData.progress && typeof importedData.progress === 'object') {
                    ProgressStore.merge(importedData.progress);
                }
            },
            async importData(jsonString, buttonElement) {
                buttonElement.disabled = true;
                buttonElement.textContent = '불러오는 중...';

                if (!jsonString || !jsonString.trim()) {
                    buttonElement.disabled = false;
                    buttonElement.textContent = '불러오기';
                    return alert('붙여넣거나 선택한 데이터가 없습니다.');
                }
                try {
                    const importedData = JSON.parse(jsonString);
                    if (!importedData || typeof importedData !== 'object' || !importedData.progress || !importedData.playlist || !importedData.history) {
                        throw new Error('올바르지 않은 백업 파일 형식입니다.');
                    }
                    if (confirm('백업 데이터를 불러오시겠습니까? 기존 데이터와 병합되며, 일부는 덮어쓰기 될 수 있습니다.')) {
                        await this.mergeData(importedData);
                        alert('데이터 불러오기가 완료되었습니다!');
                        UIModule.refreshModal('history');
                        UIModule.refreshModal('playlist');
                    }
                } catch (e) {
                    alert(`데이터를 불러오는 중 오류가 발생했습니다: ${e.message}`);
                } finally {
                    buttonElement.disabled = false;
                    buttonElement.textContent = '불러오기';
                }
            }
        };
        
        const UIModule = {
            fab: null, isPressed: false, isDragging: false, dragStartPos: { x: 0, y: 0 }, fabStartPos: { left: 0, top: 0 }, 
            currentModal: null, 
            modalState: { isDragging: false, isResizing: false, isPinching: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, startWidth: 0, startHeight: 0, initialPinchDistance: 0 },
            modalResizeObserver: null,
            init() { this.injectStyles(); this.createFAB(); }, 
            injectStyles() {
                const css = `
                    .kf-fab-container { position: fixed; bottom: 30px; right: 30px; z-index: 99999; }
                    .kf-fab-main { position: relative; border-radius: 28px; background-color: #6200ee; color: white; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2); transition: all 0.2s ease-in-out; user-select: none; z-index: 1; padding: 16px; font-size: 16px; }
                    .kf-fab-sub-wrapper { position: absolute; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
                    .kf-fab-container.expand-up .kf-fab-sub-wrapper { bottom: 100%; padding-bottom: 12px; flex-direction: column-reverse; }
                    .kf-fab-container.expand-down .kf-fab-sub-wrapper { top: 100%; padding-top: 12px; }
                    .kf-fab-container.open .kf-fab-sub-wrapper { visibility: visible; opacity: 1; }
                    .kf-fab-sub { background-color: #3700b3; color: white; border-radius: 24px; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2); user-select: none; margin-bottom: 12px; padding: 12px 16px; white-space: nowrap; }
                    .kf-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); z-index: 100000; display: flex; justify-content: center; align-items: center; }
                    .kf-modal-content { position: absolute; background: #2e2e2e; color: #f1f1f1; border-radius: 8px; width: 90%; max-width: 500px; min-width: 300px; max-height: 80vh; min-height: 200px; display: flex; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); resize: both; overflow: hidden; } 
                    .kf-modal-header { padding: 12px 16px; border-bottom: 1px solid #444; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; } 
                    .kf-modal-header-actions { display: flex; align-items: center; }
                    .kf-modal-header button { background: #6200ee; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-right: 16px; }
                    .kf-modal-header .kf-clear-btn { background: #b00020; }
                    .kf-modal-title { font-size: 1.2em; font-weight: bold; pointer-events: none; margin-right: auto; } 
                    .kf-modal-close { font-size: 1.5em; cursor: pointer; } 
                    .kf-modal-body { padding: 16px; overflow-y: auto; flex-grow: 1; }
                    .kf-modal-list-item { display: flex; align-items: center; padding: 12px 8px; border-bottom: 1px solid #444; cursor: pointer; }
                    .kf-modal-list-item:hover { background-color: #444; }
                    .kf-item-title { flex-grow: 1; margin-right: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .kf-item-info { font-size: 0.8em; color: #aaa; margin-left: 10px; white-space: nowrap; }
                    .kf-item-actions { display: flex; align-items: center; flex-shrink: 0; justify-content: flex-end; margin-left: auto; }
                    .kf-item-actions button { background: #6200ee; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-left: 8px; }
                    .kf-item-actions .kf-delete-btn { background: #b00020; }
                    .kf-modal-resize-handle-nw { position: absolute; top: 0; left: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 10; border-top: 3px solid rgba(255,255,255,0.4); border-left: 3px solid rgba(255,255,255,0.4); border-top-left-radius: 8px; }
                    .kf-modal-resize-handle-se { position: absolute; bottom: 0; right: 0; width: 20px; height: 20px; cursor: nwse-resize; z-index: 10; border-bottom: 3px solid rgba(255,255,255,0.4); border-right: 3px solid rgba(255,255,255,0.4); border-bottom-right-radius: 8px; }
                `;
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
            }, 
            createFAB() {
                this.fab = document.createElement('div');
                this.fab.className = 'kf-fab-container';
                this.fab.innerHTML = `<div class="kf-fab-sub-wrapper">
                    <div class="kf-fab-sub" data-action="history" title="시청 기록">시청기록</div>
                    <div class="kf-fab-sub" data-action="playlist" title="재생목록">재생목록</div>
                    <div class="kf-fab-sub" data-action="backup" title="데이터 백업/복원">백업/복원</div>
                </div>
                <div class="kf-fab-main" title="편의기능">편의기능</div>`;
                document.body.appendChild(this.fab);
                const mainBtn = this.fab.querySelector('.kf-fab-main');

                const onFabInteractionStart = (e) => {
                    if (e.type === 'mousedown' && e.button !== 0) return;
                    this.isPressed = true; this.isDragging = false;
                    const event = e.touches ? e.touches[0] : e;
                    this.dragStartPos = { x: event.clientX, y: event.clientY };
                    const rect = this.fab.getBoundingClientRect();
                    this.fabStartPos = { left: rect.left, top: rect.top };
                    document.addEventListener('mousemove', onFabInteractionMove);
                    document.addEventListener('touchmove', onFabInteractionMove, { passive: false });
                    document.addEventListener('mouseup', onFabInteractionEnd, { once: true });
                    document.addEventListener('touchend', onFabInteractionEnd, { once: true });
                };

                const onFabInteractionMove = (e) => {
                    if (!this.isPressed) return;
                    const event = e.touches ? e.touches[0] : e;
                    const dx = event.clientX - this.dragStartPos.x; const dy = event.clientY - this.dragStartPos.y;
                    if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        this.isDragging = true;
                        this.fab.style.transition = 'none'; this.fab.style.right = 'auto'; this.fab.style.bottom = 'auto';
                    }
                    if (this.isDragging) {
                        if (e.cancelable) e.preventDefault();
                        let newX = this.fabStartPos.left + dx; let newY = this.fabStartPos.top + dy;
                        newX = Math.max(0, Math.min(newX, window.innerWidth - this.fab.offsetWidth));
                        newY = Math.max(0, Math.min(newY, window.innerHeight - this.fab.offsetHeight));
                        this.fab.style.left = `${newX}px`; this.fab.style.top = `${newY}px`;
                    }
                };
                
                const onFabInteractionEnd = (e) => {
                    if (!this.isPressed) return;
                    if (this.isDragging) { this.fab.style.transition = ''; } 
                    else {
                        this.toggleFAB();
                        if (e.type === 'touchend' && e.cancelable) e.preventDefault();
                    }
                    this.isPressed = false; this.isDragging = false;
                    document.removeEventListener('mousemove', onFabInteractionMove);
                    document.removeEventListener('touchmove', onFabInteractionMove);
                };
                
                mainBtn.addEventListener('mousedown', onFabInteractionStart);
                mainBtn.addEventListener('touchstart', onFabInteractionStart, { passive: false });
                this.fab.querySelectorAll('.kf-fab-sub').forEach(btn => {
                    btn.addEventListener('click', (e) => this.handleFABAction(e.currentTarget.dataset.action));
                });
            },
            toggleFAB() {
                const fabRect = this.fab.getBoundingClientRect();
                if (fabRect.top + fabRect.height > window.innerHeight / 2) {
                    this.fab.classList.add('expand-up'); this.fab.classList.remove('expand-down');
                } else {
                    this.fab.classList.add('expand-down'); this.fab.classList.remove('expand-up');
                }
                this.fab.classList.toggle('open');
            },
            saveModalGeometry(type, modal) {
                const geometry = {
                    left: modal.offsetLeft,
                    top: modal.offsetTop,
                    width: modal.offsetWidth,
                    height: modal.offsetHeight
                };
                const allGeometries = JSON.parse(localStorage.getItem('linkkf-modal-geometries') || '{}');
                allGeometries[type] = geometry;
                localStorage.setItem('linkkf-modal-geometries', JSON.stringify(allGeometries));
            },
            loadModalGeometry(type, modal) {
                const allGeometries = JSON.parse(localStorage.getItem('linkkf-modal-geometries') || '{}');
                const geometry = allGeometries[type];
                if (geometry) {
                    const clampedLeft = Math.max(0, Math.min(geometry.left, window.innerWidth - geometry.width));
                    const clampedTop = Math.max(0, Math.min(geometry.top, window.innerHeight - geometry.height));
                    modal.style.left = `${clampedLeft}px`; modal.style.top = `${clampedTop}px`;
                    modal.style.width = `${geometry.width}px`; modal.style.height = `${geometry.height}px`;
                }
            },
            handleFABAction(action) {
                if (action === 'history') this.showHistoryModal();
                if (action === 'playlist') this.showPlaylistModal();
                if (action === 'backup') this.showBackupModal();
            },
            showModal(type, title, content, headerActions = []) {
                this.closeModal();
                this.currentModal = type;
                const overlay = document.createElement('div');
                overlay.className = 'kf-modal-overlay';
                
                overlay.innerHTML = `<div class="kf-modal-content">
                    <div class="kf-modal-resize-handle-nw" title="크기 조절"></div>
                    <div class="kf-modal-resize-handle-se" title="크기 조절"></div>
                    <div class="kf-modal-header">
                        <span class="kf-modal-title">${title}</span>
                        <div class="kf-modal-header-actions"></div>
                        <span class="kf-modal-close">×</span>
                    </div>
                    <div class="kf-modal-body"></div>
                </div>`;
                document.body.appendChild(overlay);

                const modalContent = overlay.querySelector('.kf-modal-content');
                modalContent.querySelector('.kf-modal-body').appendChild(content);

                const actionsContainer = modalContent.querySelector('.kf-modal-header-actions');
                headerActions.forEach(actionEl => { actionsContainer.appendChild(actionEl); });
                overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });
                modalContent.querySelector('.kf-modal-close').addEventListener('click', () => this.closeModal());
                
                this.loadModalGeometry(type, modalContent);
                this.addModalEventListeners(type, modalContent);
            },
            addModalEventListeners(type, modal) {
                const header = modal.querySelector('.kf-modal-header');
                const resizeHandleNW = modal.querySelector('.kf-modal-resize-handle-nw');
                const resizeHandleSE = modal.querySelector('.kf-modal-resize-handle-se');

                const onDragStart = (e) => {
                    if (this.modalState.isPinching) return;
                    this.modalState.isDragging = true;
                    const event = e.touches ? e.touches[0] : e;
                    this.modalState.startX = event.clientX; this.modalState.startY = event.clientY;
                    this.modalState.startLeft = modal.offsetLeft; this.modalState.startTop = modal.offsetTop;
                    document.body.style.userSelect = 'none'; document.body.style.cursor = 'move';
                    document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd);
                    document.addEventListener('touchmove', onDragMove, { passive: false }); document.addEventListener('touchend', onDragEnd);
                };
                const onDragMove = (e) => {
                    if (!this.modalState.isDragging) return; if (e.cancelable) e.preventDefault();
                    const event = e.touches ? e.touches[0] : e;
                    const dx = event.clientX - this.modalState.startX; const dy = event.clientY - this.modalState.startY;
                    let newLeft = this.modalState.startLeft + dx; let newTop = this.modalState.startTop + dy;
                    const maxLeft = window.innerWidth - modal.offsetWidth; const maxTop = window.innerHeight - modal.offsetHeight;
                    newLeft = Math.max(0, Math.min(newLeft, maxLeft)); newTop = Math.max(0, Math.min(newTop, maxTop));
                    modal.style.left = `${newLeft}px`; modal.style.top = `${newTop}px`;
                };
                const onDragEnd = () => {
                    if (!this.modalState.isDragging) return; this.modalState.isDragging = false;
                    document.body.style.userSelect = ''; document.body.style.cursor = '';
                    document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragEnd);
                    document.removeEventListener('touchmove', onDragMove); document.removeEventListener('touchend', onDragEnd);
                    this.saveModalGeometry(type, modal);
                };
                header.addEventListener('mousedown', onDragStart); header.addEventListener('touchstart', onDragStart, { passive: false });
                
                let currentResizeDirection = null;
                const onResizeStart = (e, direction) => {
                    if (this.modalState.isPinching) return; e.stopPropagation();
                    currentResizeDirection = direction; this.modalState.isResizing = true;
                    const event = e.touches ? e.touches[0] : e;
                    this.modalState.startX = event.clientX; this.modalState.startY = event.clientY;
                    this.modalState.startLeft = modal.offsetLeft; this.modalState.startTop = modal.offsetTop;
                    this.modalState.startWidth = modal.offsetWidth; this.modalState.startHeight = modal.offsetHeight;
                    document.body.style.userSelect = 'none'; document.body.style.cursor = 'nwse-resize';
                    document.addEventListener('mousemove', onResizeMove); document.addEventListener('mouseup', onResizeEnd);
                    document.addEventListener('touchmove', onResizeMove, { passive: false }); document.addEventListener('touchend', onResizeEnd);
                };
                const onResizeMove = (e) => {
                    if (!this.modalState.isResizing) return; if (e.cancelable) e.preventDefault();
                    const event = e.touches ? e.touches[0] : e;
                    const dx = event.clientX - this.modalState.startX; const dy = event.clientY - this.modalState.startY;
                    const minWidth = parseInt(getComputedStyle(modal).minWidth); const minHeight = parseInt(getComputedStyle(modal).minHeight);
                    if (currentResizeDirection === 'nw') {
                        let newWidth = this.modalState.startWidth - dx; let newHeight = this.modalState.startHeight - dy;
                        if (newWidth > minWidth) { modal.style.width = `${newWidth}px`; modal.style.left = `${this.modalState.startLeft + dx}px`; }
                        if (newHeight > minHeight) { modal.style.height = `${newHeight}px`; modal.style.top = `${this.modalState.startTop + dy}px`; }
                    } else if (currentResizeDirection === 'se') {
                        let newWidth = this.modalState.startWidth + dx; let newHeight = this.modalState.startHeight + dy;
                        if (newWidth > minWidth) { modal.style.width = `${newWidth}px`; }
                        if (newHeight > minHeight) { modal.style.height = `${newHeight}px`; }
                    }
                };
                const onResizeEnd = () => {
                    if (!this.modalState.isResizing) return; this.modalState.isResizing = false;
                    document.body.style.userSelect = ''; document.body.style.cursor = '';
                    document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('mouseup', onResizeEnd);
                    document.removeEventListener('touchmove', onResizeMove); document.removeEventListener('touchend', onResizeEnd);
                    this.saveModalGeometry(type, modal);
                };
                resizeHandleNW.addEventListener('mousedown', (e) => onResizeStart(e, 'nw'));
                resizeHandleNW.addEventListener('touchstart', (e) => onResizeStart(e, 'nw'), { passive: false });
                resizeHandleSE.addEventListener('mousedown', (e) => onResizeStart(e, 'se'));
                resizeHandleSE.addEventListener('touchstart', (e) => onResizeStart(e, 'se'), { passive: false });

                const getDistance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
                const onPinchStart = (e) => {
                    if (e.touches.length !== 2) return;
                    e.preventDefault();
                    this.modalState.isPinching = true;
                    this.modalState.isDragging = false; this.modalState.isResizing = false;
                    this.modalState.initialPinchDistance = getDistance(e.touches);
                    this.modalState.startWidth = modal.offsetWidth;
                    this.modalState.startHeight = modal.offsetHeight;
                    this.modalState.startLeft = modal.offsetLeft;
                    this.modalState.startTop = modal.offsetTop;
                    document.addEventListener('touchmove', onPinchMove, { passive: false });
                    document.addEventListener('touchend', onPinchEnd, { once: true });
                };
                const onPinchMove = (e) => {
                    if (!this.modalState.isPinching || e.touches.length !== 2) return;
                    e.preventDefault();
                    const currentDist = getDistance(e.touches);
                    const scale = currentDist / this.modalState.initialPinchDistance;
                    const newWidth = this.modalState.startWidth * scale;
                    const newHeight = this.modalState.startHeight * scale;
                    const minWidth = parseInt(getComputedStyle(modal).minWidth);
                    const minHeight = parseInt(getComputedStyle(modal).minHeight);
                    if (newWidth < minWidth || newHeight < minHeight) return;

                    const rect = modal.getBoundingClientRect();
                    const oldCenterX = rect.left + rect.width / 2;
                    const oldCenterY = rect.top + rect.height / 2;
                    const newCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const newCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    
                    const newLeft = this.modalState.startLeft + (newCenterX - oldCenterX);
                    const newTop = this.modalState.startTop + (newCenterY - oldCenterY);

                    modal.style.width = `${newWidth}px`;
                    modal.style.height = `${newHeight}px`;
                    modal.style.left = `${newLeft}px`;
                    modal.style.top = `${newTop}px`;
                };
                const onPinchEnd = () => {
                    this.modalState.isPinching = false;
                    document.removeEventListener('touchmove', onPinchMove);
                    this.saveModalGeometry(type, modal);
                };
                modal.addEventListener('touchstart', onPinchStart, { passive: false });

                if (this.modalResizeObserver) this.modalResizeObserver.disconnect();
                this.modalResizeObserver = new ResizeObserver(() => { this.saveModalGeometry(type, modal); });
                this.modalResizeObserver.observe(modal);
            },
            refreshModal(type) {
                if (this.currentModal === type) {
                    this.closeModal();
                    if (type === 'history') this.showHistoryModal();
                    if (type === 'playlist') this.showPlaylistModal();
                    if (type === 'backup') this.showBackupModal();
                }
            }, 
            showHistoryModal() {
                const history = HistoryManager.get();
                const listContainer = document.createElement('div');
                if (history.length === 0) { listContainer.textContent = '시청 기록이 없습니다. 영상을 5초 이상 시청하면 기록이 추가됩니다.'; } 
                else {
                    history.forEach(item => {
                        const progress = item.duration > 0 ? Math.round((item.time / item.duration) * 100) : 0;
                        const el = document.createElement('div');
                        el.className = 'kf-modal-list-item';
                        el.innerHTML = `<span class="kf-item-title">${item.title}</span><span class="kf-item-info">(${progress}%)</span>`;
                        el.addEventListener('click', () => { window.location.href = item.url; });
                        listContainer.appendChild(el);
                    });
                }
                const clearButton = document.createElement('button');
                clearButton.textContent = '전체 기록 삭제';
                clearButton.className = 'kf-clear-btn';
                clearButton.addEventListener('click', () => HistoryManager.clearAll());
                this.showModal('history', '시청 기록 (최근 본 순서)', listContainer, [clearButton]);
            }, 
            showPlaylistModal() {
                const playlist = PlaylistManager.get();
                const listContainer = document.createElement('div');
                if (playlist.length === 0) { listContainer.textContent = '재생목록이 비어있습니다.'; } 
                else {
                    playlist.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'kf-modal-list-item';
                        el.innerHTML = `<span class="kf-item-title">${item.title}</span><div class="kf-item-actions"><button class="kf-continue-btn">이어보기</button><button class="kf-ep1-btn">1화부터</button><button class="kf-delete-btn" title="삭제">X</button></div>`;
                        
                        el.querySelector('.kf-ep1-btn').addEventListener('click', (e) => { 
                            e.stopPropagation(); 
                            PlaylistManager.moveToTop(item.animeId);
                            window.location.href = `https://linkkf.net/watch/${item.animeId}/a1/k1/`; 
                        });
                        
                        el.querySelector('.kf-continue-btn').addEventListener('click', (e) => { 
                            e.stopPropagation(); 
                            PlaylistManager.moveToTop(item.animeId);
                            const lastWatchedUrl = PlaylistManager.findLastWatchedEpisode(item.animeId); 
                            if (lastWatchedUrl) { 
                                window.location.href = lastWatchedUrl; 
                            } else { 
                                alert('이 애니메이션의 시청 기록이 없습니다. 1화부터 시작합니다.'); 
                                window.location.href = `https://linkkf.net/watch/${item.animeId}/a1/k1/`; 
                            } 
                        });
                        
                        el.querySelector('.kf-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`'${item.title}'을(를) 재생목록에서 삭제하시겠습니까?`)) { PlaylistManager.remove(item.animeId); } });
                        listContainer.appendChild(el);
                    });
                }
                const clearButton = document.createElement('button');
                clearButton.textContent = '전체 삭제';
                clearButton.className = 'kf-clear-btn';
                clearButton.addEventListener('click', () => PlaylistManager.clearAll());
                const addButton = document.createElement('button');
                addButton.textContent = '현재 애니 추가';
                addButton.title = '현재 애니메이션을 재생목록에 추가';
                addButton.addEventListener('click', () => PlaylistManager.addCurrent());
                this.showModal('playlist', '재생목록', listContainer, [clearButton, addButton]);
            },
            showBackupModal() {
                const content = document.createElement('div');
                content.style.cssText = 'display: flex; flex-direction: column; gap: 24px;';
                content.innerHTML = `
                    <div>
                        <h4 style="margin-top:0; margin-bottom: 8px; font-size: 1.1em;">내보내기</h4>
                        <p style="font-size: 0.9em; color: #ccc; margin-top:0; margin-bottom: 12px;">현재 모든 데이터를 파일로 저장하거나 클립보드에 복사합니다.</p>
                        <button id="kf-backup-export-file" style="background: #0d6efd; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; margin-right: 10px; font-size: 0.9em;">파일로 다운로드</button>
                        <button id="kf-backup-export-clipboard" style="background: #198754; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em;">클립보드에 복사</button>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #444;">
                    <div>
                        <h4 style="margin-top:0; margin-bottom: 8px; font-size: 1.1em;">불러오기</h4>
                        <p style="font-size: 0.9em; color: #ccc; margin-top:0; margin-bottom: 12px;">백업 파일을 선택하거나, 백업 데이터를 아래에 붙여넣으세요.</p>
                        <div style="border: 1px solid #555; padding: 8px; border-radius: 4px; margin-bottom: 10px;">
                           <input type="file" id="kf-backup-import-file" accept=".json,text/plain" style="font-size: 0.9em;">
                        </div>
                        <textarea id="kf-backup-import-text" placeholder="또는, 백업 데이터를 여기에 붙여넣으세요..." style="width: 95%; height: 100px; background: #222; color: #f1f1f1; border: 1px solid #555; border-radius: 4px; padding: 10px; resize: vertical; font-family: monospace;"></textarea>
                        <button id="kf-backup-import-execute" style="background: #0d6efd; color: white; border: none; padding: 12px 15px; border-radius: 4px; cursor: pointer; margin-top: 12px; width: 100%; font-size: 1em; font-weight: bold;">불러오기</button>
                    </div>
                `;
        
                content.querySelector('#kf-backup-export-file').addEventListener('click', (e) => BackupManager.exportToFile(e.currentTarget));
                content.querySelector('#kf-backup-export-clipboard').addEventListener('click', (e) => BackupManager.exportToClipboard(e.currentTarget));
                content.querySelector('#kf-backup-import-execute').addEventListener('click', (e) => {
                    const text = content.querySelector('#kf-backup-import-text').value;
                    BackupManager.importData(text, e.currentTarget);
                });
                content.querySelector('#kf-backup-import-file').addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            content.querySelector('#kf-backup-import-text').value = e.target.result;
                        };
                        reader.readAsText(file);
                    }
                });
        
                this.showModal('backup', '데이터 백업/복원', content);
            },
            closeModal() {
                if (this.modalResizeObserver) { this.modalResizeObserver.disconnect(); this.modalResizeObserver = null; }
                const overlay = document.querySelector('.kf-modal-overlay');
                if (overlay) { overlay.remove(); }
                this.currentModal = null;
            }, 
        };
        
        scheduleCleanup();
        setupTitleObserver();
        UIModule.init();
    }

    // ===================================================================================
    //  최종 실행 로직
    // ===================================================================================
    let isTopWindow = false;
    try {
        isTopWindow = (window.self === window.top);
    } catch (e) {
        isTopWindow = false;
    }

    if (isTopWindow && window.location.hostname.includes('linkkf')) {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runTopWindowFeatures); }
        else { runTopWindowFeatures(); }
    } else if (!isTopWindow) {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runVideoFrameFeatures); } 
        else { runVideoFrameFeatures(); }
    }
}