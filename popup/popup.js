// popup.js

// 常量定义
const CACHED_IMAGE_KEY = 'cached_artwork_url';
const DISPLAY_MODE_KEY = 'artwork_display_mode';

// 状态变量
let currentMode = 'clock';
let timerInterval;
let stopwatchStart = 0;
let stopwatchElapsed = 0;
let stopwatchRunning = false;
let timerRunning = false;
let timerEndTime = 0;

// 时间相关函数
function updateTime() {
    const display = document.getElementById('timeDisplay');
    
    switch(currentMode) {
        case 'clock':
            display.textContent = new Date().toLocaleTimeString();
            break;
        case 'timer':
            if (timerRunning && timerEndTime > 0) {
                const remaining = Math.max(0, timerEndTime - Date.now());
                display.textContent = formatTime(remaining);
                
                // 如果倒计时结束
                if (remaining <= 0) {
                    timerRunning = false;
                    timerEndTime = 0;
                }
            } else {
                display.textContent = '00:00:00';
            }
            break;
        case 'stopwatch':
            if (!stopwatchRunning) {
                display.textContent = formatTime(stopwatchElapsed);
            }
            break;
    }
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// 艺术作品相关函数
async function getArtworkFromAPI() {
    // 检查是否设置了 API key
    const storage = await chrome.storage.local.get('pixabayApiKey');
    const apiKey = storage.pixabayApiKey;
    
    if (!apiKey) {
        // 如果没有 API key，提示用户并打开选项页面
        if (confirm('需要设置 Pixabay API Key 才能获取艺术作品。是否现在设置？')) {
            chrome.runtime.openOptionsPage();
        }
        throw new Error('No API key configured');
    }

    const { pixabay } = config;
    const searchTerm = config.searchTerms[Math.floor(Math.random() * config.searchTerms.length)];
    
    const params = new URLSearchParams({
        key: apiKey,
        q: searchTerm,
        ...pixabay.defaultParams
    });

    const response = await fetch(`${pixabay.baseUrl}?${params}`);
    const data = await response.json();
    
    if (!data.hits || data.hits.length === 0) {
        throw new Error('No images found');
    }
    
    const image = data.hits[Math.floor(Math.random() * data.hits.length)];
    return image.largeImageURL;
}

async function updateArtwork(useCache = true, forceUpdate = false) {
    if (useCache && !forceUpdate) {
        const storage = await chrome.storage.local.get([DISPLAY_MODE_KEY, CACHED_IMAGE_KEY]);
        const displayMode = storage[DISPLAY_MODE_KEY] || '0';
        const cachedUrl = storage[CACHED_IMAGE_KEY];
        
        if (displayMode === '0' && cachedUrl) {
            console.log('Using cached artwork:', cachedUrl);
            setArtworkSrc(cachedUrl);
            return;
        }
    }

    const button = document.getElementById('changeArtwork');
    const spinner = document.getElementById('loadingSpinner');
    const artwork = document.getElementById('artwork');
    const container = artwork.parentElement;
    
    // 显示加载动画
    spinner.style.display = 'block';
    button.disabled = true;
    artwork.style.opacity = '0.3';

    try {
        const imageUrl = await getArtworkFromAPI();
        
        // 创建新图片并预加载
        const tempImg = new Image();
        tempImg.className = 'artwork';
        tempImg.id = 'artwork-temp';
        tempImg.style.opacity = '0';
        tempImg.style.position = 'absolute';
        tempImg.style.top = '0';
        tempImg.style.left = '0';
        tempImg.style.width = '100%';
        tempImg.style.height = '100%';
        tempImg.style.objectFit = 'contain';
        
        // 等待图片加载完成
        await new Promise((resolve, reject) => {
            tempImg.onload = resolve;
            tempImg.onerror = reject;
            tempImg.src = imageUrl;
        });

        // 添加新图片到容器
        container.appendChild(tempImg);
        
        // 淡入淡出效果
        requestAnimationFrame(() => {
            artwork.style.opacity = '0';
            tempImg.style.opacity = '1';
            
            setTimeout(async () => {
                container.removeChild(artwork);
                tempImg.id = 'artwork';
                tempImg.style.position = '';
                
                // 如果是固定显示模式，保存到缓存
                const displayMode = document.getElementById('artworkInterval').value;
                if (displayMode === '0') {
                    await chrome.storage.local.set({ [CACHED_IMAGE_KEY]: imageUrl });
                }
                
                // 隐藏加载动画
                spinner.style.display = 'none';
                button.disabled = false;
            }, 500);
        });
    } catch (error) {
        console.error('Error fetching artwork:', error);
        // 发生错误时恢复原状
        spinner.style.display = 'none';
        button.disabled = false;
        artwork.style.opacity = '1';
    }
}

function setArtworkSrc(url) {
    const artwork = document.getElementById('artwork');
    artwork.src = url;
    artwork.style.opacity = '1';
}

// 在文件开头添加防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 添加更新窗口大小的函数
function updateWindowSize() {
    // 确保在更新窗口大小之前，所有过渡效果都已完成
    const container = document.querySelector('.container');
    const computedStyle = window.getComputedStyle(container);
    
    // 等待一帧以确保样式已应用
    requestAnimationFrame(() => {
        const height = container.offsetHeight +
                      parseInt(computedStyle.marginTop || 0) +
                      parseInt(computedStyle.marginBottom || 0);
        const titleBarHeight = 32;
        
        chrome.windows.getCurrent().then(window => {
            chrome.windows.update(window.id, {
                height: height + titleBarHeight
            });
        });
    });
}

// 使用较短的防抖时间
const debouncedUpdateWindowSize = debounce(updateWindowSize, 50);

// 事件监听器设置
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isAlwaysOnTop = urlParams.get('alwaysOnTop') === 'true';
    
    if (isAlwaysOnTop) {
        // 立即隐藏内容，等待完全加载后再显示
        document.body.style.opacity = '0';
        document.documentElement.classList.add('always-on-top');
        document.body.classList.add('always-on-top');
        
        // 确保背景是黑色
        document.documentElement.style.background = '#000000';
        document.body.style.background = '#000000';
        
        // 移除固定高度
        document.documentElement.style.height = 'auto';
        document.body.style.height = 'auto';
        
        // 创建 ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
            debouncedUpdateWindowSize();
        });
        
        // 观察 container 元素
        resizeObserver.observe(document.querySelector('.container'));
        
        // 等待所有资源加载完成
        window.addEventListener('load', () => {
            // 强制重新计算布局
            document.body.style.display = 'none';
            document.body.offsetHeight;
            document.body.style.display = '';
            
            // 先更新窗口大小
            updateWindowSize();
            
            // 确保布局稳定后再显示内容
            setTimeout(() => {
                // 添加更短的过渡效果
                document.body.style.transition = 'opacity 0.08s ease-in';
                document.body.style.opacity = '1';
            }, 10); // 缩短等待时间
        });
        
        // 监听模式切换
        document.getElementById('modeSelect').addEventListener('change', (e) => {
            const fromTimer = document.getElementById('timerControls').style.display === 'block';
            const toClock = e.target.value === 'clock';
            
            if (fromTimer && toClock) {
                // 从倒计时切换到时钟时的特殊处理
                requestAnimationFrame(() => {
                    // 确保倒计时控件完全隐藏
                    document.getElementById('timerControls').style.display = 'none';
                    // 强制重新计算布局
                    document.body.style.display = 'none';
                    document.body.offsetHeight;
                    document.body.style.display = '';
                    
                    // 分多次更新确保正确
                    updateWindowSize();
                    setTimeout(updateWindowSize, 10);
                    setTimeout(updateWindowSize, 10);
                });
            } else {
                // 其他模式切换的正常处理
                setTimeout(updateWindowSize, 10);
            }
        });
        
        // 初始化时的处理
        window.addEventListener('load', () => {
            updateWindowSize();
            setTimeout(updateWindowSize, 20);
        });
    }
    
    // 检查当前页面类型
    const isPopup = document.getElementById('contextMenu') !== null;
    
    if (isPopup) {
        // 先获取当前窗口信息
        const currentWindow = await chrome.windows.getCurrent();
        
        // 先从background同步计时器状态
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'getTimerState' }, (response) => {
                resolve(response);
            });
        });

        // 设置初始状态
        if (response) {
            console.log('Received timer state from background:', response);
            
            // 恢复定时器状态
            if (response.timerActive && response.timerEndTime) {
                const remaining = response.timerEndTime - Date.now();
                if (remaining > 0) {
                    timerEndTime = response.timerEndTime;
                    timerRunning = true;
                    currentMode = 'timer';
                    document.getElementById('modeSelect').value = 'timer';
                    document.getElementById('timerControls').style.display = 'block';
                    document.getElementById('stopwatchControls').style.display = 'none';
                }
            }
            
            // 恢复秒表状态
            if (response.stopwatch) {
                stopwatchRunning = response.stopwatch.running;
                if (stopwatchRunning) {
                    // 如果秒表正在运行，立即计算当前值
                    stopwatchElapsed = response.stopwatch.elapsed;
                    stopwatchStart = response.stopwatch.startTime;
                    const currentElapsed = stopwatchElapsed + (Date.now() - stopwatchStart);
                    document.getElementById('timeDisplay').textContent = formatTime(currentElapsed);
                    
                    currentMode = 'stopwatch';
                    document.getElementById('modeSelect').value = 'stopwatch';
                    document.getElementById('timerControls').style.display = 'none';
                    document.getElementById('stopwatchControls').style.display = 'block';
                }
            }
        }


        

    }

    // 初始化显示模式
    const storage = await chrome.storage.local.get(DISPLAY_MODE_KEY);
    let savedMode = storage[DISPLAY_MODE_KEY] || '0';
    
    // 初始化时钟并开始更新
    updateTime();
    setInterval(updateTime, 1000);
    
    // 只在弹出窗口中执行的代码
    if (isPopup) {
        document.getElementById('artworkInterval').value = savedMode;
        
        // 等待DOM完全渲染后再调整高度
        await new Promise(resolve => requestAnimationFrame(resolve));
        


        // 添加右键菜单事件监听器
        document.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            const contextMenu = document.getElementById('contextMenu');
            const toggleItem = document.getElementById('toggleAlwaysOnTop');

            // 获取当前状态
            const storage = await chrome.storage.local.get('alwaysOnTopWindowId');
            const isAlwaysOnTop = !!storage.alwaysOnTopWindowId;

            // 更新菜单项状态
            toggleItem.classList.toggle('checked', isAlwaysOnTop);

            // 显示菜单
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
        });

        // 添加菜单项击事件
        document.getElementById('toggleAlwaysOnTop').addEventListener('click', async () => {
            const storage = await chrome.storage.local.get('alwaysOnTopWindowId');
            const isAlwaysOnTop = !!storage.alwaysOnTopWindowId;
            
            // 使用 window.screenX/Y 获取当前窗口的屏幕坐标
            const position = {
                left: window.screenX,
                top: window.screenY
            };
            
            // 发送消息给 background script
            await chrome.runtime.sendMessage({
                type: 'toggleAlwaysOnTop',
                value: !isAlwaysOnTop,
                position: position
            });

            // 等待消息处理完成后再关闭窗口
            if (!isAlwaysOnTop) {
                setTimeout(() => {
                    window.close();
                }, 20);
            }

            document.getElementById('contextMenu').style.display = 'none';
        });

        // 添加新标签页打开事件
        document.getElementById('openInNewTab').addEventListener('click', () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL('pages/newtab.html')
            });
            
            document.getElementById('contextMenu').style.display = 'none';
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#contextMenu')) {
                document.getElementById('contextMenu').style.display = 'none';
            }
        });
    }

    // 所有页面都需要执行的代码
    updateArtwork(true);

    // 等待所有资源加载完成
    window.addEventListener('load', () => {
        // 制重新计算布局
        document.body.style.display = 'none';
        document.body.offsetHeight; // 触发重排
        document.body.style.display = '';
        

    });

    // 修改图片点击事件处理
    document.getElementById('artwork').addEventListener('click', () => {
        // 只在倒计时或秒表模式下处理
        if (currentMode === 'timer' || currentMode === 'stopwatch') {
            const timerControls = document.getElementById('timerControls');  // 获取倒计时控件容器
            const stopwatchControls = document.getElementById('stopwatchControls');  // 获取秒表控件容器
            const controls = currentMode === 'timer' ? timerControls : stopwatchControls;  // 根据当前模式选择容器
            
            // 如果当前是倒计时模式，则切换倒计时的显示，否则切换秒表的显示
            if (currentMode === 'timer') {
                timerControls.style.display = timerControls.style.display === 'none' ? 'block' : 'none';
            } else {
                stopwatchControls.style.display = stopwatchControls.style.display === 'none' ? 'block' : 'none';
            }


        }
    });

    // 在初始化时添加过渡效果
    document.addEventListener('DOMContentLoaded', () => {
        // 为时间控件添加过渡效果
        const timerControls = document.querySelector('.timer-controls');
        if (timerControls) {
            timerControls.style.transition = 'all 0.3s ease';
            timerControls.style.opacity = '1';
            timerControls.style.pointerEvents = 'auto';
        }
    });

});

