// utils/dataHandlers.ts

import { FoodGroup, FoodItem, SearchPageContext } from './types';
import { CLOUD_STORAGE_FILE_PREFIX, CACHE_KEY_FOOD_GROUPS, CACHE_EXPIRATION_TIME, BATCH_SIZE } from './constants';

// *** 新增一个 Map 来跟踪正在加载的图片，防止重复请求 getTempFileURL ***
const loadingImages = new Map<string, Promise<string | void>>(); // key: foodItem.id, value: Promise of loading operation


/**
 * 辅助函数：当图片加载失败或不存在时，设置一个默认的本地图片。
 * 此函数会遍历 allFoodGroups 和 filteredFoodGroups 来更新图片路径。
 */
export function _setDefaultImageForFood(pageContext: SearchPageContext, foodName: string) {
  const defaultImg = '/images/default_food.png';
  let updatedInAllGroups = false;
  let updatedInFilteredGroups = false;

  // 1. 更新 allFoodGroups
  for (let gIdx = 0; gIdx < pageContext.data.allFoodGroups.length; gIdx++) {
    const group = pageContext.data.allFoodGroups[gIdx];
    for (let fIdx = 0; fIdx < group.foods.length; fIdx++) {
      if (group.foods[fIdx].name === foodName) {
        pageContext.setData({
          [`allFoodGroups[${gIdx}].foods[${fIdx}].img`]: defaultImg,
        });
        updatedInAllGroups = true;
        console.log(`[主线程][_setDefaultImageForFood] 已为 allFoodGroups 中的 ${foodName} 设置默认图片。`);
        break; 
      }
    }
    if (updatedInAllGroups) break;
  }

  // 2. 更新 filteredFoodGroups (可能与 allFoodGroups 的索引不同)
  for (let fgIdx = 0; fgIdx < pageContext.data.filteredFoodGroups.length; fgIdx++) {
    const filteredGroup = pageContext.data.filteredFoodGroups[fgIdx];
    for (let ffIdx = 0; ffIdx < filteredGroup.foods.length; ffIdx++) {
      if (filteredGroup.foods[ffIdx].name === foodName) {
        pageContext.setData({
          [`filteredFoodGroups[${fgIdx}].foods[${ffIdx}].img`]: defaultImg,
        });
        updatedInFilteredGroups = true;
        console.log(`[主线程][_setDefaultImageForFood] 已为 filteredFoodGroups 中的 ${foodName} 设置默认图片。`);
        break; 
      }
    }
    if (updatedInFilteredGroups) break;
  }
}

/**
 * 当 WXML 中的 <image> 标签加载网络图片失败时触发（例如链接过期、网络问题）。
 * 此函数会尝试重新获取临时链接。
 */
export async function onImgError(pageContext: SearchPageContext, e: WechatMiniprogram.BaseEvent) {
  const { foodname, cloudfileid } = e.currentTarget.dataset;
  console.warn(`[主线程][onImgError] 食物 ${foodname} 的图片无法显示。尝试重新获取临时链接...`);

  if (!cloudfileid) {
    console.error(`[主线程][onImgError] 无法重新获取图片，缺少 cloudFileId。`);
    _setDefaultImageForFood(pageContext, foodname);
    return;
  }

  // 查找食物项在 allFoodGroups 中的精确位置
  let foundGroupIndex: number = -1;
  let foundFoodIndex: number = -1;

  for (let gIdx = 0; gIdx < pageContext.data.allFoodGroups.length; gIdx++) {
    const group = pageContext.data.allFoodGroups[gIdx];
    for (let fIdx = 0; fIdx < group.foods.length; fIdx++) {
      if (group.foods[fIdx].cloudFileId === cloudfileid) {
        foundGroupIndex = gIdx;
        foundFoodIndex = fIdx;
        break;
      }
    }
    if (foundGroupIndex !== -1) break;
  }

  if (foundGroupIndex === -1 || foundFoodIndex === -1) {
    console.error(`[主线程][onImgError] 无法在 allFoodGroups 中定位食物项 ${foodname} (cloudFileId: ${cloudfileid})。`);
    _setDefaultImageForFood(pageContext, foodname);
    return;
  }

  // 使用 loadLazyImage 来处理重新获取图片链接的逻辑，避免重复代码
  try {
    // 调用 loadLazyImage，它会处理获取新URL和更新setData
    await loadLazyImage(pageContext, foundGroupIndex, foundFoodIndex); 
    console.log(`[主线程][onImgError] 食物 ${foodname} 的图片已成功重新加载。`);
  } catch (err) {
    console.error(`[主线程][onImgError] 重新获取食物 ${foodname} 的图片链接失败，设置默认图片。`, err);
    _setDefaultImageForFood(pageContext, foodname);
  }
}


