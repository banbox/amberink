/**
 * 文章分类 keys
 * 索引即为 categoryId，0为未选择，1为其他，其余依次后移
 */
export const CATEGORY_KEYS = [
	'unselected', // 0 - 未选择
	'other', // 1 - 其他
	'technology', // 2 - 科技
	'finance', // 3 - 财经
	'entertainment', // 4 - 娱乐
	'sports', // 5 - 体育
	'health', // 6 - 健康
	'education', // 7 - 教育
	'travel', // 8 - 旅游
	'food', // 9 - 美食
	'fashion', // 10 - 时尚
	'automotive', // 11 - 汽车
	'real_estate', // 12 - 房产
	'culture', // 13 - 文化
	'art', // 14 - 艺术
	'music', // 15 - 音乐
	'film', // 16 - 影视
	'gaming', // 17 - 游戏
	'science', // 18 - 科学
	'history', // 19 - 历史
	'politics', // 20 - 政治
	'military', // 21 - 军事
	'law', // 22 - 法律
	'society', // 23 - 社会
	'environment', // 24 - 环境
	'parenting', // 25 - 育儿
	'pets', // 26 - 宠物
	'photography', // 27 - 摄影
	'design', // 28 - 设计
	'programming', // 29 - 编程
	'blockchain', // 30 - 区块链
	'ai', // 31 - 人工智能
	'startup', // 32 - 创业
	'career', // 33 - 职场
	'psychology', // 34 - 心理
	'philosophy', // 35 - 哲学
	'literature', // 36 - 文学
	'comics', // 37 - 动漫
	'digital_life', // 38 - 数码
	'home', // 39 - 家居
	'agriculture' // 40 - 农业
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * Format ETH amount for display to users with 8 decimal places (rounded)
 * For logs and calculations, use formatEther directly for full precision
 * @param wei - Amount in wei
 * @returns Formatted string with up to 8 decimal places
 */
export function formatEthDisplay(wei: bigint): string {
	const ethString = (Number(wei) / 1e18).toFixed(8);
	// Remove trailing zeros after decimal point
	return ethString.replace(/\.?0+$/, '') || '0';
}
