// background.js
// 常量定义
const CACHED_IMAGE_KEY = 'cached_artwork_url';
const DISPLAY_MODE_KEY = 'artwork_display_mode';

// 定时器和闹钟管理
let artworkInterval = null;
let timerAlarm = null;

// 在文件顶部添加全局变量来跟踪状态
let isAlwaysOnTopEnabled = false;
let currentWindowId = null;
let focusListener = null;
let boundsListener = null;

// 在文件开头添加变量跟踪菜单是否已创建
let contextMenuCreated = false;

// 在文件顶部添加一个变量来存储alarm监听器
let alarmListener = null;

// 在文件顶部添加变量来跟踪定时器状态
let timerActive = false;

// 在文件顶部添加调试变量
let timerCount = 0;

// 添加一个变量来跟踪通知状态
let notificationShown = false;

// 添加状态变量
let timerEndTime = 0;  // 倒计时结束时间
let stopwatchStart = 0;  // 秒表开始时间
let stopwatchElapsed = 0;  // 秒表累计时间
let stopwatchRunning = false;  // 秒表运行状态

// 保存计时器状态
let timerState = {
    timerEndTime: 0,
    timerInterval: null,
    stopwatch: {
        running: false,
        startTime: 0,
        elapsed: 0,
        interval: null
    }
};

// 初始化
chrome.runtime.onInstalled.addListener(async () => {
    await createContextMenu();
    const storage = await chrome.storage.local.get(['DISPLAY_MODE_KEY', 'alwaysOnTopWindowId']);
    const interval = parseInt(storage[DISPLAY_MODE_KEY] || '0');
    
    if (interval > 0) {
        setupArtworkInterval(interval);
    }
});

// 在扩展启动时也查状态
chrome.runtime.onStartup.addListener(async () => {
    await createContextMenu();
    const storage = await chrome.storage.local.get(['alwaysOnTopWindowId', 'windowSize']);
    if (storage.alwaysOnTopWindowId) {
        try {
            await chrome.contextMenus.update('alwaysOnTop', { checked: true });
        } catch (e) {
            // 忽略菜单更新错误
        }
        const size = storage.windowSize || { width: 400, height: 550 };
        handleAlwaysOnTop(true, size.width, size.height);
    }
});

