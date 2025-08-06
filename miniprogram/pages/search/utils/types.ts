// pages/search/utils/types.ts

// 定义食物数据结构
export interface FoodItem {
  name: string;
  id: string;
  nutrition: {
    main: Record<string, string>;
    vitamins?: Record<string, string>;
    minerals?: Record<string, string>;
  };
  img?: string;
  cloudFileId: string;
  isSelected: boolean;
  isLocal?: boolean; // 新增属性，标记图片是否为本地图片
}

// 字母分组结构
export interface FoodGroup {
  letter: string;
  foods: FoodItem[];
}

// 分组位置类型
export interface GroupPosition {
  letter: string;
  top: number;
}

// 定义 Page 实例的类型，包含 data 和 methods
// 这是一个简化版本，实际使用时可能需要更详细的定义
export interface SearchPageContext extends WechatMiniprogram.Page.Instance<SearchPageData, SearchPageMethods> {
  data: SearchPageData;
  // 引用其他模块中的方法，以便在 Page 实例中调用
  loadAllFoodData: typeof import('./dataHandlers').loadAllFoodData;
  _setDefaultImageForFood: typeof import('./dataHandlers')._setDefaultImageForFood;
  onImgError: typeof import('./dataHandlers').onImgError;

  getLetterNavRect: typeof import('./uiHandlers').getLetterNavRect;
  updateLetterNavScroll: typeof import('./uiHandlers').updateLetterNavScroll;
  calculateGroupPositions: typeof import('./uiHandlers').calculateGroupPositions;

  toggleCompareMode: typeof import('./compareHandlers').toggleCompareMode;
  onFoodItemTap: typeof import('./compareHandlers').onFoodItemTap;
  onLongPressFood: typeof import('./compareHandlers').onLongPressFood;
  onCompareButtonClick: typeof import('./compareHandlers').onCompareButtonClick;
  // isFoodSelected 已经从方法变为数据属性，不再需要在这里声明方法
}

// 定义 Page.data 的类型
export interface SearchPageData {
  allFoodGroups: FoodGroup[];
  filteredFoodGroups: FoodGroup[];
  letters: string[];
  searchKey: string;
  loading: boolean;
  activeLetter: string;
  activeLetterId: string;
  groupPositions: GroupPosition[];
  rpx2px: number;
  isClicking: boolean;
  clickTimer: number;
  letterNavScrollTop: number;
  letterNavItemHeight: number;
  letterNavHeight: number;
  selectedFoods: FoodItem[];
  compareMode: boolean;
}

// 定义 Page.methods 的类型
export interface SearchPageMethods {
  onLoad(): void;
  onSearchInput(e: WechatMiniprogram.BaseEvent): void;
  clearSearch(): void;
  onListScroll(e: WechatMiniprogram.ScrollViewScrollEvent): void;
  scrollToLetter(e: WechatMiniprogram.BaseEvent): void;
  
  // 实际的事件处理函数会调用导入的模块函数
  onImgError(e: WechatMiniprogram.BaseEvent): Promise<void>;
  toggleCompareMode(): void;
  onFoodItemTap(e: WechatMiniprogram.BaseEvent): void;
  onLongPressFood(e: WechatMiniprogram.BaseEvent): void;
  onCompareButtonClick(): void;
}