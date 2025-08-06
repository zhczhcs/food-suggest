// pages/search/search.ts

import { FoodGroup, FoodItem, GroupPosition, SearchPageContext, SearchPageData, SearchPageMethods } from './utils/types';
// 导入所有需要的函数
import { loadAllFoodData, onImgError as handleImgError, _setDefaultImageForFood, loadLazyImage, proactiveLoadNeighborImages } from './utils/dataHandlers';
import { getLetterNavRect, updateLetterNavScroll, calculateGroupPositions } from './utils/uiHandlers';
import { toggleCompareMode, onFoodItemTap, onLongPressFood, onCompareButtonClick } from './utils/compareHandlers';
import { CLOUD_STORAGE_FILE_PREFIX } from './utils/constants';

// *** 辅助函数：节流 (Throttle) ***
// 确保在一定时间内，函数只执行一次。
function throttle<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: ThisParameterType<T> | null = null;
  let lastExecutionTime = 0;

  return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    lastArgs = args;
    lastThis = this;
    const now = Date.now();

    // 如果当前时间距离上次执行时间超过了延迟，立即执行
    if (now - lastExecutionTime > delay) {
      lastExecutionTime = now;
      func.apply(lastThis, lastArgs);
    } else if (!timeoutId) { // 如果在延迟时间内，且没有定时器在等待，则设置一个定时器
      timeoutId = setTimeout(() => {
        lastExecutionTime = Date.now(); // 更新执行时间
        timeoutId = null; // 清除定时器ID
        func.apply(lastThis, lastArgs); // 执行函数
      }, delay - (now - lastExecutionTime)); // 计算剩余等待时间
    }
  };
}


