document.addEventListener('DOMContentLoaded', async () => {
    // 加载保存的 API key
    const storage = await chrome.storage.local.get('pixabayApiKey');
    if (storage.pixabayApiKey) {
        document.getElementById('pixabayKey').value = storage.pixabayApiKey;
    }

    // 获取现有设置
    chrome.storage.sync.get({
        soundAlert: true,
        notificationAlert: true
    }, function(items) {
        document.getElementById('soundAlert').checked = items.soundAlert;
        document.getElementById('notificationAlert').checked = items.notificationAlert;
    });

    // 添加保存事件监听
    document.getElementById('soundAlert').addEventListener('change', function(e) {
        chrome.storage.sync.set({
            soundAlert: e.target.checked
        });
    });

    document.getElementById('notificationAlert').addEventListener('change', function(e) {
        chrome.storage.sync.set({
            notificationAlert: e.target.checked
        });
    });
});

document.getElementById('save').addEventListener('click', async () => {
    const apiKey = document.getElementById('pixabayKey').value.trim();
    
    if (!apiKey) {
        alert('请输入有效的 API Key');
        return;
    }
    
    // 保存 API key
    await chrome.storage.local.set({ pixabayApiKey: apiKey });
    alert('设置已保存！');
});

// 添加获取 API key 的帮助链接
document.getElementById('getApiKey').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://pixabay.com/api/docs/' });
}); 