// 处理来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'updateInterval':
            handleIntervalUpdate(message.interval);
            break;
        case 'setTimer':
            // 清除现有计时器
            if (timerState.timerInterval) {
                clearInterval(timerState.timerInterval);
            }
            
            timerState.timerEndTime = message.endTime;
            
            // 设置新的计时器
            timerState.timerInterval = setInterval(() => {
                const remaining = timerState.timerEndTime - Date.now();
                
                if (remaining <= 0) {
                    // 清除计时器
                    clearInterval(timerState.timerInterval);
                    timerState.timerInterval = null;
                    timerState.timerEndTime = 0;
                    
                    // 创建通知，添加错误处理
                    try {
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
                            title: '计时器提醒',
                            message: '计时结束！',
                            priority: 2,
                            requireInteraction: true
                        }, (notificationId) => {
                            if (chrome.runtime.lastError) {
                                console.error('Notification creation failed:', chrome.runtime.lastError);
                                // 如果带图标的通知失败，尝试创建��图标的通知
                                chrome.notifications.create({
                                    type: 'basic',
                                    title: '计时器提醒',
                                    message: '计时结束！',
                                    priority: 2,
                                    requireInteraction: true
                                });
                            }
                        });
                    } catch (error) {
                        console.error('Error creating notification:', error);
                    }
                    
                    // 发送完成消息
                    chrome.runtime.sendMessage({
                        type: 'timerComplete'
                    }).catch(() => {});
                } else {
                    // 定期发送更新消息
                    chrome.runtime.sendMessage({
                        type: 'timerUpdate',
                        running: true,
                        endTime: timerState.timerEndTime
                    }).catch(() => {});
                }
            }, 100);  // 使用更高的更新频率
            break;
        case 'clearTimer':
            if (timerState.timerInterval) {
                clearInterval(timerState.timerInterval);
                timerState.timerInterval = null;
            }
            timerState.timerEndTime = 0;
            break;
        case 'toggleAlwaysOnTop':
            handleAlwaysOnTop(message.value, message.width, message.height);
            break;
        case 'getTimerState':
            // 返回完整的计时器状态
            sendResponse({
                timerActive: !!timerState.timerInterval,
                timerEndTime: timerState.timerEndTime,
                stopwatch: {
                    running: timerState.stopwatch.running,
                    elapsed: timerState.stopwatch.elapsed,
                    startTime: timerState.stopwatch.startTime
                }
            });
            return true;  // 保持消息通道开启
        case 'startStopwatch':
            timerState.stopwatch.running = true;
            timerState.stopwatch.startTime = Date.now();
            timerState.stopwatch.elapsed = 0;  // 重置累计时间
            
            // 开始秒表计时
            if (timerState.stopwatch.interval) {
                clearInterval(timerState.stopwatch.interval);
            }
            
            timerState.stopwatch.interval = setInterval(() => {
                if (timerState.stopwatch.running) {
                    const currentElapsed = timerState.stopwatch.elapsed + 
                        (Date.now() - timerState.stopwatch.startTime);
                    // 广播秒表更新
                    chrome.runtime.sendMessage({
                        type: 'stopwatchUpdate',
                        elapsed: currentElapsed,
                        running: true,
                        start: timerState.stopwatch.startTime
                    }).catch(() => {});
                }
            }, 100);  // 更新频率提高到 100ms
            break;
        case 'pauseStopwatch':
            timerState.stopwatch.running = false;
            timerState.stopwatch.elapsed += Date.now() - timerState.stopwatch.startTime;
            if (timerState.stopwatch.interval) {
                clearInterval(timerState.stopwatch.interval);
            }
            break;
        case 'resetStopwatch':
            timerState.stopwatch.running = false;
            timerState.stopwatch.elapsed = 0;
            timerState.stopwatch.startTime = 0;
            if (timerState.stopwatch.interval) {
                clearInterval(timerState.stopwatch.interval);
            }
            break;
    }
});

// 处理定时更换图片
function handleIntervalUpdate(interval) {
    if (artworkInterval) {
        clearInterval(artworkInterval);
        artworkInterval = null;
    }
    
    if (interval > 0) {
        setupArtworkInterval(interval);
    }
}

function setupArtworkInterval(interval) {
    artworkInterval = setInterval(() => {
        // 知所有打开的 popup 更新图片
        chrome.runtime.sendMessage({
            type: 'updateArtwork'
        }).catch(() => {
            // 忽略错误，popup 可已关闭
        });
    }, interval * 1000);
}

// 监听扩展卸载
chrome.runtime.onSuspend.addListener(() => {
    if (artworkInterval) {
        clearInterval(artworkInterval);
    }
    clearTimer();
});

// 创建菜单的函数
async function createContextMenu() {
    if (!contextMenuCreated) {
        try {
            await chrome.contextMenus.create({
                id: 'alwaysOnTop',
                title: '总是在前',
                type: 'checkbox',
                checked: false,
                contexts: ['all']
            });
            contextMenuCreated = true;
        } catch (e) {
            console.error('Failed to create context menu:', e);
        }
    }
}

