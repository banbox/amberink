/**
 * Category utilities
 * Centralized category label resolution with i18n support
 */

import * as m from '$lib/paraglide/messages';
import { CATEGORY_KEYS } from '$lib/data';

/**
 * Get localized category label by key
 * @param key - Category key from CATEGORY_KEYS
 * @returns Localized category name
 */
export function getCategoryLabel(key: string): string {
    const labels: Record<string, () => string> = {
        unselected: m.unselected,
        other: m.other,
        technology: m.technology,
        finance: m.finance,
        entertainment: m.entertainment,
        sports: m.sports,
        health: m.health,
        education: m.education,
        travel: m.travel,
        food: m.food,
        fashion: m.fashion,
        automotive: m.automotive,
        real_estate: m.real_estate,
        culture: m.culture,
        art: m.art,
        music: m.music,
        film: m.film,
        gaming: m.gaming,
        science: m.science,
        history: m.history,
        politics: m.politics,
        military: m.military,
        law: m.law,
        society: m.society,
        environment: m.environment,
        parenting: m.parenting,
        pets: m.pets,
        photography: m.photography,
        design: m.design,
        programming: m.programming,
        blockchain: m.blockchain,
        ai: m.ai,
        startup: m.startup,
        career: m.career,
        psychology: m.psychology,
        philosophy: m.philosophy,
        literature: m.literature,
        comics: m.comics,
        digital_life: m.digital_life,
        home_living: m.home_living,
        agriculture: m.agriculture
    };
    return labels[key]?.() ?? key;
}

/**
 * Get localized category name by category ID
 * @param categoryId - Category ID (string or number)
 * @returns Localized category name, empty string for unselected
 */
export function getCategoryName(categoryId: string | number): string {
    const id = typeof categoryId === 'string' ? parseInt(categoryId) : categoryId;
    const key = CATEGORY_KEYS[id];
    if (!key || key === 'unselected') return '';
    return getCategoryLabel(key);
}
