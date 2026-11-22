// lib/marketplace/categoryMeta.ts

import type { ComponentType } from 'react';
import {
  Apple, Armchair, BookOpen, Car, Cpu, Laptop, Package, Shirt, Smartphone, Sparkles,
} from 'lucide-react';

export type CategoryDisplay = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

/** Display name and icon for each canonical catalogue category. */
export const CATEGORY_META: Record<string, CategoryDisplay> = {
  phones: { label: 'Phones & Tablets', Icon: Smartphone },
  laptops: { label: 'Laptops', Icon: Laptop },
  electronics: { label: 'Electronics', Icon: Cpu },
  fashion: { label: 'Fashion', Icon: Shirt },
  furniture: { label: 'Home & Living', Icon: Armchair },
  groceries: { label: 'Groceries', Icon: Apple },
  beauty: { label: 'Beauty', Icon: Sparkles },
  vehicles: { label: 'Vehicles', Icon: Car },
  books: { label: 'Books', Icon: BookOpen },
};

/** Canonical slugs in merchandising order, so browsing works before listings exist. */
export const CURATED_CATEGORIES = Object.keys(CATEGORY_META);

export function categoryMeta(category: string): CategoryDisplay {
  return CATEGORY_META[category.trim().toLowerCase()] || { label: category, Icon: Package };
}

/** A listing counts as live when a buyer could actually check it out. */
export function isProductLive(product: { quantity: number; stockStatus: string }): boolean {
  return product.quantity > 0 && (product.stockStatus === 'IN_STOCK' || product.stockStatus === 'LOW_STOCK');
}