async function handleAlwaysOnTop(checked, width = 400, height = 550) {
    if (!checked) {
        isAlwaysOnTopEnabled = false;
        await cleanupExistingWindow();
        if (contextMenuCreated) {
            try {
                await chrome.contextMenus.update('alwaysOnTop', { checked: false });
            } catch (e) {
                console.log('Menu update skipped:', e);
            }
        }
        await chrome.storage.local.remove(['alwaysOnTopWindowId', 'windowPosition']);
        return;
    }

    await cleanupExistingWindow();

    try {
        const displays = await chrome.system.display.getInfo();
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
        
        // 直接使用传入的尺寸，不需要额外添加边距
        const windowWidth = width;
        const windowHeight = height;
        const rightPosition = primaryDisplay.workArea.width - windowWidth - 20; // 距离右边缘20px

        // 获取保存的位置
        const storage = await chrome.storage.local.get('windowPosition');
        const position = storage.windowPosition || {
            left: rightPosition,
            top: 20
        };

        // 创建新窗口时直接使用传入的尺寸
        const popup = await chrome.windows.create({
            url: chrome.runtime.getURL('popup/popup.html?frameless=true&alwaysOnTop=true'),
            type: 'popup',
            width: windowWidth,
            height: windowHeight,
            focused: true,
            left: position.left,
            top: position.top,
            state: 'normal'
        });

        currentWindowId = popup.id;
        isAlwaysOnTopEnabled = true;

        // 保存窗口ID
        await chrome.storage.local.set({ 'alwaysOnTopWindowId': popup.id });

        // 修改焦点监听器
        focusListener = async (focusedWindowId) => {
            if (currentWindowId && focusedWindowId !== currentWindowId) {
                try {
                    const window = await chrome.windows.get(currentWindowId);
                    if (window) {
                        await chrome.windows.update(currentWindowId, {
                            focused: true,
                            state: 'normal'
                        });
                    }
                } catch (e) {
                    // 忽略错误，窗口可能已关闭
                }
            }
        };

        // 修改位置监听器
        boundsListener = async (changedWindow) => {
            if (changedWindow.id === currentWindowId) {
                try {
                    await chrome.storage.local.set({
                        'windowPosition': {
                            left: changedWindow.left,
                            top: changedWindow.top
                        }
                    });
                } catch (e) {
                    console.error('Failed to save window position:', e);
                }
            }
        };

        // 注册监听器
        chrome.windows.onFocusChanged.addListener(focusListener);
        chrome.windows.onBoundsChanged.addListener(boundsListener);

        if (contextMenuCreated) {
            try {
                await chrome.contextMenus.update('alwaysOnTop', { checked: true });
            } catch (e) {
                console.log('Menu update skipped:', e);
            }
        }

    } catch (error) {
        console.error('Failed to create always-on-top window:', error);
        await cleanupExistingWindow();
        isAlwaysOnTopEnabled = false;
        try {
            await chrome.contextMenus.update('alwaysOnTop', { checked: false });
        } catch (e) {
            console.log('Menu update failed:', e);
        }
    }
}

// 清理函数
async function cleanupExistingWindow() {
    if (focusListener) {
        chrome.windows.onFocusChanged.removeListener(focusListener);
        focusListener = null;
    }
    if (boundsListener) {
        chrome.windows.onBoundsChanged.removeListener(boundsListener);
        boundsListener = null;
    }

    try {
        await chrome.contextMenus.update('alwaysOnTop', { checked: false });
    } catch (e) {
        console.log('Menu update skipped:', e);
    }

    if (currentWindowId) {
        try {
            await chrome.windows.remove(currentWindowId);
        } catch (e) {
            console.log('Window removal failed:', e);
        }
        currentWindowId = null;
    }
}

// 添加清理计时器的函数
function clearAllTimers() {
    // 清理倒计时
    if (timerState.timerInterval) {
        clearInterval(timerState.timerInterval);
        timerState.timerInterval = null;
        timerState.timerEndTime = 0;
    }
    
    // 清理秒表
    if (timerState.stopwatch.interval) {
        clearInterval(timerState.stopwatch.interval);
        timerState.stopwatch.interval = null;
    }
    timerState.stopwatch.running = false;
    timerState.stopwatch.elapsed = 0;
    timerState.stopwatch.startTime = 0;
    
    // 清理其他定时器
    if (artworkInterval) {
        clearInterval(artworkInterval);
        artworkInterval = null;
    }
}

// 修改窗口关闭监听器
chrome.windows.onRemoved.addListener(async (windowId) => {
    if (windowId === currentWindowId) {
        // 清理所有计时器和状态
        clearAllTimers();
        
        // 重置状态变量
        timerActive = false;
        notificationShown = false;
        isAlwaysOnTopEnabled = false;
        currentWindowId = null;
        
        // 更新菜单状态
        try {
            await chrome.contextMenus.update('alwaysOnTop', { checked: false });
        } catch (e) {
            console.log('Menu update skipped - menu item might not exist yet');
        }
        
        // 清理存储
        await chrome.storage.local.remove('alwaysOnTopWindowId');
    }
}); 