/**
 * 为进入可视区域的单个食物项懒加载图片。
 * 此函数由 IntersectionObserver 回调触发，或由 onImgError 触发。
 */
export async function loadLazyImage(pageContext: SearchPageContext, groupIndex: number, foodIndex: number) {
  const foodItem = pageContext.data.filteredFoodGroups[groupIndex]?.foods[foodIndex];

  if (!foodItem || !foodItem.cloudFileId) {
    console.log(`[主线程][loadLazyImage] 无效的食物项或 cloudFileId，跳过懒加载。`);
    return;
  }
  
  const { cloudFileId, name, id: foodId } = foodItem; // 获取 foodId 作为唯一标识

  // 检查是否正在加载，防止重复请求
  if (loadingImages.has(foodId)) {
    console.log(`[主线程][loadLazyImage] ${name} (${foodId}) 正在加载中，跳过重复请求。`);
    return loadingImages.get(foodId); // 返回正在进行的 Promise
  }

  const loadPromise = (async () => {
    try {
      console.log(`[主线程][loadLazyImage] 正在为 ${name} (${cloudFileId}) 获取临时URL...`);
      const res = await wx.cloud.getTempFileURL({ fileList: [cloudFileId] });
      
      if (res.fileList && res.fileList[0].tempFileURL) {
        const newTempUrl = res.fileList[0].tempFileURL;
        
        // 只有当新的URL不同于当前URL时才setData，避免不必要的渲染
        if (pageContext.data.filteredFoodGroups[groupIndex].foods[foodIndex].img !== newTempUrl) {
            pageContext.setData({
              [`filteredFoodGroups[${groupIndex}].foods[${foodIndex}].img`]: newTempUrl
            });
            console.log(`[主线程][loadLazyImage] ${name} 图片URL更新成功: ${newTempUrl}`);
        } else {
            console.log(`[主线程][loadLazyImage] ${name} 图片URL未改变，跳过setData (可能已被其他请求更新)。`);
        }

        // 同时更新 allFoodGroups 中的数据，以保持数据一致性
        const allGroup = pageContext.data.allFoodGroups.find(g => g.letter === pageContext.data.filteredFoodGroups[groupIndex].letter);
        if (allGroup) {
            const allFood = allGroup.foods.find(f => f.id === foodId); // 使用 foodId 查找
            if (allFood && allFood.img !== newTempUrl) {
              allFood.img = newTempUrl; 
              console.log(`[主线程][loadLazyImage] 同步更新 allFoodGroups 中 ${name} 的图片URL。`);
            }
        }
        return newTempUrl; // 返回成功加载的URL
      } else {
        console.warn(`[主线程][loadLazyImage] 获取链接失败 for ${name}: ${res.fileList[0].errMsg}`);
        _setDefaultImageForFood(pageContext, name);
        throw new Error(res.fileList[0].errMsg || '获取临时URL失败'); // 抛出错误以便外部捕获
      }
    } catch (err) {
      console.error(`[主线程][loadLazyImage] 请求链接异常 for ${name}:`, err);
      _setDefaultImageForFood(pageContext, name);
      throw err; // 重新抛出错误
    } finally {
      loadingImages.delete(foodId); // 无论成功失败，都从 Map 中移除
    }
  })();

  loadingImages.set(foodId, loadPromise); // 将 Promise 存入 Map
  return loadPromise;
}

/**
 * 根据当前激活的字母，提前加载前后几个字母区域的图片。
 * @param pageContext 页面上下文
 * @param currentActiveLetter 当前激活的字母
 */
