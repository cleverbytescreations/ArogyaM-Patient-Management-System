export type MasterDataType =
  | "consultation_category"
  | "document_type"
  | "visit_type"
  | "follow_up_status"
  | "blood_group"
  | "dietary_preference"
  | "marital_status"
  | "gender"
  | "condition_at_discharge";

export interface MasterDataItem {
  id: number;
  type: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export interface OpSequence {
  id: number;
  category_code: string;
  prefix: string;
  description: string | null;
  last_sequence: number;
  padding_width: number;
  reset_policy: "NEVER" | "YEARLY";
  is_active: boolean;
}
