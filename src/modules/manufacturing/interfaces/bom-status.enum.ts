export const BOM_STATUSES = ['draft', 'approved', 'superseded'] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

export const COMPONENT_TYPES = [
  'upper_material',
  'lining',
  'sole',
  'insole',
  'thread',
  'adhesive',
  'tag',
  'label',
  'sticker',
  'box',
  'polybag',
  'accessory',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const TRIM_COMPONENT_TYPES = new Set<string>([
  'tag',
  'label',
  'sticker',
  'box',
  'polybag',
  'accessory',
]);
