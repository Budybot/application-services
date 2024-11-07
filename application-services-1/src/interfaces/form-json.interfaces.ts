// form-json.interfaces.ts
export interface FormJson {
  consultant_role: string;
  consultant_name: string;
  primary_client_name: string;
  primary_client_role: string;
  DD: string[];
  KC1: string[];
  KC2: string[];
  action_items: string[];
  PO: string[];
  company_name: string;
}
export interface ActionItemsJson {
  action_items: string[];
}