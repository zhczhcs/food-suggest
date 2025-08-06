// pages/search/foodDt/foodDt.ts

// 定义接口，以便更好地类型检查和代码提示
interface NutritionData {
  main: Record<string, string>;
  vitamins?: Record<string, string>;
  minerals?: Record<string, string>;
}

// 根据您提供的数据库结构更新 FoodDetailDoc 接口
interface FoodDetailDoc {
  _id: string; // 文档ID，就是食物名称本身，例如 "阿拉斯加"
  openid?: string; 
  categoryLetter: string; // 食物的分类字母，例如 "A"
  id?: string; 
  importDate?: string; 
  name: string; // 食物名称，与 _id 相同
  nutrition: NutritionData;
  originalFilePath?: string; 
}

// 定义 FoodItem 和 FoodGroup 接口，与 search.ts 保持一致
interface FoodItem {
  name: string;
  id: string; 
  nutrition: NutritionData; // 这里现在可以存储完整的营养数据了
  img?: string; 
  cloudFileId: string; 
}

interface FoodGroup {
  letter: string;
  foods: FoodItem[];
}

// 云存储前缀，与 search 页面保持一致
const CLOUD_STORAGE_FILE_PREFIX = 'cloud://cloud1-5gpt0k1x743339d9.636c-cloud1-5gpt0k1x743339d9-1329700013';