export function proactiveLoadNeighborImages(pageContext: SearchPageContext, currentActiveLetter: string) {
  const { letters, filteredFoodGroups } = pageContext.data;
  const activeIndex = letters.indexOf(currentActiveLetter);
  
  if (activeIndex === -1) {
    console.log(`[主线程][proactiveLoad] 未知激活字母: ${currentActiveLetter}，跳过预加载。`);
    return;
  }

  // 定义预加载的范围：当前字母，以及前后各 3 个字母
  const preloadRangeStart = Math.max(0, activeIndex - 3);
  const preloadRangeEnd = Math.min(letters.length - 1, activeIndex + 3);

  console.log(`[主线程][proactiveLoad] 正在为字母范围 ${letters[preloadRangeStart]} - ${letters[preloadRangeEnd]} 提前加载图片...`);

  for (let i = preloadRangeStart; i <= preloadRangeEnd; i++) {
    const targetLetter = letters[i];
    // 找到该字母对应的食物组在 filteredFoodGroups 中的索引
    const groupIndex = filteredFoodGroups.findIndex(g => g.letter === targetLetter);

    if (groupIndex !== -1) {
      const group = filteredFoodGroups[groupIndex];
      for (let j = 0; j < group.foods.length; j++) {
        // 调用 loadLazyImage，它会处理图片加载和去重
        loadLazyImage(pageContext, groupIndex, j);
      }
    }
  }
}


/**
 * 从云数据库加载食物数据并获取云存储图片链接，并支持本地缓存。
 * 所有操作都在主线程完成。
 */
