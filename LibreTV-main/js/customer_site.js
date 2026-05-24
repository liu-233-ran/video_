const CUSTOMER_SITES = {
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
    },
    ruyi: {
        api: 'https://cj.rycjapi.com/api.php/provide/vod',
        name: '如意资源',
    },
    dyttzy: {
        api: 'http://caiji.dyttzyapi.com/api.php/provide/vod',
        name: '电影天堂资源',
        detail: 'http://caiji.dyttzyapi.com',
    },
    ffzy: {
        api: 'https://api.ffzyapi.com/api.php/provide/vod',
        name: '非凡资源',
        detail: 'https://api.ffzyapi.com',
    },
    tyyszy: {
        api: 'https://tyyszy.com/api.php/provide/vod',
        name: '天涯资源',
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
    },
    mdzy: {
        api: 'https://www.mdzyapi.com/api.php/provide/vod',
        name: '魔都资源',
    },
    zuid: {
        api: 'https://api.zuidapi.com/api.php/provide/vod',
        name: '最大资源',
    },
    yinghua: {
        api: 'https://m3u8.apiyhzy.com/api.php/provide/vod',
        name: '樱花资源',
    },
    wujin: {
        api: 'https://api.wujinapi.me/api.php/provide/vod',
        name: '无尽资源',
    },
    wwzy: {
        api: 'https://wwzy.tv/api.php/provide/vod',
        name: '旺旺资源',
    },
    heimuer: {
        api: 'https://heimuer.tv/api.php/provide/vod',
        name: '黑木耳',
        detail: 'https://heimuer.tv',
    },
    iqiyi: {
        api: 'https://iqiyi.cjapi.xyz/api.php/provide/vod',
        name: '爱奇艺资源',
    },
    wolong: {
        api: 'https://www.wolongzyw.com/api.php/provide/vod',
        name: '卧龙资源',
    },
    hwba: {
        api: 'https://hwbaapi.com/api.php/provide/vod',
        name: '海外吧资源',
    },
    dbzy: {
        api: 'https://dbzy.tv/api.php/provide/vod',
        name: '豆瓣资源',
    },
    mozhua: {
        api: 'https://mozhuaapi.com/api.php/provide/vod',
        name: '魔爪资源',
    },
    baidu: {
        api: 'https://api.baiduzyapi.com/api.php/provide/vod',
        name: '百度资源',
    },
    ikun: {
        api: 'https://ikunzyapi.com/api.php/provide/vod',
        name: 'ikun资源',
    },
};

// 调用全局方法合并
if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
