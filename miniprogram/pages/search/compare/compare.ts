// pages/search/compare/compare.ts

interface NutritionData {
  main: Record<string, string>;
  vitamins?: Record<string, string>;
  minerals?: Record<string, string>;
}

interface FoodDetailDoc {
  _id: string; 
  categoryLetter: string; 
  name: string; 
  nutrition: NutritionData;
}

interface FoodItem { // 与 search.ts 和 foodDt.ts 保持一致
  name: string;
  id: string; 
  nutrition: NutritionData; 
  img?: string; 
  cloudFileId: string; 
}

interface FoodGroup { // 与 search.ts 和 foodDt.ts 保持一致
  letter: string;
  foods: FoodItem[];
}

interface NutrientComparisonItem {
  key: string;
  food1Value: string;
  food2Value: string;
  food1Higher: boolean;
  food2Higher: boolean;
}

const CLOUD_STORAGE_FILE_PREFIX = 'cloud://cloud1-5gpt0k1x743339d9.636c-cloud1-5gpt0k1x743339d9-1329700013';
const CACHE_KEY_FOOD_GROUPS = 'cachedFoodGroupsWithImageUrls';
const CACHE_EXPIRATION_TIME = 60 * 60 * 1000; // 1小时

Page({
  data: {
    food1: null as FoodItem | null,
    food2: null as FoodItem | null,
    mainNutritionComparison: [] as NutrientComparisonItem[],
    vitaminComparison: [] as NutrientComparisonItem[],
    mineralComparison: [] as NutrientComparisonItem[],
    loading: true,
    loadError: false,
  },

  onLoad(options: { food1Id?: string; food1Name?: string; food2Id?: string; food2Name?: string; }) {
    const { food1Id, food1Name, food2Id, food2Name } = options;

    if (!food1Id || !food1Name || !food2Id || !food2Name) {
      console.error('[Compare] 缺少食物对比参数。');
      wx.showToast({ title: '参数错误', icon: 'error' });
      this.setData({ loading: false, loadError: true });
      return;
    }

    this.setData({ loading: true, loadError: false });
    this.loadComparisonData(food1Id, food1Name, food2Id, food2Name);
  },

  /**
   * 加载两个食物的详细数据
   */
  async loadComparisonData(food1Id: string, food1Name: string, food2Id: string, food2Name: string) {
    try {
      const db = wx.cloud.database();
      const foodCollectionName = 'food';

      // 尝试从缓存中获取所有食物列表数据
      let allFoodGroupsFromCache: FoodGroup[] | null = null;
      let cacheTimestamp: number = 0;
      try {
        const cachedData = wx.getStorageSync(CACHE_KEY_FOOD_GROUPS);
        if (cachedData && cachedData.data) {
          allFoodGroupsFromCache = cachedData.data;
          cacheTimestamp = cachedData.timestamp;
          console.log('[Compare] 成功读取列表页缓存。');
        }
      } catch (e) {
        console.warn('[Compare] 读取列表页缓存失败:', e);
      }

      // 加载第一个食物
      const food1Detail = await this._getFoodDetail(db, foodCollectionName, food1Id, food1Name, allFoodGroupsFromCache, cacheTimestamp);
      // 加载第二个食物
      const food2Detail = await this._getFoodDetail(db, foodCollectionName, food2Id, food2Name, allFoodGroupsFromCache, cacheTimestamp);

      if (food1Detail && food2Detail) {
        this.setData({
          food1: food1Detail,
          food2: food2Detail
        });
        this.compareNutrients(food1Detail.nutrition, food2Detail.nutrition);
      } else {
        console.error('[Compare] 未能完整加载两个食物的详细数据。');
        this.setData({ loadError: true });
      }

    } catch (err) {
      console.error('[Compare] 加载对比数据时发生异常:', err);
      this.setData({ loadError: true });
      wx.showToast({ title: '加载对比失败', icon: 'error' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 辅助函数：获取单个食物的详细数据（优先从缓存，否则从云端）
   */
  async _getFoodDetail(db: any, collectionName: string, foodId: string, foodName: string, 
                       allFoodGroupsFromCache: FoodGroup[] | null, cacheTimestamp: number): Promise<FoodItem | null> {
    
    let foodItem: FoodItem | null = null;

    // 1. 尝试从列表页缓存中查找
    if (allFoodGroupsFromCache) {
      for (const group of allFoodGroupsFromCache) {
        const foundFood = group.foods.find(f => f.name === foodName);
        if (foundFood) {
          foodItem = foundFood;
          // 如果缓存中的营养数据完整且未过期，直接使用
          if (foodItem.nutrition && Object.keys(foodItem.nutrition.main || {}).length > 0 && 
              (Date.now() - cacheTimestamp < CACHE_EXPIRATION_TIME)) {
            console.log(`[Compare] 从列表页缓存获取 ${foodName} 的完整数据。`);
            return foodItem;
          } else {
            console.log(`[Compare] 列表缓存中找到 ${foodName}，但营养数据不完整或已过期，将从云端获取。`);
            break; // 找到食物但营养不完整，跳出循环去云端获取
          }
        }
      }
    }

    // 2. 从云数据库获取
    try {
      const res = await db.collection(collectionName).where({ name: foodName }).get();
      if (!res.data || res.data.length === 0) {
        console.warn(`[Compare] 云数据库中未找到食物 ${foodName}。`);
        return null;
      }
      const foodDetailDoc = res.data[0] as FoodDetailDoc;

      // 构建 FoodItem 对象
      const foodLetter = foodDetailDoc.categoryLetter;
      const cloudFileId = `${CLOUD_STORAGE_FILE_PREFIX}/result/${foodLetter}/${foodName}.webp`;
      let imgUrl = '';

      // 如果 foodItem 已经存在（从列表缓存中找到的），并且有 img 链接，优先使用
      if (foodItem?.img) {
          imgUrl = foodItem.img;
          console.log(`[Compare] 复用列表缓存的图片链接 for ${foodName}。`);
      } else {
          // 否则，获取新的临时链接
          try {
              const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [cloudFileId] });
              if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0 && tempUrlRes.fileList[0].tempFileURL) {
                  imgUrl = tempUrlRes.fileList[0].tempFileURL;
                  console.log(`[Compare] 从云端获取图片临时链接 for ${foodName}。`);
              } else {
                  console.warn(`[Compare] 获取图片临时链接失败 for ${cloudFileId}: ${tempUrlRes.fileList?.[0]?.errMsg || '未知错误'}`);
              }
          } catch (imgErr) {
              console.error(`[Compare] 获取图片临时链接异常 for ${cloudFileId}:`, imgErr);
          }
      }

      const freshFoodItem: FoodItem = {
        name: foodName,
        id: foodId, // 使用传递进来的id
        nutrition: foodDetailDoc.nutrition,
        img: imgUrl,
        cloudFileId: cloudFileId
      };

      // 更新列表缓存（如果存在且关联）
      if (allFoodGroupsFromCache) {
        let foundAndUpdated = false;
        for (const group of allFoodGroupsFromCache) {
          const index = group.foods.findIndex(f => f.name === foodName);
          if (index !== -1) {
            group.foods[index] = { ...group.foods[index], ...freshFoodItem }; // 合并更新
            foundAndUpdated = true;
            console.log(`[Compare] 已更新列表缓存中食物 ${foodName} 的详细营养数据和图片链接。`);
            break;
          }
        }
        if (foundAndUpdated) {
          // 重新保存更新后的 allFoodGroups
          wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
            data: allFoodGroupsFromCache,
            timestamp: Date.now() // 更新时间戳
          });
          console.log(`[Compare] 成功将更新后的列表数据存入本地缓存。`);
        }
      }

      return freshFoodItem;

    } catch (err) {
      console.error(`[Compare] 从云端加载食物 ${foodName} 失败:`, err);
      return null;
    }
  },

  /**
   * 对比两个食物的营养成分
   */
  compareNutrients(nutrition1: NutritionData, nutrition2: NutritionData) {
    const compareResult: {
      main: NutrientComparisonItem[];
      vitamins: NutrientComparisonItem[];
      minerals: NutrientComparisonItem[];
    } = { main: [], vitamins: [], minerals: [] };

    const allKeys = new Set<string>();

    const addKeys = (data: Record<string, string> | undefined) => {
      if (data) {
        Object.keys(data).forEach(key => allKeys.add(key));
      }
    };

    addKeys(nutrition1.main);
    addKeys(nutrition2.main);
    addKeys(nutrition1.vitamins);
    addKeys(nutrition2.vitamins);
    addKeys(nutrition1.minerals);
    addKeys(nutrition2.minerals);

    const sortedKeys = Array.from(allKeys).sort();

    const processCategory = (category: 'main' | 'vitamins' | 'minerals', keys: string[]) => {
      keys.forEach(key => {
        const val1Str = nutrition1[category]?.[key] || '0';
        const val2Str = nutrition2[category]?.[key] || '0';

        const num1 = this._parseNutrientValue(val1Str);
        const num2 = this._parseNutrientValue(val2Str);

        let food1Higher = false;
        let food2Higher = false;

        if (num1 !== null && num2 !== null) {
          if (num1 > num2 * 1.2) {
            food1Higher = true;
          } else if (num2 > num1 * 1.2) {
            food2Higher = true;
          }
        } else if (num1 !== null && num2 === null && num1 > 0) {
            // 如果只有 food1 有值且大于0，也算food1高
            food1Higher = true;
        } else if (num2 !== null && num1 === null && num2 > 0) {
            // 如果只有 food2 有值且大于0，也算food2高
            food2Higher = true;
        }

        compareResult[category].push({
          key: key,
          food1Value: val1Str,
          food2Value: val2Str,
          food1Higher: food1Higher,
          food2Higher: food2Higher,
        });
      });
    };

    // 分类处理，只处理该分类下存在的键
    const mainKeysInBoth = Object.keys({ ...(nutrition1.main || {}), ...(nutrition2.main || {}) }).sort();
    const vitaminKeysInBoth = Object.keys({ ...(nutrition1.vitamins || {}), ...(nutrition2.vitamins || {}) }).sort();
    const mineralKeysInBoth = Object.keys({ ...(nutrition1.minerals || {}), ...(nutrition2.minerals || {}) }).sort();

    processCategory('main', mainKeysInBoth);
    processCategory('vitamins', vitaminKeysInBoth);
    processCategory('minerals', mineralKeysInBoth);

    this.setData({
      mainNutritionComparison: compareResult.main,
      vitaminComparison: compareResult.vitamins,
      mineralComparison: compareResult.minerals,
    });
    console.log('[Compare] 营养成分对比完成。', compareResult);
  },

  /**
   * 辅助函数：从营养值字符串中提取数值
   * 支持 "100千焦(57千卡)", "1.2克", "5毫克"
   */
  _parseNutrientValue(valueStr: string): number | null {
    if (!valueStr) return null;
    // 匹配数字，包括小数，以及括号内的数字
    const match = valueStr.match(/(\d+(\.\d+)?)/);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    return null;
  },

  /**
   * 处理对比页面的食物图片加载失败
   */
  async onFoodImageError(e: WechatMiniprogram.BaseEvent) {
    const { foodname, cloudfileid, foodindex } = e.currentTarget.dataset; 
    console.warn(`[Compare] 食物图片加载失败：${foodname}。尝试重新获取临时链接...`);

    if (!cloudfileid) {
      console.error(`[Compare] 无法重新获取图片，缺少 cloudFileId。`);
      this.setData({ [`food${foodindex === 0 ? '1' : '2'}.img`]: '/images/default_food.png' });
      return;
    }

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [cloudfileid] });
      if (res.fileList && res.fileList.length > 0 && res.fileList[0].tempFileURL) {
        const newTempUrl = res.fileList[0].tempFileURL;
        this.setData({ [`food${foodindex === 0 ? '1' : '2'}.img`]: newTempUrl });
        console.log(`[Compare] 成功重新获取并更新食物 ${foodname} 的图片链接。`);

        // 更新列表缓存中的图片链接
        const CACHE_KEY_FOOD_GROUPS = 'cachedFoodGroupsWithImageUrls';
        try {
          const cachedData = wx.getStorageSync(CACHE_KEY_FOOD_GROUPS);
          if (cachedData && cachedData.data) {
            const allFoodGroups: FoodGroup[] = cachedData.data;
            let foundAndUpdated = false;
            for (const group of allFoodGroups) {
              const foodItem = group.foods.find(f => f.name === foodname);
              if (foodItem) {
                foodItem.img = newTempUrl;
                foundAndUpdated = true;
                break;
              }
            }
            if (foundAndUpdated) {
              wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
                data: allFoodGroups,
                timestamp: cachedData.timestamp 
              });
              console.log(`[Compare] 已更新列表缓存中 ${foodname} 的图片链接。`);
            }
          }
        } catch (cacheErr) {
          console.warn(`[Compare] 更新列表缓存图片链接失败:`, cacheErr);
        }

      } else {
        const errorMsg = res.fileList && res.fileList.length > 0 ? res.fileList[0].errMsg : '未知错误';
        console.error(`[Compare] 重新获取食物 ${foodname} 的临时链接失败: ${errorMsg}`);
        this.setData({ [`food${foodindex === 0 ? '1' : '2'}.img`]: '/images/default_food.png' });
      }
    } catch (err) {
      console.error(`[Compare] 重新获取食物 ${foodname} 图片链接时发生异常:`, err);
      this.setData({ [`food${foodindex === 0 ? '1' : '2'}.img`]: '/images/default_food.png' });
    }
  }
});