Page<SearchPageData, SearchPageMethods>({
  _observer: null as WechatMiniprogram.IntersectionObserver | null,
  _throttledProactiveLoad: null as ((currentActiveLetter: string) => void) | null, // 用于存储节流后的预加载函数

  data: {
    allFoodGroups: [] as FoodGroup[],
    filteredFoodGroups: [] as FoodGroup[],
    letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z'], 
    searchKey: '',
    loading: true,
    activeLetter: '',
    activeLetterId: '',
    groupPositions: [] as GroupPosition[],
    rpx2px: 1,
    isClicking: false,
    clickTimer: 0,
    letterNavScrollTop: 0,
    letterNavItemHeight: 0,
    letterNavHeight: 0,
    selectedFoods: [] as FoodItem[],
    compareMode: false,
  },

  // 将导入的函数绑定到 Page 实例上
  loadAllFoodData: function() { return loadAllFoodData(this as SearchPageContext); },
  _setDefaultImageForFood: function(foodName: string) { return _setDefaultImageForFood(this as SearchPageContext, foodName); },
  onImgError: function(e: WechatMiniprogram.BaseEvent) { return handleImgError(this as SearchPageContext, e); },
  // 原始的 proactiveLoadNeighborImages 函数，绑定到页面实例上
  proactiveLoadNeighborImages: function(currentActiveLetter: string) { return proactiveLoadNeighborImages(this as SearchPageContext, currentActiveLetter); },

  getLetterNavRect: function() { return getLetterNavRect(this as SearchPageContext); },
  updateLetterNavScroll: function() { return updateLetterNavScroll(this as SearchPageContext); },
  calculateGroupPositions: function() { return calculateGroupPositions(this as SearchPageContext); },

  toggleCompareMode: function() { return toggleCompareMode(this as SearchPageContext); },
  onFoodItemTap: function(e: WechatMiniprogram.BaseEvent) { return onFoodItemTap(this as SearchPageContext, e); },
  onLongPressFood: function(e: WechatMiniprogram.BaseEvent) { return onLongPressFood(this as SearchPageContext, e); },
  onCompareButtonClick: function() { return onCompareButtonClick(this as SearchPageContext); },

  initIntersectionObserver() {
    if (this._observer) {
      this._observer.disconnect();
    }
    
    this._observer = wx.createIntersectionObserver(this, {
      observeAll: true 
    });

    this._observer
      .relativeTo('.food-list') 
      .observe('.lazy-item', (res) => {
        if (res.intersectionRatio > 0) {
          const { groupindex, foodindex } = res.dataset; 
          if (typeof groupindex !== 'undefined' && typeof foodindex !== 'undefined') {
            loadLazyImage(this as SearchPageContext, groupindex, foodindex);
          }
        }
      });
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: "食品营养查询" });
    const systemInfo = wx.getSystemInfoSync();
    this.setData({ rpx2px: systemInfo.screenWidth / 750 });

    if (!wx.cloud) {
      console.error('云开发 SDK 未初始化。');
      wx.showToast({ title: '云开发未就绪', icon: 'error' });
      this.setData({ loading: false });
      return;
    }
    wx.cloud.init({
      env: CLOUD_STORAGE_FILE_PREFIX.split('//')[1].split('.')[0],
      traceUser: true,
    });

    // 在 onLoad 中初始化节流后的预加载函数，例如 200ms
    this._throttledProactiveLoad = throttle(this.proactiveLoadNeighborImages, 200);

    this.loadAllFoodData().catch(err => {
      console.error('加载食物基础数据失败:', err);
      wx.showToast({ title: '数据加载失败', icon: 'error' });
      this.setData({ loading: false });
    });
  },
  
  onReady() {
    // onReady 不再直接调用 calculateGroupPositions 和 getLetterNavRect
    // 这些会在 loadAllFoodData 内部的 wx.nextTick 中处理
  },

  onSearchInput(e: WechatMiniprogram.BaseEvent) {
    const searchKey = e.detail.value.trim();
    this.setData({ searchKey });

    if (!searchKey) {
      this.setData({ filteredFoodGroups: this.data.allFoodGroups });
    } else {
      const filteredGroups = this.data.allFoodGroups
        .map(group => ({ ...group, foods: group.foods.filter(food => food.name.toLowerCase().includes(searchKey.toLowerCase())) }))
        .filter(group => group.foods.length > 0);
      this.setData({ filteredFoodGroups: filteredGroups });
    }
    
    wx.nextTick(() => {
      this.calculateGroupPositions();
      this.initIntersectionObserver();
      // 搜索/过滤后，也立即触发一次预加载
      if (this.data.activeLetter) {
        this.proactiveLoadNeighborImages(this.data.activeLetter);
      } else if (this.data.filteredFoodGroups.length > 0) {
        this.proactiveLoadNeighborImages(this.data.filteredFoodGroups[0].letter);
      }
    });
  },

  clearSearch() {
    this.setData({
      searchKey: '',
      filteredFoodGroups: this.data.allFoodGroups
    });
    wx.nextTick(() => {
      this.calculateGroupPositions();
      this.initIntersectionObserver();
      // 清除搜索后，也立即触发一次预加载
      if (this.data.activeLetter) {
        this.proactiveLoadNeighborImages(this.data.activeLetter);
      } else if (this.data.filteredFoodGroups.length > 0) {
        this.proactiveLoadNeighborImages(this.data.filteredFoodGroups[0].letter);
      }
    });
  },

  onListScroll(e: WechatMiniprogram.ScrollViewScrollEvent) {
    if (this.data.isClicking) return; 
    const { scrollTop } = e.detail;
    const { groupPositions, activeLetter } = this.data;

    if (!groupPositions || groupPositions.length === 0) {
      return; 
    }

    let newActiveLetter = activeLetter;
    for (let i = groupPositions.length - 1; i >= 0; i--) {
      const group = groupPositions[i];
      if (scrollTop + 5 >= group.top) { 
        newActiveLetter = group.letter;
        break;
      }
    }

    if (newActiveLetter && newActiveLetter !== activeLetter) { 
      this.setData({ activeLetter: newActiveLetter });
      this.updateLetterNavScroll();
      
      // *** 核心：使用节流函数调用预加载 ***
      if (this._throttledProactiveLoad) {
        this._throttledProactiveLoad(newActiveLetter);
      }
    }
  },

  scrollToLetter(e: WechatMiniprogram.BaseEvent) {
    const letter = e.currentTarget.dataset.letter as string;
    if (this.data.clickTimer) clearTimeout(this.data.clickTimer);
    this.setData({
      activeLetter: letter,
      activeLetterId: `letter-${letter}`,
      isClicking: true
    });
    this.updateLetterNavScroll();
    const timer = setTimeout(() => {
      this.setData({ isClicking: false });
    }, 500);
    this.setData({ clickTimer: timer as any });

    // *** 核心：点击字母导航后，也使用节流函数触发预加载 ***
    // 注意：这里的节流时间可以根据实际体验调整，如果点击导航后希望更快响应，可以缩短节流时间
    if (this._throttledProactiveLoad) {
        this._throttledProactiveLoad(letter);
    }
  },

  onUnload() {
    if (this._observer) {
      this._observer.disconnect();
    }
    // 页面卸载时也清理可能的定时器，虽然节流函数内部会处理
    if (this._throttledProactiveLoad) {
        // 通常不需要显式清理节流函数内部的定时器，因为它们会在执行后自动清除
        // 但如果节流函数有更复杂的资源占用，这里可以添加清理逻辑
    }
  },
});