// 修改modeSelect的事件监听器
document.getElementById('modeSelect').addEventListener('change', async (e) => {
    currentMode = e.target.value;
    const timerControls = document.getElementById('timerControls');
    const stopwatchControls = document.getElementById('stopwatchControls');
    
    // 更新控件显示状态
    timerControls.style.display = currentMode === 'timer' ? 'block' : 'none';
    stopwatchControls.style.display = currentMode === 'stopwatch' ? 'block' : 'none';
    

    
    // 切换到计时器模式时，立即更新显示
    if (currentMode === 'timer' && timerRunning) {
        const remaining = Math.max(0, timerEndTime - Date.now());
        document.getElementById('timeDisplay').textContent = formatTime(remaining);
    }
    // 切换到秒表模式时，立即更新显示
    else if (currentMode === 'stopwatch' && stopwatchRunning) {
        const elapsed = stopwatchElapsed + (Date.now() - stopwatchStart);
        document.getElementById('timeDisplay').textContent = formatTime(elapsed);
    }

    // 确保切换模式时控制区是可见的
    const controlsWrapper = document.querySelector('.controls-wrapper');
    controlsWrapper.style.opacity = '1';
    controlsWrapper.style.pointerEvents = 'auto';
});

// 继续添加事件监听器...

function resetAll() {
    stopwatchRunning = false;
    timerRunning = false;
    stopwatchElapsed = 0;
    timerEndTime = 0;
    updateTime();
}

