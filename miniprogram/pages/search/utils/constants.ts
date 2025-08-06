// pages/search/utils/constants.ts

// 将云存储的固定前缀定义为常量，请务必替换为您实际的完整前缀
export const CLOUD_STORAGE_FILE_PREFIX = 'cloud://cloud1-5gpt0k1x743339d9.636c-cloud1-5gpt0k1x743339d9-1329700013'; 

export const CACHE_KEY_FOOD_GROUPS = 'cachedFoodGroupsWithImageUrls'; // 缓存键名
export const CACHE_EXPIRATION_TIME = 7 * 24 * 60 * 60 * 1000; // 缓存有效期，例如7天（毫秒）
export const BATCH_SIZE = 50; // 批量获取图片临时链接的数量
