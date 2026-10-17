export const OWNER_DATA_TYPE_ID = 1042;
export const OWNER_DATA_CATEGORY_ID = 14;

export const OWNER_LIST_FILTER_FIELDS = {
  community: "PARENT_ID_1058",
  communityAlt: "parentId1058",
  subCommunity: "PARENT_ID_1062",
  subCommunityAlt: "parentId1062",
  unitType: "UF_CRM5_1734246899822",
  unitTypeAlt: "ufCrm5_1734246899822",
  beds: "UF_CRM5_1734246780476",
  bedsAlt: "ufCrm5_1734246780476",
};

function fallbackStageIds(purpose = "") {
  const prefix = `DT${OWNER_DATA_TYPE_ID}_${OWNER_DATA_CATEGORY_ID}`;
  if (purpose === "rent") return [`${prefix}:RENT`];
  if (purpose === "sale") return [`${prefix}:SALE`];
  if (purpose === "sale_rent") return [`${prefix}:BOTH`, `${prefix}:SALERENT`];
  return [`${prefix}:RENT`, `${prefix}:SALE`, `${prefix}:BOTH`, `${prefix}:SALERENT`];
}

function uniqueIds(values) {
  return [...new Set((values || []).map((id) => String(id || "").replace(/\D/g, "")).filter(Boolean))];
}

function uniqueText(values) {
  return [...new Set((values || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function cleanLabel(label) {
  const name = String(label || "").trim();
  if (!name || /^empty\b/i.test(name) || name === "—") return "";
  return name;
}

function labeled(params, field, value, label) {
  const id = String(value || "").trim();
  if (!id) return;
  params.set(field, id);
  const name = cleanLabel(label);
  if (name) params.set(`${field}_label`, name);
}

function setFilterField(params, field, values, label = "") {
  const list = uniqueIds(values);
  if (!list.length) return;
  if (list.length === 1) {
    labeled(params, field, list[0], label);
    return;
  }
  for (const id of list) params.append(`${field}[]`, id);
  const name = cleanLabel(label);
  if (name) params.set(`${field}_label`, name);
}

function markEmpty(params, field) {
  params.set(`${field}_isEmpty`, "Y");
}

export function ownerDataListPath({
  agentId = "",
  agentName = "",
  purpose = "",
  stageIds = [],
  stageName = "",
  itemIds = [],
  communityIds = [],
  communityName = "",
  communityEmpty = false,
  subCommunityIds = [],
  subCommunityName = "",
  subCommunityEmpty = false,
  unitTypeIds = [],
  unitTypeName = "",
  unitTypeEmpty = false,
  bedValues = [],
  bedName = "",
  bedsEmpty = false,
} = {}) {
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  const agent = String(agentId || "").replace(/\D/g, "");
  if (agent) labeled(params, "ASSIGNED_BY_ID", agent, agentName);

  const ids = uniqueIds(itemIds);
  // Many ID[] values get truncated, so Bitrix keeps only Responsible person and shows mixed stages.
  if (ids.length === 1) params.set("ID", ids[0]);

  if (communityEmpty) {
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.community);
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.communityAlt);
  } else {
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.community, communityIds, communityName);
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.communityAlt, communityIds, communityName);
  }
  if (subCommunityEmpty) {
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.subCommunity);
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.subCommunityAlt);
  } else {
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.subCommunity, subCommunityIds, subCommunityName);
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.subCommunityAlt, subCommunityIds, subCommunityName);
  }
  if (unitTypeEmpty) {
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.unitType);
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.unitTypeAlt);
  } else {
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.unitType, unitTypeIds, unitTypeName);
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.unitTypeAlt, unitTypeIds, unitTypeName);
  }
  if (bedsEmpty) {
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.beds);
    markEmpty(params, OWNER_LIST_FILTER_FIELDS.bedsAlt);
  } else {
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.beds, bedValues, bedName);
    setFilterField(params, OWNER_LIST_FILTER_FIELDS.bedsAlt, bedValues, bedName);
  }

  const stages = uniqueText(stageIds);
  if (stages.length === 1) {
    params.append("STAGE_ID[]", stages[0]);
    const name = cleanLabel(stageName);
    if (name) params.set("STAGE_ID_label", name);
  } else if (stages.length) {
    for (const id of stages) params.append("STAGE_ID[]", id);
  } else if (ids.length !== 1) {
    const list = fallbackStageIds(purpose);
    for (const id of list) params.append("STAGE_ID[]", id);
  }
  return `/crm/type/${OWNER_DATA_TYPE_ID}/list/category/${OWNER_DATA_CATEGORY_ID}/?${params}`;
}

function rowDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function sameIds(rows, pick) {
  const ids = uniqueIds(rows.map(pick));
  if (!ids.length || !rows.every((row) => ids.includes(rowDigits(pick(row))))) return [];
  return ids;
}

function blankOfficeName(value) {
  const name = String(value || "").trim();
  return !name || name === "—" || /^empty\b/i.test(name) || /^no cluster$/i.test(name);
}

/**
 * CRM list for an Office Inventory slice.
 * Stage is always set from the cards. A locked field is added only when every
 * card in the slice shares that field, so the CRM quantity stays the same.
 * Returns "" when the slice cannot be selected with those CRM filters.
 */
export function officeOwnerListPath(rows = [], locks = {}) {
  const list = (rows || []).filter((row) => rowDigits(row?.id));
  if (!list.length) return "";
  const stages = uniqueText(list.map((row) => row.stage));
  if (!stages.length || !list.every((row) => stages.includes(String(row.stage || "").trim()))) return "";

  const args = {
    stageIds: stages,
    stageName: stages.length === 1 ? String(list[0].stageLabel || "") : "",
  };

  if (locks.lockAgent) {
    const ids = sameIds(list, (row) => row.agentId);
    if (ids.length !== 1) return "";
    args.agentId = ids[0];
    args.agentName = String(list[0].agent || list[0].agentName || "");
  }

  if (locks.lockCommunity) {
    const ids = sameIds(list, (row) => row.communityId);
    if (ids.length === 1) {
      args.communityIds = ids;
      const name = String(list.find((row) => rowDigits(row.communityId))?.community || "");
      args.communityName = blankOfficeName(name) ? "" : name;
    } else if (list.every((row) => !rowDigits(row.communityId) && blankOfficeName(row.community))) {
      args.communityEmpty = true;
    } else return "";
  }

  if (locks.lockSub) {
    const ids = sameIds(list, (row) => row.subCommunityId);
    if (ids.length === 1) {
      args.subCommunityIds = ids;
      const name = String(list.find((row) => rowDigits(row.subCommunityId))?.cluster || list.find((row) => rowDigits(row.subCommunityId))?.subCommunity || "");
      args.subCommunityName = blankOfficeName(name) ? "" : name;
    } else if (list.every((row) => !rowDigits(row.subCommunityId) && blankOfficeName(row.cluster || row.subCommunity))) {
      args.subCommunityEmpty = true;
    } else return "";
  }

  if (locks.lockType) {
    const ids = sameIds(list, (row) => row.unitTypeId);
    const names = uniqueText(list.map((row) => row.typeLabel)).filter((name) => !blankOfficeName(name));
    if (ids.length && names.length === 1 && list.every((row) => rowDigits(row.unitTypeId))) {
      args.unitTypeIds = ids;
      args.unitTypeName = names[0];
    } else if (list.every((row) => !rowDigits(row.unitTypeId)) && names.length <= 1) {
      args.unitTypeEmpty = true;
    } else return "";
  }

  if (locks.lockBeds) {
    const ids = sameIds(list, (row) => row.bedEnumId);
    const names = uniqueText(list.map((row) => row.bedLabel)).filter((name) => !blankOfficeName(name));
    if (ids.length && names.length === 1 && list.every((row) => rowDigits(row.bedEnumId))) {
      args.bedValues = ids;
      args.bedName = names[0];
    } else if (list.every((row) => !rowDigits(row.bedEnumId)) && names.length === 0) {
      args.bedsEmpty = true;
    } else return "";
  }

  return ownerDataListPath(args);
}
