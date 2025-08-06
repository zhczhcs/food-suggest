// pages/record/record.ts
const db = wx.cloud.database();

// 定义 Ingredient 接口
interface Ingredient {
  name: string;
  quantity: string;
  isFoodDtAvailable?: boolean; 
}

// 定义 Recipe 接口
interface Recipe {
  _id: string; 
  _openid?: string; 
  name: string;
  description?: string; 
  category: string;
  ingredients: Ingredient[]; 
  steps: string[]; 
  imagePath: string;
  cookTime?: string;
  difficulty?: string;
  tags?: string[];
  uploadDate?: string; 
}

// 饮食记录接口
interface DailyDietRecord {
  _id?: string;
  recipeId: string;
  recipeName: string;
  recipeImagePath: string;
  mealType: string; // "早", "中", "晚"
  date: string; // 记录日期，例如 "2024-07-26"
  timestamp: number; // 记录时间戳
  _openid?: string;
  displayDateTime?: string; // 用于 WXML 显示的格式化日期时间 (例如 "2025/08/05 早")
}

Page({
  data: {
    pageTitle: '饮食记录',
    allDietRecords: [] as DailyDietRecord[], // 存储所有（或过滤后的）饮食记录
    isLoading: true,
    isEmpty: false,

    selectedQueryDate: null as string | null, // 存储用户选择的查询日期，null 表示显示所有
    displayFilterDate: '所有记录', // 用于顶部显示当前查询范围
    
    showRecipeDetailModal: false,
    currentViewingRecipe: null as Recipe | null,
  },

  onLoad: function () {
    // 页面加载时，直接加载所有记录（或默认范围）
    this.loadDietRecords(); 
  },

  onShow: function () {
    // 页面显示或从其他页面返回时，重新加载数据，确保实时性
    this.loadDietRecords();
  },

  /**
   * 加载饮食记录
   * 根据 selectedQueryDate 决定是加载特定日期的记录还是所有记录
   */
  loadDietRecords: async function () {
    this.setData({
      isLoading: true,
      isEmpty: false,
      allDietRecords: [], // 清空旧数据
    });
    wx.showLoading({ title: '加载中...', mask: true });

    let queryCondition: any = {};
    let displayDateText = '所有记录'; // 默认显示文本

    if (this.data.selectedQueryDate) {
      // 如果有选择特定日期，则只查询该日期
      queryCondition.date = this.data.selectedQueryDate;
      const dateParts = this.data.selectedQueryDate.split('-');
      displayDateText = `${dateParts[0]}年${dateParts[1]}月${dateParts[2]}日`;
    } else {
      // 如果没有选择特定日期，可以查询最近的N天，或者不加日期条件查询所有
      displayDateText = '所有记录';
    }

    this.setData({
      displayFilterDate: displayDateText // 更新顶部显示文本
    });

    try {
      // 查询记录，按时间戳降序排列（最新在前）
      const res = await db.collection('dailyDietRecords')
                          .where(queryCondition)
                          .orderBy('timestamp', 'desc') // 降序排列
                          .get();

      console.log(`[RecordPage] 获取饮食记录:`, res.data);

      const records = res.data as DailyDietRecord[];
      
      // 为每条记录添加格式化后的显示日期时间
      records.forEach(record => {
        const formattedDate = record.date.replace(/-/g, '/');
        record.displayDateTime = `${formattedDate} ${record.mealType}`;
      });

      this.setData({
        allDietRecords: records,
        isEmpty: records.length === 0,
      });

    } catch (err) {
      console.error('[RecordPage] 获取饮食记录失败:', err);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none',
      });
      this.setData({ isEmpty: true });
    } finally {
      wx.hideLoading();
      this.setData({ isLoading: false }); 
    }
  },

  /**
   * 格式化日期为 YYYY-MM-DD
   */
  formatDate: function (date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 日期选择器选择日期后触发的回调函数 (picker组件)
   */
  onDateChange: function(e: WechatMiniprogram.PickerChange) {
    const selectedDate = e.detail.value; // picker 返回的日期格式是 YYYY-MM-DD
    console.log('[onDateChange] 用户选择了日期:', selectedDate);

    wx.showModal({
      title: '确认查询',
      content: `确定查询 ${selectedDate.substring(0, 4)}年${selectedDate.substring(5, 7)}月${selectedDate.substring(8, 10)}日 的饮食记录吗？`,
      confirmText: '是',
      cancelText: '否', // 增加取消选项
      success: (modalRes) => {
        if (modalRes.confirm) {
          // 更新 selectedQueryDate 和 displayFilterDate，并重新加载数据
          console.log('[onDateChange] 用户确认查询日期:', selectedDate);
          this.setData({
            selectedQueryDate: selectedDate,
            displayFilterDate: `${selectedDate.substring(0, 4)}年${selectedDate.substring(5, 7)}月${selectedDate.substring(8, 10)}日`
          }, () => {
            this.loadDietRecords(); // 加载新日期的数据
          });
        } else if (modalRes.cancel) {
          // 如果用户在弹窗中点击“否”，则不改变当前筛选状态
          console.log('[onDateChange] 用户在确认查询弹窗中取消了操作。');
        }
      }
    });
  },

  /**
   * 点击显示当前查询日期范围的文本，清除日期筛选
   */
  onClearDateFilter: function() {
    // 只有在有筛选日期时才执行清除操作
    if (this.data.selectedQueryDate) { 
      wx.showModal({
        title: '清除筛选',
        content: '确定要显示所有饮食记录吗？',
        confirmText: '是',
        cancelText: '否',
        success: (res) => {
          if (res.confirm) {
            console.log('[onClearDateFilter] 清除日期筛选，显示所有记录。');
            this.setData({
              selectedQueryDate: null, // 清除筛选日期
            }, () => {
              this.loadDietRecords(); // 重新加载所有记录
            });
          } else {
            console.log('[onClearDateFilter] 取消清除筛选。');
          }
        }
      });
    } else {
      wx.showToast({
        title: '当前已显示所有记录',
        icon: 'none',
        duration: 1500
      });
    }
  },

  /**
   * 点击“统计数据”按钮（占位功能）
   */
  onStatsClick: function() {
    wx.showToast({
      title: '统计功能待开发',
      icon: 'none'
    });
    console.log('点击了统计数据按钮');
  },

  /**
   * 删除饮食记录
   */
  onDeleteRecord: function(e: WechatMiniprogram.TouchEvent) {
    console.log('[onDeleteRecord] 删除按钮被点击！'); 
    // 不再需要 e.stopPropagation()，因为 WXML 中的 catchtap="stopBubble" 已经移除

    const recordId = e.currentTarget.dataset.id;
    console.log('[onDeleteRecord] 尝试删除的记录ID:', recordId); 

    if (!recordId) {
      console.error('[onDeleteRecord] 记录ID为空，无法删除！');
      wx.showToast({ title: '记录ID缺失，无法删除', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定是否删除该饮食记录？',
      confirmText: '是',
      cancelText: '否',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            const deleteRes = await db.collection('dailyDietRecords').doc(recordId).remove();
            console.log('[onDeleteRecord] 删除云数据库记录结果:', deleteRes); 
            wx.hideLoading();
            wx.showToast({ title: '删除成功', icon: 'success' });
            this.loadDietRecords(); // 刷新列表
          } catch (err) {
            wx.hideLoading();
            console.error('[onDeleteRecord] 删除记录失败:', err); 
            wx.showToast({ title: '删除失败，请检查权限或网络', icon: 'none' });
          }
        } else if (res.cancel) {
          console.log('[onDeleteRecord] 取消删除操作');
        }
      }
    });
  },

  /**
   * 点击菜谱图片，弹出食谱详情模态框
   */
  onViewRecipeDetail: async function(e: WechatMiniprogram.TouchEvent) {
    const recipeId = e.currentTarget.dataset.recipeid;
    if (!recipeId) {
      wx.showToast({ title: '食谱ID缺失', icon: 'none' });
      return;
    }

    this.setData({
      showRecipeDetailModal: true,
      currentViewingRecipe: null, // 清空上一个食谱数据，显示加载中
    });
    wx.showLoading({ title: '加载食谱...', mask: true });

    try {
      const res = await db.collection('recipes').doc(recipeId).get();
      const recipe = res.data as Recipe;

      if (recipe) {
        this.setData({
          currentViewingRecipe: recipe,
        });
      } else {
        wx.showToast({ title: '未找到食谱详情', icon: 'none' });
        this.onCloseRecipeDetailModal(); // 关闭弹窗
      }
    } catch (err) {
      console.error('获取食谱详情失败:', err);
      wx.showToast({ title: '加载食谱失败', icon: 'none' });
      this.onCloseRecipeDetailModal(); // 关闭弹窗
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 关闭食谱详情模态框
   */
  onCloseRecipeDetailModal: function() {
    this.setData({
      showRecipeDetailModal: false,
      currentViewingRecipe: null, // 清空数据
    });
  },

  /**
   * 阻止事件冒泡，防止点击弹窗内容时关闭弹窗
   * 在模态框内容区域使用，防止点击模态框内容时关闭模态框
   */
  stopBubble: function() {
    console.log('[stopBubble] Event propagation stopped.'); 
  }
});