// 图片更换间控制
document.getElementById('artworkInterval').addEventListener('change', async (e) => {
    const interval = parseInt(e.target.value);
    await chrome.storage.local.set({ [DISPLAY_MODE_KEY]: e.target.value });
    
    // 发送消息给 background script 更新定时
    chrome.runtime.sendMessage({
        type: 'updateInterval',
        interval: interval
    });
    
    if (interval === 0) {
        // 如果切换到固定显示，保存当前图
        const artwork = document.getElementById('artwork');
        if (artwork.src) {
            await chrome.storage.local.set({ [CACHED_IMAGE_KEY]: artwork.src });
        }
    } else {
        // 切换自动更换时清除缓存
        await chrome.storage.local.remove(CACHED_IMAGE_KEY);
    }
});

// 更换图片按钮
document.getElementById('changeArtwork').addEventListener('click', () => {
    updateArtwork(true, true);
});

// 倒计时控制
document.getElementById('startTimer').addEventListener('click', () => {
    const hours = parseInt(document.getElementById('hours').value) || 0;
    const minutes = parseInt(document.getElementById('minutes').value) || 0;
    const seconds = parseInt(document.getElementById('seconds').value) || 0;
    const duration = (hours * 3600 + minutes * 60 + seconds) * 1000;
    
    if (duration > 0) {
        timerEndTime = Date.now() + duration;
        timerRunning = true;
        
        // 通过 background script 设置定时器
        chrome.runtime.sendMessage({
            type: 'setTimer',
            endTime: timerEndTime
        });
    }
});

