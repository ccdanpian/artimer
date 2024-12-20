window.config = {
    // Pixabay API 配置
    pixabay: {
        apiKey: null,
        baseUrl: "https://pixabay.com/api/",
        defaultParams: {
            image_type: 'photo',
            orientation: 'horizontal',
            min_width: 1600,
            category: 'art',
            safesearch: 'true',
            per_page: 100
        }
    },
    
    // 搜索关键词
    searchTerms: [
        'classical+art',
        'fine+art+painting',
        'art+masterpiece',
        'famous+painting',
        'renaissance+art'
    ],
    
    // 其他 API 配置（可以添加其他图片源）
    apis: {
        unsplash: {
            enabled: false,
            apiKey: "YOUR_UNSPLASH_API_KEY"
        },
        pexels: {
            enabled: false,
            apiKey: "YOUR_PEXELS_API_KEY"
        }
    }
}; 