Page({
  data: {
    foodId: '', 
    foodName: '', 
    foodImg: '', 
    foodCloudFileId: '', 
    nutritionData: {} as NutritionData, 
    mainNutritionKeys: [] as string[], 
    vitaminKeys: [] as string[], 
    mineralKeys: [] as string[], 
    loading: true, 
    loadError: false, 
  },

  onLoad(options: { id?: string; name?: string; }) {
    const foodId = options.id || ''; 
    const foodName = options.name || '';

    this.setData({
      foodId: foodId,
      foodName: foodName,
      loading: true,
      loadError: false,
    });

    wx.setNavigationBarTitle({
      title: foodName || '食物详情'
    });

    console.log(`[FoodDetail] 进入食物详情页：ID=${foodId}, 名称=${foodName}`);

    this.loadFoodDetail(foodName); 
  },

  /**
   * 加载食物的详细营养数据和图片
   * @param foodName 要查询的食物名称
   */
  async loadFoodDetail(foodName: string) {
    this.setData({ loading: true, loadError: false }); // 重置加载状态
    const db = wx.cloud.database();
    const foodCollectionName = 'food'; // 数据库集合名称
    const CACHE_KEY_FOOD_GROUPS = 'cachedFoodGroupsWithImageUrls'; // search页面使用的缓存键名
    const CACHE_EXPIRATION_TIME = 60 * 60 * 1000; // 缓存有效期，与search页面保持一致（1小时）

    let allFoodGroupsFromCache: FoodGroup[] | null = null;
    let targetFoodItemInCache: FoodItem | null = null;
    let cacheTimestamp: number = 0;

    let initialFoodImgFromCache: string = ''; // 记录从列表缓存中读取到的图片链接
    let initialCloudFileIdFromCache: string = ''; // 记录从列表缓存中读取到的 cloudFileId

    // --- 1. 尝试从 search 页面缓存的完整列表中查找数据 ---
    try {
      const cachedData = wx.getStorageSync(CACHE_KEY_FOOD_GROUPS);
      if (cachedData && cachedData.data) {
        allFoodGroupsFromCache = cachedData.data;
        cacheTimestamp = cachedData.timestamp;

        // 查找对应的食物项
        for (const group of allFoodGroupsFromCache) {
          const foundFood = group.foods.find(f => f.name === foodName);
          if (foundFood) {
            targetFoodItemInCache = foundFood;
            // 无论营养数据是否完整或过期，先尝试获取图片链接和 cloudFileId
            initialFoodImgFromCache = foundFood.img || '';
            initialCloudFileIdFromCache = foundFood.cloudFileId || '';
            break;
          }
        }

        // 检查缓存是否有效以及营养数据是否已存在且未过期
        if (targetFoodItemInCache && targetFoodItemInCache.nutrition && Object.keys(targetFoodItemInCache.nutrition.main || {}).length > 0 && 
            (Date.now() - cacheTimestamp < CACHE_EXPIRATION_TIME)) {
          console.log(`[FoodDetail] 从列表页缓存中加载食物详情（包括营养数据）成功：${foodName}`);
          this.processNutritionData(targetFoodItemInCache.nutrition);
          this.setData({
            foodImg: initialFoodImgFromCache, // 使用缓存的图片链接
            foodCloudFileId: initialCloudFileIdFromCache, // 使用缓存的 cloudFileId
            loading: false
          });
          return; // 缓存命中且数据完整，直接返回
        } else if (targetFoodItemInCache) {
          // 列表缓存命中，但营养数据不完整或已过期，准备从云端获取
          console.log(`[FoodDetail] 列表缓存命中，但营养数据不完整或已过期，将从云端获取详细营养数据：${foodName}`);
          this.setData({
            foodImg: initialFoodImgFromCache, // 即使营养数据过期，图片链接可能仍然有效，先设置
            foodCloudFileId: initialCloudFileIdFromCache,
          });
        } else {
          console.log(`[FoodDetail] 列表缓存中未找到食物 ${foodName}，将从云端获取所有数据。`);
        }
      } else {
        console.log(`[FoodDetail] 列表缓存不存在或已过期，将从云端获取所有数据。`);
      }
    } catch (e) {
      console.warn(`[FoodDetail] 读取列表页缓存失败:`, e);
      allFoodGroupsFromCache = null; // 确保在异常时重置缓存数据
    }

    // --- 2. 从云数据库加载详细数据 ---
    try {
      const res = await db.collection(foodCollectionName).where({ name: foodName }).get();
      
      if (!res.data || res.data.length === 0) {
        console.warn(`[FoodDetail] 未找到食物 ${foodName} 的详细营养信息。`);
        this.setData({ loadError: true });
        return;
      }

      const foodDetailDoc = res.data[0] as FoodDetailDoc;

      if (foodDetailDoc && foodDetailDoc.nutrition) {
        console.log(`[FoodDetail] 从云数据库加载食物详情成功：${foodName}`);
        this.processNutritionData(foodDetailDoc.nutrition);

        // **优化点：只有在图片链接或 cloudFileId 未从缓存中获取到时，才重新构建并获取图片临时链接**
        let currentFoodImg = initialFoodImgFromCache;
        let currentCloudFileId = initialCloudFileIdFromCache;

        if (!currentFoodImg || !currentCloudFileId) { 
          // 如果缓存中没有图片链接或 cloudFileId，或者图片链接过期，则从云端获取
          const foodLetter = foodDetailDoc.categoryLetter; 
          currentCloudFileId = `${CLOUD_STORAGE_FILE_PREFIX}/result/${foodLetter}/${foodName}.webp`; 
          
          try {
            const tempUrlRes = await wx.cloud.getTempFileURL({ fileList: [currentCloudFileId] });
            if (tempUrlRes.fileList && tempUrlRes.fileList.length > 0 && tempUrlRes.fileList[0].tempFileURL) {
              currentFoodImg = tempUrlRes.fileList[0].tempFileURL;
              console.log(`[FoodDetail] 从云端获取图片临时链接：${currentFoodImg}`);
            } else {
              console.warn(`[FoodDetail] 获取图片临时链接失败 for ${currentCloudFileId}: ${tempUrlRes.fileList?.[0]?.errMsg || '未知错误'}`);
              currentFoodImg = ''; 
            }
          } catch (imgErr) {
            console.error(`[FoodDetail] 获取图片临时链接异常 for ${currentCloudFileId}:`, imgErr);
            currentFoodImg = '';
          }
        } else {
          console.log(`[FoodDetail] 复用列表缓存的图片链接：${currentFoodImg}`);
        }

        this.setData({
          foodImg: currentFoodImg,
          foodCloudFileId: currentCloudFileId, 
        });

        // --- 3. 更新并重新缓存 allFoodGroups ---
        // 确保 allFoodGroupsFromCache 始终是一个可操作的数组
        if (!allFoodGroupsFromCache) {
          allFoodGroupsFromCache = [];
        }

        let foundAndUpdated = false;
        // 查找并更新 existingFoodItem
        for (const group of allFoodGroupsFromCache) {
          const index = group.foods.findIndex(f => f.name === foodName);
          if (index !== -1) {
            group.foods[index].nutrition = foodDetailDoc.nutrition; // **更新完整营养数据**
            group.foods[index].img = currentFoodImg; // 更新图片链接
            group.foods[index].cloudFileId = currentCloudFileId; // 更新 cloudFileId
            foundAndUpdated = true;
            console.log(`[FoodDetail] 已更新列表缓存中食物 ${foodName} 的详细营养数据和图片链接。`);
            break;
          }
        }

        if (!foundAndUpdated) {
          // 如果在现有缓存中没找到，可能是新的食物或者列表缓存不完整，追加进去
          const foodLetter = foodDetailDoc.categoryLetter; // 确保使用从数据库获取的 categoryLetter
          const targetGroup = allFoodGroupsFromCache.find(g => g.letter === foodLetter);
          const newFoodItem: FoodItem = {
            name: foodName,
            id: this.data.foodId, // 使用从参数传递来的id
            nutrition: foodDetailDoc.nutrition,
            img: currentFoodImg,
            cloudFileId: currentCloudFileId
          };
          if (targetGroup) {
            targetGroup.foods.push(newFoodItem);
            console.log(`[FoodDetail] 在现有列表缓存中添加新食物 ${foodName}。`);
          } else {
            // 如果连字母分组都没有，新增一个分组
            allFoodGroupsFromCache.push({ letter: foodLetter, foods: [newFoodItem] });
            allFoodGroupsFromCache.sort((a, b) => a.letter.localeCompare(b.letter)); // 保持排序
            console.log(`[FoodDetail] 在现有列表缓存中添加新的字母分组和食物 ${foodName}。`);
          }
        }

        try {
          wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
            data: allFoodGroupsFromCache,
            timestamp: Date.now() // 更新缓存时间戳，表示数据已刷新
          });
          console.log(`[FoodDetail] 成功将更新后的列表数据存入本地缓存。`);
        } catch (e) {
          console.error(`[FoodDetail] 存储更新后的列表缓存失败:`, e);
        }

      } else {
        console.warn(`[FoodDetail] 从云数据库获取的食物 ${foodName} 数据结构不完整。`);
        this.setData({ loadError: true });
      }

    } catch (err) {
      console.error(`[FoodDetail] 从云数据库加载食物详情失败:`, err);
      this.setData({ loadError: true });
      wx.showToast({
        title: '加载详情失败',
        icon: 'error',
        duration: 2000
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 处理营养数据，提取键名并排序，以便在 WXML 中渲染
   */
  processNutritionData(nutrition: NutritionData) {
    const mainNutritionKeys = nutrition.main ? Object.keys(nutrition.main).sort() : [];
    const vitaminKeys = nutrition.vitamins ? Object.keys(nutrition.vitamins).sort() : [];
    const mineralKeys = nutrition.minerals ? Object.keys(nutrition.minerals).sort() : [];

    this.setData({
      nutritionData: nutrition,
      mainNutritionKeys: mainNutritionKeys,
      vitaminKeys: vitaminKeys,
      mineralKeys: mineralKeys,
    });
  },

  /**
   * 处理食物详情页主图片加载失败的情况，尝试重新获取临时链接
   */
  async onFoodImageError(e: WechatMiniprogram.BaseEvent) {
    const { foodname, cloudfileid } = e.currentTarget.dataset; 
    console.warn(`[FoodDetail] 食物图片加载失败：${foodname}。尝试重新获取临时链接...`);

    if (!cloudfileid) {
      console.error(`[FoodDetail] 无法重新获取图片，缺少 cloudFileId。`);
      this.setData({ foodImg: '/images/default_food.png' }); // 显示默认图
      return;
    }

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [cloudfileid] });
      if (res.fileList && res.fileList.length > 0 && res.fileList[0].tempFileURL) {
        const newTempUrl = res.fileList[0].tempFileURL;
        this.setData({ foodImg: newTempUrl });
        console.log(`[FoodDetail] 成功重新获取并更新食物 ${foodname} 的图片链接。`);

        // **更新统一缓存中的图片链接**
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
                // 注意：这里不更新 timestamp，因为只是图片链接的刷新，不是营养数据的刷新。
                // 只有营养数据从云端获取并更新时，才更新 timestamp。
                foundAndUpdated = true;
                break;
              }
            }
            if (foundAndUpdated) {
              // 重新保存更新后的 allFoodGroups，但保留原有的 timestamp
              wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
                data: allFoodGroups,
                timestamp: cachedData.timestamp // 保留原有时间戳
              });
              console.log(`[FoodDetail] 已更新列表缓存中 ${foodname} 的图片链接。`);
            }
          }
        } catch (cacheErr) {
          console.warn(`[FoodDetail] 更新列表缓存图片链接失败:`, cacheErr);
        }

      } else {
        const errorMsg = res.fileList && res.fileList.length > 0 ? res.fileList[0].errMsg : '未知错误';
        console.error(`[FoodDetail] 重新获取食物 ${foodname} 的临时链接失败: ${errorMsg}`);
        this.setData({ foodImg: '/images/default_food.png' }); // 再次失败，显示默认图
      }
    } catch (err) {
      console.error(`[FoodDetail] 重新获取食物 ${foodname} 图片链接时发生异常:`, err);
      this.setData({ foodImg: '/images/default_food.png' }); // 异常，显示默认图
    }
  }
});