document.getElementById('pauseTimer').addEventListener('click', () => {
    timerRunning = false;
    chrome.runtime.sendMessage({ type: 'clearTimer' });
});

document.getElementById('resetTimer').addEventListener('click', () => {
    timerRunning = false;
    timerEndTime = 0;
    updateTime();
    chrome.runtime.sendMessage({ type: 'clearTimer' });
});

// 表控制
document.getElementById('startStopwatch').addEventListener('click', () => {
    if (!stopwatchRunning) {
        stopwatchRunning = true;
        chrome.runtime.sendMessage({ type: 'startStopwatch' });
        showPersistenceHint();
    }
});

document.getElementById('pauseStopwatch').addEventListener('click', () => {
    if (stopwatchRunning) {
        stopwatchRunning = false;
        stopwatchElapsed += Date.now() - stopwatchStart;
        chrome.runtime.sendMessage({ type: 'pauseStopwatch' });
        updateStopwatchDisplay();
    }
});

document.getElementById('resetStopwatch').addEventListener('click', () => {
    stopwatchRunning = false;
    stopwatchElapsed = 0;
    updateTime();
    chrome.runtime.sendMessage({ type: 'resetStopwatch' });
});

// 监听来自 background script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'timerComplete') {
        timerRunning = false;
        timerEndTime = 0;
        if (currentMode === 'timer') {
            updateTime();
        }
    } else if (message.type === 'updateArtwork') {
        updateArtwork(false);
    } else if (message.type === 'stopwatchUpdate' && currentMode === 'stopwatch') {
        stopwatchRunning = message.running;
        stopwatchElapsed = message.elapsed;
        stopwatchStart = message.start;
        document.getElementById('timeDisplay').textContent = formatTime(message.elapsed);
    } else if (message.type === 'timerUpdate' && currentMode === 'timer') {
        // 添加对计时器更新消息的处理
        timerRunning = message.running;
        timerEndTime = message.endTime;
        const remaining = Math.max(0, timerEndTime - Date.now());
        document.getElementById('timeDisplay').textContent = formatTime(remaining);
    }
});


