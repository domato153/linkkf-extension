// --- START OF FILE controls.js (v3.0.1 - 재생 중 백업 시 실시간 위치 저장 기능 수정) ---

if (typeof window.linkkfExtensionInitialized === 'undefined') {
    window.linkkfExtensionInitialized = true;

    // ===================================================================================
    //  1. 비디오 프레임 기능 (통신 허브 역할 추가)
    // ===================================================================================
    function runVideoFrameFeatures() {
        console.log(`[FRAME] 스크립트 실행됨. 현재 origin: ${window.location.origin}`);

        const SAVE_SLOT_COUNT = 3;
        let currentSlotIndex = 0;
        let videoId_base = null;
        let progressSaveInterval = null;
        let isFeatureSetupDone = false;
        const urlParams = new URLSearchParams(window.location.search);

        // saveProgress 함수를 외부에서 접근할 수 있도록 전역 스코프에 가까운 곳에 정의합니다.
        // setupVideoFeatures가 실행되어야 실제 동작하는 함수가 할당됩니다.
        let saveProgress = () => {}; 

        window.addEventListener('message', (event) => {
            if (event.source !== window.top && event.source !== window.parent) return;
            const messageType = event.data?.type;
            if (!messageType) return;
    
            let hasProgressData = false;
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('linkkf-progress-')) {
                        hasProgressData = true;
                        break;
                    }
                }
            } catch (e) {}

            if (hasProgressData) {
                console.log(`[FRAME][${window.location.origin}] >> 최종 타겟 << 메시지("${messageType}") 수신!`);
    
                const sendProgressDataToTop = () => {
                    let progressData = [];
                    try {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith('linkkf-progress-')) {
                                progressData.push({ key, value: localStorage.getItem(key) });
                            }
                        }
                    } catch (e) {}
                    window.top.postMessage({ type: 'LINKKF_RESPONSE_PROGRESS_DATA', payload: progressData }, 'https://linkkf.net');
                };

                switch (messageType) {
                    case 'LINKKF_SAVE_AND_REQUEST_PROGRESS_DATA': {
                        console.log('[FRAME] 즉시 저장 후 데이터 전송 요청 수신.');
                        if (typeof saveProgress === 'function') {
                            saveProgress(); // ★★★ 핵심 수정: 현재 재생 위치를 즉시 저장합니다.
                        }
                        sendProgressDataToTop(); // 저장 후 데이터를 보냅니다.
                        break;
                    }
                    case 'LINKKF_REQUEST_PROGRESS_DATA': {
                        // 기존 요청 방식도 호환성을 위해 유지합니다.
                        sendProgressDataToTop();
                        break;
                    }
                    case 'LINKKF_RESTORE_PROGRESS_DATA': {
                        const dataToRestore = event.data.payload;
                        if (Array.isArray(dataToRestore)) {
                            dataToRestore.forEach(item => {
                                try {
                                    const currentDataRaw = localStorage.getItem(item.key);
                                    const newData = JSON.parse(item.value);
                                    
                                    if (currentDataRaw) {
                                        const currentData = JSON.parse(currentDataRaw);
                                        if (newData.time > currentData.time) {
                                            localStorage.setItem(item.key, item.value);
                                        }
                                    } else {
                                        localStorage.setItem(item.key, item.value);
                                    }
                                } catch(e) {}
                            });
                            window.top.postMessage({ type: 'LINKKF_RESTORE_ACK' }, 'https://linkkf.net');
                        }
                        break;
                    }
                }
            }
            else {
                console.log(`[FRAME][${window.location.origin}] >> 릴레이 << 메시지("${messageType}") 수신! 자식 프레임에 전달합니다.`);
                for (let i = 0; i < window.frames.length; i++) {
                    window.frames[i].postMessage(event.data, '*');
                }
            }
        });

        function setupVideoFeatures(videoElement) {
            if (isFeatureSetupDone) return;
            isFeatureSetupDone = true;

            const rawUrlKey = urlParams.get('url');
            if (!rawUrlKey) return;
            
            const normalizedUrlKey = rawUrlKey.split('?')[0].split('#')[0];
            videoId_base = `linkkf-progress-${normalizedUrlKey}`;

            const loadProgress = () => {
                if (!videoId_base) return;
                let validSaves = [];
                for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
                    const key = `${videoId_base}_${i}`;
                    const rawData = localStorage.getItem(key);
                    if (rawData) {
                        try {
                            const data = JSON.parse(rawData);
                            if (data && typeof data.time === 'number' && isFinite(data.time) && data.time > 5 && data.time < data.duration * 0.95) {
                                validSaves.push(data);
                            }
                        } catch (e) { localStorage.removeItem(key); }
                    }
                }
                if (validSaves.length > 0) {
                    validSaves.sort((a, b) => b.timestamp - a.timestamp);
                    const timeToRestore = validSaves[0].time;
                    console.log(`%c[FRAME] 이어보기 데이터 발견!`, 'color: cyan; font-weight: bold;', `${timeToRestore.toFixed(0)}초부터 재생합니다.`);
                    videoElement.addEventListener('play', () => {
                        if (videoElement.currentTime < 3) videoElement.currentTime = timeToRestore;
                    }, { once: true });
                }
            };

            // saveProgress 함수에 실제 로직 할당
            saveProgress = () => {
                const isPlaying = document.querySelector('.vjs-play-control')?.classList.contains('vjs-playing');
                if (videoId_base && (isPlaying || videoElement.paused) && videoElement.duration > 0 && videoElement.currentTime > 5) {
                    try {
                        const currentTime = videoElement.currentTime;
                        const duration = videoElement.duration;
                        if (currentTime > duration - 15) { clearProgress(); return; }
                        const dataToSave = { time: currentTime, duration: duration, timestamp: Date.now() };
                        localStorage.setItem(`${videoId_base}_${currentSlotIndex}`, JSON.stringify(dataToSave));
                        currentSlotIndex = (currentSlotIndex + 1) % SAVE_SLOT_COUNT;
                        window.top.postMessage({ type: 'LINKKF_PROGRESS_UPDATE', payload: { time: currentTime, duration: duration, timestamp: Date.now() } }, 'https://linkkf.net');
                    } catch (e) {}
                }
            };

            const clearProgress = () => {
                if (!videoId_base) return;
                for (let i = 0; i < SAVE_SLOT_COUNT; i++) localStorage.removeItem(`${videoId_base}_${i}`);
                if (progressSaveInterval) clearInterval(progressSaveInterval);
            };

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

            loadProgress();
            if (progressSaveInterval) clearInterval(progressSaveInterval);
            progressSaveInterval = setInterval(saveProgress, 3000);
            
            videoElement.addEventListener('pause', saveProgress);
            videoElement.addEventListener('ended', clearProgress);
            window.addEventListener('pagehide', saveProgress);
            
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    saveProgress();
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
    //  2. 최상위 창 기능
    // ===================================================================================
    function runTopWindowFeatures() {
        console.log('[TOP] 스크립트 실행됨.');
        let currentTitleInfo = null;
        let pendingProgressData = null;

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
                console.log(`[CLEANUP] ${keysToRemove.length}개의 오래된 시청 기록을 삭제합니다.`);
                keysToRemove.forEach(key => localStorage.removeItem(key));
            } else {
                console.log('[CLEANUP] 삭제할 오래된 데이터가 없습니다.');
            }
        }

        function scheduleCleanup() {
            const CLEANUP_KEY = 'linkkf-last-cleanup';
            const lastCleanup = localStorage.getItem(CLEANUP_KEY);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            if (!lastCleanup || (now - parseInt(lastCleanup, 10)) > oneDay) {
                console.log('[CLEANUP] 오래된 데이터 정리를 시작합니다.');
                runDataCleanup();
                localStorage.setItem(CLEANUP_KEY, now.toString());
            }
        }

        function createHistoryRecord() {
            if (currentTitleInfo && pendingProgressData) {
                const episodeUrl = window.location.href;
                const historyKey = `linkkf-history-${currentTitleInfo.animeId}-${currentTitleInfo.episode}`;
                const fullTitle = `${currentTitleInfo.series} ${currentTitleInfo.episode}화`.trim();
                const historyData = {
                    title: fullTitle,
                    url: episodeUrl,
                    time: pendingProgressData.time,
                    duration: pendingProgressData.duration,
                    timestamp: pendingProgressData.timestamp,
                    animeId: currentTitleInfo.animeId
                };
                localStorage.setItem(historyKey, JSON.stringify(historyData));
                console.log('%c[TOP] 시청 기록 생성/업데이트 완료:', 'color: lightgreen; font-weight: bold;', historyData);
                pendingProgressData = null;
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
                            pendingProgressData = null;
                        }
                    }
                } else {
                    currentTitleInfo = null;
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function listenForProgress() {
            window.addEventListener('message', (event) => {
                if (event.data?.type === 'LINKKF_PROGRESS_UPDATE') {
                    console.log(`%c[TOP] 프레임으로부터 재생 정보 수신! (수신된 origin: ${event.origin})`, 'color: orange;', event.data.payload);
                    pendingProgressData = event.data.payload;
                    createHistoryRecord();
                }
            });
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
                        } catch (e) {
                            console.warn(`손상된 시청 기록 데이터 발견, 건너뜁니다: ${key}`);
                        }
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
            _getRemoteProgressData() {
                return new Promise((resolve) => {
                    const iframe = document.querySelector('#magicplayer');
                    if (!iframe) {
                        console.log('[Backup] #magicplayer iframe을 찾을 수 없어 progress 백업을 건너뜁니다.');
                        return resolve([]);
                    }

                    const listener = (event) => {
                        if (event.data?.type === 'LINKKF_RESPONSE_PROGRESS_DATA') {
                            console.log(`[Backup] iframe(${event.origin})으로부터 progress 데이터 수신 완료.`);
                            window.removeEventListener('message', listener);
                            clearTimeout(timeout);
                            resolve(event.data.payload || []);
                        }
                    };
                    window.addEventListener('message', listener);

                    const timeout = setTimeout(() => {
                        window.removeEventListener('message', listener);
                        console.warn('[Backup] iframe 응답 시간 초과.');
                        resolve([]);
                    }, 2000);

                    // ★★★ 핵심 수정: '저장 후 요청' 메시지를 보냅니다.
                    console.log('[Backup] #magicplayer iframe에 progress 데이터 저장 후 요청 전송...');
                    iframe.contentWindow.postMessage({ type: 'LINKKF_SAVE_AND_REQUEST_PROGRESS_DATA' }, '*');
                });
            },

            _restoreRemoteProgressData(progressData) {
                return new Promise((resolve) => {
                    if (!progressData || progressData.length === 0) return resolve({ success: true, message: 'No progress data to restore.' });

                    const iframe = document.querySelector('#magicplayer');
                    if (!iframe) return resolve({ success: false, message: '#magicplayer iframe을 찾을 수 없습니다.' });

                    const listener = (event) => {
                        if (event.data?.type === 'LINKKF_RESTORE_ACK') {
                            window.removeEventListener('message', listener);
                            clearTimeout(timeout);
                            resolve({ success: true, message: 'Restore ACK received.' });
                        }
                    };
                    window.addEventListener('message', listener);
                    
                    const timeout = setTimeout(() => {
                        window.removeEventListener('message', listener);
                        resolve({ success: false, message: 'Restore ACK timeout.' });
                    }, 2000);

                    console.log('[Backup] #magicplayer iframe에 progress 데이터 복원 요청 전송...');
                    iframe.contentWindow.postMessage({ type: 'LINKKF_RESTORE_PROGRESS_DATA', payload: progressData }, '*');
                });
            },

            async gatherDataForBackup() {
                const progressData = await this._getRemoteProgressData();
                const backupData = { progress: progressData, playlist: [], history: [] };
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

            async exportToFile(buttonElement) {
                buttonElement.disabled = true;
                buttonElement.textContent = '가져오는 중...';

                const data = await this.gatherDataForBackup();
                
                buttonElement.disabled = false;
                buttonElement.textContent = '파일로 다운로드';

                if (data.progress.length === 0 && data.playlist.length === 0 && data.history.length === 0) {
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

                if (data.progress.length === 0 && data.playlist.length === 0 && data.history.length === 0) {
                    return alert('백업할 데이터가 없습니다.');
                }
                const jsonString = JSON.stringify(data);
                
                try {
                    await navigator.clipboard.writeText(jsonString);
                    alert('백업 데이터가 클립보드에 복사되었습니다.');
                } catch (err) {
                    alert('클립보드 복사에 실패했습니다. 브라우저 설정을 확인해주세요.');
                    console.error('클립보드 복사 실패:', err);
                }
            },

            async mergeData(importedData) {
                const currentPlaylist = PlaylistManager.get();
                const importedPlaylistItems = importedData.playlist.length > 0 ? JSON.parse(importedData.playlist[0].value || '[]') : [];
                const currentPlaylistIds = new Set(currentPlaylist.map(item => item.animeId));
                importedPlaylistItems.forEach(itemToImport => {
                    if (itemToImport && itemToImport.animeId && !currentPlaylistIds.has(itemToImport.animeId)) {
                        currentPlaylist.push(itemToImport);
                    }
                });
                localStorage.setItem(PlaylistManager.key, JSON.stringify(currentPlaylist));
        
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
        
                const result = await this._restoreRemoteProgressData(importedData.progress);
                if (!result.success) {
                    alert(`재생 위치 데이터 복원에 실패했습니다. (${result.message}) 영상 재생 페이지에서 다시 시도해주세요.`);
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
                    .kf-fab-container { position: fixed; bottom: 30px; right: 30px; z-index: 9998; }
                    .kf-fab-main { position: relative; border-radius: 28px; background-color: #6200ee; color: white; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2); transition: all 0.2s ease-in-out; user-select: none; z-index: 1; padding: 16px; font-size: 16px; }
                    .kf-fab-sub-wrapper { position: absolute; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; visibility: hidden; opacity: 0; transition: all 0.2s ease-in-out; }
                    .kf-fab-container.expand-up .kf-fab-sub-wrapper { bottom: 100%; padding-bottom: 12px; flex-direction: column-reverse; }
                    .kf-fab-container.expand-down .kf-fab-sub-wrapper { top: 100%; padding-top: 12px; }
                    .kf-fab-container.open .kf-fab-sub-wrapper { visibility: visible; opacity: 1; }
                    .kf-fab-sub { background-color: #3700b3; color: white; border-radius: 24px; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.2); user-select: none; margin-bottom: 12px; padding: 12px 16px; white-space: nowrap; }
                    .kf-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; } 
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
        listenForProgress();
        setupTitleObserver();
        UIModule.init();
    }

    // ===================================================================================
    //  최종 실행 로직
    // ===================================================================================
    let isVideoFrame = false;
    try {
        if (window.self !== window.top) { isVideoFrame = true; }
    } catch (e) { isVideoFrame = true; }

    if (isVideoFrame) {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runVideoFrameFeatures); } 
        else { runVideoFrameFeatures(); }
    } else if (window.location.hostname.includes('linkkf')) {
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runTopWindowFeatures); }
        else { runTopWindowFeatures(); }
    }
}