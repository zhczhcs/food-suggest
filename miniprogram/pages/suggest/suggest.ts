// pages/suggest/suggest.ts

interface SuggestionCategory {
  id: string; // 用于页面内部的 activeCategory
  name: string; // 用于页面显示的名称 (e.g., "减脂")
  icon?: string;
}

Page({
  data: {
    // 建议分类列表（横向排列）
    categories: [
      { id: 'fat-loss', name: '减脂', icon: '/images/icon-fat-loss.png' },
      { id: 'muscle-gain', name: '增肌', icon: '/images/icon-muscle.png' },
      // <<<<<<<<<< 添加素食分类
      { id: 'vegetarian', name: '素食', icon: '/images/icon-vegetarian.png' }, // 假定你有一个素食图标
      { id: 'kidney', name: '补肾', icon: '/images/icon-kidney.png' },
      { id: 'spleen', name: '补脾胃', icon: '/images/icon-spleen.png' },
      { id: 'wetness', name: '祛湿', icon: '/images/icon-wetness.png' },
      // <<<<<<<<<< 添加安神分类
      { id: 'calming', name: '安神', icon: '/images/icon-calming.png' }, // 假定你有一个安神图标
      { id: 'diabetes', name: '糖尿病', icon: '/images/icon-diabetes.png' },
      { id: 'hypertension', name: '高血压', icon: '/images/icon-hypertension.png' },
      // <<<<<<<<<< 添加骨质疏松分类
      { id: 'osteoporosis', name: '骨质疏松', icon: '/images/icon-osteoporosis.png' }, // 假定你有一个骨质疏松图标
      { id: 'heart', name: '心脏健康', icon: '/images/icon-heart.png' }, // 保持原有
      { id: 'liver', name: '保肝', icon: '/images/icon-liver.png' } // 保持原有
    ] as SuggestionCategory[],
    
    activeCategory: '' as string,
    rpx2px: 1
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ 
      rpx2px: systemInfo.screenWidth / 750
    });
    
    if (this.data.categories.length > 0) {
      const firstCategory = this.data.categories[0].id;
      this.setData({ activeCategory: firstCategory });
    }
  },

  onCategoryClick(e: WechatMiniprogram.TouchEvent) {
    const categoryId = e.currentTarget.dataset.id as string; 
    const dbCategoryName = e.currentTarget.dataset.dbName as string; 

    this.setData({
      activeCategory: categoryId
    });

    if (dbCategoryName) {
      wx.navigateTo({
        url: `/pages/recipe/recipe?name=${dbCategoryName}`, 
        success: () => {
          console.log(`跳转到 ${dbCategoryName} 菜谱页面成功`);
        },
        fail: (err) => {
          console.error(`跳转失败:`, err);
          wx.showToast({
            title: '跳转失败，请稍后重试',
            icon: 'none'
          });
        }
      });
    } else {
      console.warn("未能获取到有效的数据库分类名称进行跳转。");
      wx.showToast({
        title: '分类信息错误',
        icon: 'none'
      });
    }
  },

  onReady() {},
  onShow() {},
  onHide() {},
  onUnload() {},
  onPullDownRefresh() {}, 
  onReachBottom() {},
  onShareAppMessage() {}
})