// 添加以下代码来处理滚轮事件
function setupWheelInputs() {
    const hourInput = document.querySelector('.timer-input[data-unit="hours"]');
    const minuteInput = document.querySelector('.timer-input[data-unit="minutes"]');
    const secondInput = document.querySelector('.timer-input[data-unit="seconds"]');

    const handleWheel = (event, input, max) => {
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        let value = parseInt(input.value) || 0;
        value = (value + direction + max + 1) % (max + 1);
        input.value = value.toString().padStart(2, '0');
    };

    hourInput.addEventListener('wheel', (e) => {
        handleWheel(e, hourInput, 99); // 小时范围 0-99
    });

    minuteInput.addEventListener('wheel', (e) => {
        handleWheel(e, minuteInput, 59); // 分钟范围 0-59
    });

    secondInput.addEventListener('wheel', (e) => {
        handleWheel(e, secondInput, 59); // 钟范围 0-59
    });
}

// 更新秒表显示
function updateStopwatchDisplay() {
    if (!stopwatchRunning) {
        const display = document.getElementById('timeDisplay');
        display.textContent = formatTime(stopwatchElapsed);
    }
}

// 添加提示函数
function showPersistenceHint() {
    const hint = document.createElement('div');
    hint.className = 'persistence-hint';
    hint.textContent = '秒会在后台继续���行';
    hint.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.3s;
        z-index: 1000;
    `;
    
    document.body.appendChild(hint);
    
    // 显示提示
    setTimeout(() => {
        hint.style.opacity = '1';
    }, 10);
    
    // 3秒后淡出并移除
    setTimeout(() => {
        hint.style.opacity = '0';
        setTimeout(() => {
            document.body.removeChild(hint);
        }, 300);
    }, 3000);
}


