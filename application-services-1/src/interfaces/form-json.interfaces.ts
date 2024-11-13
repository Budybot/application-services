// form-json.interfaces.ts
export interface FormJson {
  consultant_role: string;
  consultant_name: string;
  primary_client_name: string;
  primary_client_role: string;
  DD: string[];
  KC1: string[];
  KC2: string[];
  action_items: ActionItem[];
  PO: string[];
  company_name: string;
}
export interface ActionItem {
  text: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ActionItemsJson {
  action_items: ActionItem[];
}
export function validateFormJson(data: any): asserts data is FormJson {
  const requiredKeys = [
    'consultant_role',
    'consultant_name',
    'primary_client_name',
    'primary_client_role',
    'DD',
    'KC1',
    'KC2',
    'PO',
    'company_name',
  ];
  const missingKeys = requiredKeys.filter((key) => !(key in data));
  if (missingKeys.length > 0) {
    throw new Error(`Form JSON is missing keys: ${missingKeys.join(', ')}`);
  }
}

export function validateActionItemsJson(
  data: any,
): asserts data is ActionItemsJson {
  if (!data.action_items || !Array.isArray(data.action_items)) {
    throw new Error('Action Items JSON is missing the "action_items" array');
  }

  data.action_items.forEach((item: any, index: number) => {
    if (typeof item.text !== 'string') {
      throw new Error(
        `Action item at index ${index} is missing a valid "text" field`,
      );
    }
    if (!['high', 'medium', 'low'].includes(item.priority)) {
      throw new Error(
        `Action item at index ${index} has an invalid "priority" value`,
      );
    }
  });
}
