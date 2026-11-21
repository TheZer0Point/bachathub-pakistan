import {
  Fuel,
  HeartPulse,
  Scissors,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  TicketPercent,
  Utensils,
  Footprints,
} from 'lucide-react';
import { CategoryId } from '../types';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  fullName: string;
  bg: string;
  icon: typeof Utensils;
  subFilters: string[];
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'food', label: 'Food', fullName: 'Food & dining offers', bg: '#FF6B2C', icon: Utensils, subFilters: ['Buffet', 'Family Dining', 'Fast Food'] },
  { id: 'clothes', label: 'Clothes', fullName: 'Clothing offers', bg: '#E11D64', icon: Shirt, subFilters: ['Women', 'Men', 'Kids'] },
  { id: 'grocery', label: 'Grocery', fullName: 'Grocery & supermarkets', bg: '#1EA849', icon: ShoppingBasket, subFilters: ['Bundles', 'Clearance'] },
  { id: 'mobiles', label: 'Mobiles', fullName: 'Electronics & mobiles', bg: '#2589E8', icon: Smartphone, subFilters: ['0% Installments', 'Phones'] },
  { id: 'shoes', label: 'Shoes', fullName: 'Footwear, bags & watches', bg: '#9326A8', icon: Footprints, subFilters: ['Sneakers', 'Formal', 'Clearance'] },
  { id: 'health', label: 'Health', fullName: 'Health, pharmacy & labs', bg: '#DC2626', icon: HeartPulse, subFilters: ['Labs', 'Pharmacy'] },
  { id: 'salon', label: 'Salon', fullName: 'Salons, spa & fitness', bg: '#F59E0B', icon: Scissors, subFilters: ['Grooming', 'Spa'] },
  { id: 'travel', label: 'Fuel, travel', fullName: 'Travel, hotels & fuel', bg: '#0D8B7B', icon: Fuel, subFilters: ['Fuel Cashback', 'Hotels'] },
  { id: 'home', label: 'Home', fullName: 'Home decor & furniture', bg: '#6D4C41', icon: Sofa, subFilters: ['Bedding', 'Furniture'] },
  { id: 'promo', label: 'Promo codes', fullName: 'Online promo codes', bg: '#3B4CC0', icon: TicketPercent, subFilters: ['Tested Codes', 'Delivery'] },
];

export function getCategoryMeta(id: CategoryId): CategoryMeta {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[1];
}