export async function loadAllFoodData(pageContext: SearchPageContext) {
  pageContext.setData({ loading: true });
  const startTime = Date.now();
  console.log('[主线程][loadAllFoodData] 开始执行。');

  const db = wx.cloud.database();
  const dataCollectionName = 'data';

  try {
    // 1. 优先检查并使用本地缓存
    const cachedData = wx.getStorageSync(CACHE_KEY_FOOD_GROUPS);
    if (cachedData && cachedData.data && (Date.now() - cachedData.timestamp < CACHE_EXPIRATION_TIME)) {
      const cacheDuration = Date.now() - startTime;
      console.log(`[主线程][loadAllFoodData] 从本地缓存加载食物数据成功，耗时 ${cacheDuration}ms。`);
      pageContext.setData({
        allFoodGroups: cachedData.data,
        filteredFoodGroups: cachedData.data,
        loading: false
      });
      wx.nextTick(() => {
        pageContext.initIntersectionObserver(); 
        pageContext.calculateGroupPositions(); 
        pageContext.getLetterNavRect(); 
        // 从缓存加载后，也立即触发一次预加载
        if (pageContext.data.activeLetter) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.activeLetter);
        } else if (pageContext.data.filteredFoodGroups.length > 0) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.filteredFoodGroups[0].letter);
        }
        console.log('[主线程][loadAllFoodData] 从缓存加载后，初始化 IntersectionObserver 和位置计算，并触发预加载。');
      });
      return;
    } else {
      console.log('[主线程][loadAllFoodData] 本地缓存不存在或已过期，将从云端加载。');
    }
  } catch (e) {
    console.warn('[主线程][loadAllFoodData] 读取本地缓存失败:', e);
  }

  console.log('[主线程][loadAllFoodData] 开始从云数据库加载食物数据和图片URL...');

  const allGroups: FoodGroup[] = [];
  const { letters } = pageContext.data;
  const allFileIdsToGetTempUrl: string[] = [];
  const foodItemsData: {
    [letter: string]: {
      foodName: string;
      cloudFileId: string;
    }[]
  } = {};

  try {
    // 2. 从云数据库批量获取原始食物数据 (优化点：将循环查询改为批量查询)
    const _ = db.command;
    let allDocs: any[] = [];
    if (letters && letters.length > 0) {
      try {
        const queryRes = await db.collection(dataCollectionName)
                                 .where({
                                   _id: _.in(letters)
                                 })
                                 .get();
        allDocs = queryRes.data;
        console.log(`[主线程][loadAllFoodData] 批量从云数据库获取 ${allDocs.length} 个文档成功。`);
      } catch (err) {
        console.error('[主线程][loadAllFoodData] 批量从云数据库加载数据失败:', err);
        throw err; 
      }
    } else {
      console.warn('[主线程][loadAllFoodData] letters 列表为空，跳过云数据库查询。');
    }

    // 遍历获取到的文档，填充 foodItemsData 和 allFileIdsToGetTempUrl
    const docsByLetter = new Map<string, any>();
    allDocs.forEach(doc => {
      docsByLetter.set(doc._id, doc);
    });

    for (const letter of letters) { 
      const doc = docsByLetter.get(letter); 
      if (doc && Array.isArray(doc.foodItems)) {
        const jsonFileNames: string[] = doc.foodItems;
        foodItemsData[letter] = [];

        for (const fileName of jsonFileNames) {
          if (fileName.toLowerCase() === 'index.json') {
            continue;
          }
          const foodName = fileName.replace('.json', '');
          const imageCloudPath = `result/${letter}/${foodName}.webp`;
          const cloudFileId = `${CLOUD_STORAGE_FILE_PREFIX}/${imageCloudPath}`;

          allFileIdsToGetTempUrl.push(cloudFileId);
          foodItemsData[letter].push({ foodName, cloudFileId });
        }
      } else {
        console.warn(`[主线程][loadAllFoodData] 云数据库 'data' 集合中字母 ${letter} 的数据缺失或 'foodItems' 字段异常。`);
      }
    }

    // 3. 批量获取图片临时链接
    const imageUrlMap = new Map<string, string>();
    if (allFileIdsToGetTempUrl.length > 0) {
      console.log(`[主线程][loadAllFoodData] 准备获取 ${allFileIdsToGetTempUrl.length} 张图片的临时链接...`);
      for (let i = 0; i < allFileIdsToGetTempUrl.length; i += BATCH_SIZE) {
        const batchFileIds = allFileIdsToGetTempUrl.slice(i, i + BATCH_SIZE);
        const tempUrlRes = await wx.cloud.getTempFileURL({
          fileList: batchFileIds
        });

        for (const item of tempUrlRes.fileList) {
          if (item.tempFileURL) {
            imageUrlMap.set(item.fileID, item.tempFileURL);
          } else {
            console.warn(`[主线程][loadAllFoodData] 获取临时链接失败 for ${item.fileID}: ${item.errMsg}`);
          }
        }
      }
      console.log(`[主线程][loadAllFoodData] 成功获取 ${imageUrlMap.size} 张图片的临时链接。`);
    }

    // 4. 在主线程中处理数据，组装成 FoodGroup 结构并排序
    for (const letter of letters) { 
      const foodsForThisLetter = foodItemsData[letter];
      if (foodsForThisLetter && foodsForThisLetter.length > 0) {
        const foods: FoodItem[] = foodsForThisLetter.map(item => ({
          name: item.foodName,
          id: `${letter}-${item.foodName}`,
          nutrition: { main: {} },
          img: imageUrlMap.get(item.cloudFileId) || '/images/placeholder.png', 
          cloudFileId: item.cloudFileId,
          isSelected: false
        }));
        allGroups.push({ letter, foods });
      }
    }

    allGroups.sort((a, b) => a.letter.localeCompare(b.letter));

    // 5. 将新获取的数据存入本地缓存
    try {
      wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
        data: allGroups,
        timestamp: Date.now()
      });
      console.log('[主线程][loadAllFoodData] 食物数据成功存入本地缓存。');
    } catch (e) {
      console.error('[主线程][loadAllFoodData] 存储本地缓存失败:', e);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[主线程][loadAllFoodData] 所有食物数据处理完成，总耗时 ${duration}ms。`);

    pageContext.setData({
      allFoodGroups: allGroups,
      filteredFoodGroups: allGroups,
      loading: false,
    });
    
    wx.nextTick(() => {
      pageContext.initIntersectionObserver();
      pageContext.calculateGroupPositions();
      pageContext.getLetterNavRect();
      // 数据加载后，也立即触发一次预加载
      if (pageContext.data.activeLetter) {
        proactiveLoadNeighborImages(pageContext, pageContext.data.activeLetter);
      } else if (pageContext.data.filteredFoodGroups.length > 0) { // 首次加载，activeLetter可能还未设置，默认加载第一个字母及其周边
        proactiveLoadNeighborImages(pageContext, pageContext.data.filteredFoodGroups[0].letter);
      }
      console.log('[主线程][loadAllFoodData] 数据更新后，初始化 IntersectionObserver 和位置计算，并触发预加载。');
    });

  } catch (err: any) {
    console.error('[主线程][loadAllFoodData] 从云数据库加载或处理数据失败:', err);
    pageContext.setData({ loading: false });
    wx.showToast({ title: '数据加载异常', icon: 'error' });
  }
}
