import { apiClient } from "@/api/client";
import type { MasterDataItem, MasterDataType, OpSequence } from "@/types/masterData";

export const masterDataApi = {
  list: (type: MasterDataType, active = true) =>
    apiClient
      .get<MasterDataItem[]>(`/master-data/${type}`, { params: { active } })
      .then((r) => r.data),

  listOpSequences: () =>
    apiClient.get<OpSequence[]>("/op-sequences").then((r) => r.data),
};
