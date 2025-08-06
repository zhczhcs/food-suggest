// pages/recipe/recipe.ts
const db = wx.cloud.database(); 

// 定义 Ingredient 接口，新增 isFoodDtAvailable 属性
interface Ingredient {
  name: string;
  quantity: string;
  isFoodDtAvailable?: boolean; 
}

// 定义 Recipe 接口，使用更新后的 Ingredient 接口
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
  mealType: string; 
  date: string; 
  timestamp: number; 
  _openid?: string; 
}

Page({
  data: {
    pageTitle: '菜谱列表', 
    categoryName: '', 
    recipes: [] as Recipe[],
    
    showAddDietModal: false, 
    currentRecipeToAdd: null as Recipe | null, 
    // <<<<<<<<<< 移除 mealTypeOptions 和 selectedMealTypes
  },

  onLoad: function (options) {
    const categoryName = options.name || '未知分类'; 

    this.setData({
      categoryName: categoryName,
      pageTitle: `${categoryName}` 
    });

    if (categoryName && categoryName !== '未知分类') {
      this.fetchRecipesByCategory(categoryName); 
    } else {
      console.warn("未接收到有效的菜谱分类名称，请检查跳转链接！");
      wx.showToast({
        title: '分类信息缺失',
        icon: 'none'
      });
    }
  },

  fetchRecipesByCategory: async function (queryName: string) { 
    wx.showLoading({
      title: '加载中...',
    });
    try {
      let queryCondition: any = {};

      if (queryName.endsWith('菜谱')) {
        const tagName = queryName.replace('菜谱', ''); 
        queryCondition.tags = db.command.all([tagName]); 
        console.log(`执行标签查询: tags 包含 "${tagName}" (使用 db.command.all)`);
      } else {
        queryCondition.category = queryName;
        console.log(`执行分类查询: category 为 "${queryName}"`);
      }

      const res = await db.collection('recipes').where(queryCondition).get(); 
      let fetchedRecipes = res.data as Recipe[]; 

      if (fetchedRecipes.length > 0) {
        const allIngredientNames = new Set<string>();
        fetchedRecipes.forEach(recipe => {
          recipe.ingredients.forEach(ingredient => {
            allIngredientNames.add(ingredient.name);
          });
        });

        const ingredientNamesArray = Array.from(allIngredientNames);
        const foodAvailabilityMap = new Map<string, boolean>();

        if (ingredientNamesArray.length > 0) {
          try {
            const foodExistenceRes = await db.collection('food').where({
              name: db.command.in(ingredientNamesArray)
            }).field({ name: true }).get(); 

            const existingFoodNames = new Set(foodExistenceRes.data.map((item: any) => item.name));
            
            ingredientNamesArray.forEach(name => {
              foodAvailabilityMap.set(name, existingFoodNames.has(name));
            });
          } catch (foodCheckErr) {
            console.error('查询食材是否存在出错:', foodCheckErr);
            ingredientNamesArray.forEach(name => {
              foodAvailabilityMap.set(name, false);
            });
          }
        }

        fetchedRecipes = fetchedRecipes.map(recipe => {
          const updatedIngredients = recipe.ingredients.map(ingredient => ({
            ...ingredient, 
            isFoodDtAvailable: foodAvailabilityMap.get(ingredient.name) || false 
          }));
          return { ...recipe, ingredients: updatedIngredients };
        });
      }

      this.setData({
        recipes: fetchedRecipes 
      });
      
      if (fetchedRecipes.length === 0) {
        wx.showToast({
          title: '当前分类暂无菜谱',
          icon: 'none'
        });
      }

    } catch (err) {
      console.error('获取菜谱失败:', err);
      wx.hideLoading(); 
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading(); 
    }
  },

  onIngredientClick: async function(e: WechatMiniprogram.TouchEvent) { 
    const foodName = e.currentTarget.dataset.name as string; 
    console.log('点击了食材:', foodName);

    if (!foodName) {
      wx.showToast({
        title: '食材名称缺失',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在查询食材...',
      mask: true 
    });

    try {
      const res = await db.collection('food').where({ 
        name: foodName
      }).count(); 

      wx.hideLoading();

      if (res.total > 0) {
        wx.navigateTo({
          url: `/pages/search/foodDt/foodDt?name=${foodName}`, 
          success: () => {
            console.log(`跳转到 ${foodName} 详情页成功`);
          },
          fail: (err) => {
            console.error(`跳转食物详情页失败:`, err);
            wx.showToast({
              title: '跳转失败，请稍后重试',
              icon: 'none'
            });
          }
        });
      } else {
        wx.showToast({
          title: `暂无 ${foodName} 的详细信息`,
          icon: 'none',
          duration: 2000
        });
        console.warn(`数据库中未找到食材: ${foodName} 的详情`);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('查询食材详情失败:', err);
      wx.showToast({
        title: '查询失败，请重试',
        icon: 'none'
      });
    }
  },

  goToRecipeDetail: function(e: WechatMiniprogram.TouchEvent) {
    const recipe = e.currentTarget.dataset.recipe;
    console.log('点击了菜谱卡片:', recipe.name);
    wx.showToast({
      title: `点击了卡片：${recipe.name}`,
      icon: 'none'
    });
  },

  /**
   * 点击“添加到今日饮食记录”按钮，打开弹窗
   * <<<<<<<<<< 简化，不再需要复杂的 setTimeout 重置，因为没有复选框状态需要重置
   */
  onAddToDietClick: function(e: WechatMiniprogram.TouchEvent) {
    const recipe = e.currentTarget.dataset.recipe as Recipe;
    console.log('点击添加到今日饮食记录:', recipe.name);

    this.setData({
      showAddDietModal: true,
      currentRecipeToAdd: recipe, 
    });
  },

  // <<<<<<<<<< 移除 onMealTypeChange 方法，不再需要
  // onMealTypeChange: function(e: WechatMiniprogram.CustomEvent) {
  //   this.setData({
  //     selectedMealTypes: e.detail.value as string[]
  //   });
  //   console.log('选择的餐次:', this.data.selectedMealTypes);
  // },

  /**
   * 点击弹窗中的餐次按钮（确认添加特定餐次）
   * <<<<<<<<<< 新增方法，取代 onConfirmAddToDiet
   */
  onAddMealType: async function(e: WechatMiniprogram.TouchEvent) {
    const { currentRecipeToAdd } = this.data;
    const mealType = e.currentTarget.dataset.mealtype as string; // 获取点击的餐次

    if (!currentRecipeToAdd) {
      wx.showToast({ title: '未选择菜谱', icon: 'none' });
      this.onCancelAddToDiet(); 
      return;
    }

    wx.showLoading({ title: `正在添加到${mealType}餐...`, mask: true });

    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;

      const record: DailyDietRecord = {
        recipeId: currentRecipeToAdd._id,
        recipeName: currentRecipeToAdd.name,
        recipeImagePath: currentRecipeToAdd.imagePath,
        mealType: mealType, // 使用按钮对应的餐次
        date: formattedDate,
        timestamp: Date.now(),
      };

      await db.collection('dailyDietRecords').add({
        data: record
      });

      wx.hideLoading();
      wx.showToast({
        title: `已成功添加到${mealType}餐！`,
        icon: 'success',
        duration: 1500
      });
      console.log(`菜谱已成功添加到${mealType}餐的饮食记录。`);

      this.onCancelAddToDiet(); // 添加成功后关闭弹窗
    } catch (err) {
      wx.hideLoading();
      console.error('添加饮食记录失败，错误信息:', err); 
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'none'
      });
    }
  },

  // <<<<<<<<<< 移除 onConfirmAddToDiet 方法，不再需要
  // onConfirmAddToDiet: async function() { /* ... */ },

  /**
   * 点击弹窗中的“取消”按钮或遮罩层（取消添加）
   */
  onCancelAddToDiet: function() {
    this.setData({
      showAddDietModal: false,
      currentRecipeToAdd: null,
      // <<<<<<<<<< 移除 selectedMealTypes 的重置
    });
    console.log('取消添加饮食记录。');
  },

  /**
   * 阻止事件冒泡，防止点击弹窗内容时关闭弹窗
   */
  stopBubble: function() {}
});
