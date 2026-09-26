import type { PartnerMenuItem, PartnerMenuVariant } from '@foodops-partner/client';

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface CartModifier { groupId: string; groupName: string; modifierId: string; name: string; price: number; quantity: number }
export interface CartLine {
  lineId: string;
  productId: string;
  itemName: string;
  variantId: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  note: string;
  modifiers: CartModifier[];
}
export interface ModifierSelection { modifierId: string; quantity: number }

/** Why this selection cannot be added yet, or null. Mirrors the API's invalid_line rules so a refusal never surprises. */
export function selectionProblem(item: PartnerMenuItem, variant: PartnerMenuVariant | undefined, selection: ModifierSelection[]): string | null {
  if (!variant) return 'Choose a size.';
  if (!variant.available) return `${variant.name} is not available right now.`;
  for (const group of item.modifierGroups) {
    const count = selection.filter((s) => group.modifiers.some((m) => m.modifierId === s.modifierId)).reduce((n, s) => n + s.quantity, 0);
    if (count < group.min) return `${group.name}: choose at least ${group.min}.`;
    if (count > group.max) return `${group.name}: at most ${group.max}.`;
  }
  const known = new Set(item.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.modifierId)));
  if (selection.some((s) => !known.has(s.modifierId))) return 'A chosen modifier is not on this item any more. Refresh the menu.';
  return null;
}

export function lineFromSelection(item: PartnerMenuItem, variant: PartnerMenuVariant, selection: ModifierSelection[], quantity: number, note: string): CartLine {
  const modifiers: CartModifier[] = [];
  for (const group of item.modifierGroups) {
    for (const modifier of group.modifiers) {
      const picked = selection.find((s) => s.modifierId === modifier.modifierId);
      if (picked && picked.quantity > 0) {
        modifiers.push({ groupId: group.id, groupName: group.name, modifierId: modifier.modifierId, name: modifier.name, price: modifier.price, quantity: picked.quantity });
      }
    }
  }
  return {
    lineId: crypto.randomUUID(), productId: item.productId, itemName: item.name,
    variantId: variant.variantId, variantName: variant.name, unitPrice: variant.price, quantity, note, modifiers,
  };
}

export function lineTotal(line: CartLine): number {
  return round2(line.quantity * (line.unitPrice + line.modifiers.reduce((sum, m) => sum + m.price * m.quantity, 0)));
}

/** What the partner would charge from the menu alone. The restaurant's total may differ; that is what priceMismatch reports. */
export function estimateTotal(lines: CartLine[]): number {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}
