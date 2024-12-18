document.addEventListener('DOMContentLoaded', async () => {
    // 加载保存的 API key
    const storage = await chrome.storage.local.get('pixabayApiKey');
    if (storage.pixabayApiKey) {
        document.getElementById('pixabayKey').value = storage.pixabayApiKey;
    }
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
