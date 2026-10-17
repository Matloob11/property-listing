/** Bitrix CRM list UI query — must match Infographics Check filters (agent, period, stage). */

export function bitrixUiDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

const LEAD_CLIENT_TYPE_FIELD = "UF_CRM_1756638760279";

function appendDateRange(params, from, to) {
  const dateFrom = bitrixUiDate(from);
  const dateTo = bitrixUiDate(to);
  if (!dateFrom && !dateTo) return;
  params.set("DATE_CREATE_datesel", "RANGE");
  if (dateFrom) params.set("DATE_CREATE_from", dateFrom);
  if (dateTo) params.set("DATE_CREATE_to", dateTo);
}

function crmExactIdPath(entity, ids, { agentId, from, to } = {}) {
  const base = entity === "deal" ? "/crm/deal/list/" : "/crm/lead/list/";
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  if (agentId) params.set("ASSIGNED_BY_ID", String(agentId));
  appendDateRange(params, from, to);
  if (ids.length === 1) {
    params.set("ID_numsel", "exact");
    params.set("ID_from", ids[0]);
    params.set("ID_to", ids[0]);
  } else {
    // This portal ignores ID_from[] on the lead list. ID[] is the multi-value form.
    for (const id of ids) params.append("ID[]", id);
  }
  return `${base}?${params.toString()}`;
}

/** CRM list for one lead-detail box. The filter is the community, stage, beds, type and client type that select only these leads. */
export function crmLeadSlicePath({ agentId = "", agentName = "", from = "", to = "", leads = [], universe = null, truncated = false } = {}) {
  const stamp = (row) => ({
    ...row,
    agentId: String(row?.agentId || agentId || "").replace(/\D/g, ""),
    agentName: row?.agentName || agentName || "",
  });
  const rows = (Array.isArray(leads) ? leads : []).map(stamp).filter((row) => leadKey(row));
  if (!rows.length) return "/crm/lead/list/";
  if (truncated && rows.length <= 1200) return officeLeadIdPath(rows, from, to);
  const all = Array.isArray(universe) ? universe.map(stamp) : null;
  const path = officeLeadRowsPath({ from, to, leads: rows, universe: all });
  if (path) return path;
  const ids = rows.map((row) => leadKey(row));
  return crmExactIdPath("lead", ids, { agentId: rows[0].agentId, from, to });
}

export function crmListPath(entity, { semantic, agentId, statusId, sourceId, from, to, leadIds, field, fieldValues, fieldLabel, fields } = {}) {
  const base = entity === "deal" ? "/crm/deal/list/" : "/crm/lead/list/";
  const params = new URLSearchParams();
  const ids = [...new Set((leadIds || []).map((id) => String(id || "").replace(/\D/g, "")).filter(Boolean))];
  if (ids.length) return crmExactIdPath(entity, ids, { agentId, from, to });
  if (semantic) {
    params.set("apply_filter", "Y");
    params.set(entity === "deal" ? "STAGE_SEMANTIC_ID" : "STATUS_SEMANTIC_ID", semantic);
  }
  if (statusId) {
    params.set("apply_filter", "Y");
    params.set(entity === "deal" ? "STAGE_ID" : "STATUS_ID", String(statusId));
  }
  if (sourceId) {
    params.set("apply_filter", "Y");
    params.set("SOURCE_ID", String(sourceId));
  }
  if (agentId) {
    params.set("apply_filter", "Y");
    params.set("ASSIGNED_BY_ID", String(agentId));
  }
  if (from || to) params.set("apply_filter", "Y");
  appendDateRange(params, from, to);
  const extras = [];
  if (field) extras.push({ field, values: fieldValues, label: fieldLabel });
  for (const item of Array.isArray(fields) ? fields : []) extras.push(item);
  for (const item of extras) {
    const values = [...new Set((item?.values || []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (!item?.field || !values.length) continue;
    params.set("apply_filter", "Y");
    if (values.length === 1) {
      params.set(item.field, values[0]);
      if (item.label) params.set(`${item.field}_label`, item.label);
    } else {
      for (const value of values) params.append(`${item.field}[]`, value);
    }
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

const OFFICE_LEAD_FIELDS = [
  ["agent", "agentId", ""],
  ["purpose", "clientTypeId", "UF_CRM_1756638760279"],
  ["community", "communityId", "UF_CRM_1763390140"],
  ["cluster", "clusterId", "UF_CRM_1763390179"],
  ["beds", "bedsId", "UF_CRM_1731838126127"],
  ["type", "typeId", "UF_CRM_1760707292"],
];

const COMMUNITY_TEXT_FIELD = "UF_CRM_1770537051525";

const OFFICE_ROW_KEY = {
  UF_CRM_1756638760279: "clientTypeId",
  UF_CRM_1763390140: "communityId",
  [COMMUNITY_TEXT_FIELD]: "communityText",
  UF_CRM_1763390179: "clusterId",
  UF_CRM_1731838126127: "bedsId",
  UF_CRM_1760707292: "typeId",
};

function uniqueText(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function matchesOfficeFields(row, agentId, fields) {
  if (agentId && String(row?.agentId || "").trim() !== agentId) return false;
  for (const item of fields) {
    const key = OFFICE_ROW_KEY[item.field];
    const value = String(row?.[key] || "").trim();
    if (!item.values.includes(value)) return false;
  }
  return true;
}

/** CRM list for one office-lead slice. Opens only when the Bitrix fields select exactly these leads. */
export function officeLeadFilterPath({ from = "", to = "", leads = [], by = "total", universe = null } = {}) {
  const rows = Array.isArray(leads) ? leads : [];
  if (!rows.length) return "";
  const fields = [];
  let agentId = "";
  for (const [name, key, field] of OFFICE_LEAD_FIELDS) {
    const values = uniqueText(rows.map((row) => row?.[key]));
    const allSet = rows.every((row) => String(row?.[key] || "").trim());
    if (name === by && by !== "total" && (!allSet || values.length !== 1)) return "";
    if (!allSet || values.length !== 1) continue;
    if (name === "agent") agentId = values[0];
    else fields.push({ field, values, label: officeFieldLabel(name, rows) });
  }
  const communityField = fields.find((item) => item.field === "UF_CRM_1763390140");
  if (communityField) {
    const texts = uniqueText(rows.map((row) => row?.communityText));
    if (texts.length === 1) fields.push({ field: COMMUNITY_TEXT_FIELD, values: texts });
  }
  if (Array.isArray(universe)) {
    const wanted = new Set(rows.map((row) => String(row?.id || "")).filter(Boolean));
    const matched = universe.filter((row) => matchesOfficeFields(row, agentId, fields));
    if (matched.length !== wanted.size || matched.some((row) => !wanted.has(String(row?.id || "")))) return "";
  }
  return crmListPath("lead", { from, to, agentId, fields });
}

function officeFieldLabel(name, rows) {
  const key = name === "community" ? "community" : name === "cluster" ? "cluster" : name === "type" ? "type" : name === "beds" ? "bedLabel" : "";
  if (!key) return "";
  const labels = uniqueText(rows.map((row) => row?.[key]));
  if (labels.length !== 1 || /^empty\b/i.test(labels[0])) return "";
  return labels[0];
}

const OFFICE_ROW_FIELD = {
  purpose: "UF_CRM_1756638760279",
  community: "UF_CRM_1763390140",
  cluster: "UF_CRM_1763390179",
  beds: "UF_CRM_1731838126127",
  type: "UF_CRM_1760707292",
};

const PURPOSE_CLIENT_TYPE = {
  rent: "1220",
};

const BLANK_LEAD_FIELDS = [
  "UF_CRM_1760707563281",
  "UF_CRM_1760707550978",
  "UF_CRM_1770537051525",
  "UF_CRM_1763390140",
  "UF_CRM_1763390179",
  "UF_CRM_1731838126127",
  "UF_CRM_1760707292",
  "UF_CRM_1756638760279",
];

/** CRM list for leads with no reference and no listing details. Bitrix counts this as the No details box. */
export function officeLeadBlankPath({ from = "", to = "" } = {}) {
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  appendDateRange(params, from, to);
  params.set("OPPORTUNITY_numsel", "exact");
  params.set("OPPORTUNITY_from", "0");
  params.set("OPPORTUNITY_to", "0");
  for (const field of BLANK_LEAD_FIELDS) params.set(`${field}_isEmpty`, "Y");
  return `/crm/lead/list/?${params.toString()}`;
}

const MAX_EXACT_LEAD_IDS = 500;

function leadKey(row) {
  return String(row?.id || row?.ID || "").replace(/\D/g, "");
}

function sameLeadSet(rows, wanted) {
  if (rows.length !== wanted.size) return false;
  return rows.every((row) => wanted.has(leadKey(row)));
}

function oneFilled(rows, key) {
  const first = String(rows[0]?.[key] || "").trim();
  if (!first) return "";
  return rows.every((row) => String(row?.[key] || "").trim() === first) ? first : "";
}

function applyStatusIds(params, statusIds) {
  if (statusIds.length === 1) params.set("STATUS_ID", statusIds[0]);
  else for (const id of statusIds) params.append("STATUS_ID[]", id);
}

function selectionConstraints(rows) {
  const catalog = [];
  const statusIds = uniqueText(rows.map((row) => row?.statusId));
  if (statusIds.length && statusIds.length <= 15 && rows.every((row) => statusIds.includes(String(row?.statusId || "").trim()))) {
    catalog.push({
      match: (row) => statusIds.includes(String(row?.statusId || "").trim()),
      apply: (params) => applyStatusIds(params, statusIds),
    });
  }
  const clientTypeId = oneFilled(rows, "clientTypeId");
  if (clientTypeId) {
    const label = oneFilled(rows, "clientType");
    catalog.push({
      match: (row) => String(row?.clientTypeId || "").trim() === clientTypeId,
      apply: (params) => {
        params.set(LEAD_CLIENT_TYPE_FIELD, clientTypeId);
        if (label) params.set(`${LEAD_CLIENT_TYPE_FIELD}_label`, label);
      },
    });
  } else if (rows.every((row) => !String(row?.clientTypeId || "").trim())) {
    catalog.push({
      match: (row) => !String(row?.clientTypeId || "").trim(),
      apply: (params) => params.set(`${LEAD_CLIENT_TYPE_FIELD}_isEmpty`, "Y"),
    });
  }
  const agentId = oneFilled(rows, "agentId");
  if (agentId) {
    catalog.push({
      match: (row) => String(row?.agentId || "").trim() === agentId,
      apply: (params) => params.set("ASSIGNED_BY_ID", agentId),
    });
  }
  const communityText = oneFilled(rows, "communityText");
  if (communityText && !/^empty\b/i.test(communityText)) {
    catalog.push({
      match: (row) => String(row?.communityText || "").trim() === communityText,
      apply: (params) => params.set(COMMUNITY_TEXT_FIELD, communityText),
    });
  }
  for (const [key, field] of [
    ["communityId", "UF_CRM_1763390140"],
    ["clusterId", "UF_CRM_1763390179"],
    ["bedsId", "UF_CRM_1731838126127"],
    ["typeId", "UF_CRM_1760707292"],
  ]) {
    const value = oneFilled(rows, key);
    if (!value) continue;
    catalog.push({
      match: (row) => String(row?.[key] || "").trim() === value,
      apply: (params) => params.set(field, value),
    });
  }
  return catalog;
}

function combinations(items, size) {
  if (!size) return [[]];
  const out = [];
  function walk(start, picked) {
    if (picked.length === size) {
      out.push(picked.slice());
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      picked.push(items[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return out;
}

function exactOfficeFieldPath(rows, universe, { from, to }) {
  const wanted = new Set(rows.map(leadKey).filter(Boolean));
  if (!wanted.size) return "";
  const catalog = selectionConstraints(rows);
  for (let size = 0; size <= catalog.length; size += 1) {
    for (const picked of combinations(catalog, size)) {
      const matched = universe.filter((row) => picked.every((item) => item.match(row)));
      if (!sameLeadSet(matched, wanted)) continue;
      const params = new URLSearchParams();
      appendDateRange(params, from, to);
      for (const item of picked) item.apply(params);
      if (![...params.keys()].length) return "/crm/lead/list/";
      params.set("apply_filter", "Y");
      return `/crm/lead/list/?${params.toString()}`;
    }
  }
  return "";
}

/** CRM list for the leads open in the office popup. The filter is used only when it selects these leads and no others. */
export function officeLeadSelectionPath({ from = "", to = "", leads = [], universe = null, truncated = false, blank = false } = {}) {
  const rows = (Array.isArray(leads) ? leads : []).filter((row) => leadKey(row));
  if (!rows.length) return "";
  const wanted = new Set(rows.map(leadKey));
  const all = Array.isArray(universe) ? universe : null;
  const blankRows = Boolean(blank) && rows.every((row) => row?.blank);
  if (all && !truncated) {
    if (blankRows && rows.length > MAX_EXACT_LEAD_IDS && sameLeadSet(all.filter((row) => row?.blank), wanted)) {
      return officeLeadBlankPath({ from, to });
    }
    const fields = exactOfficeFieldPath(rows, all, { from, to });
    if (fields) return fields;
  }
  const ids = [...new Set(rows.map((row) => leadKey(row).replace(/\D/g, "")).filter(Boolean))];
  if (ids.length && ids.length <= MAX_EXACT_LEAD_IDS) return crmListPath("lead", { leadIds: ids });
  if (blankRows) return officeLeadBlankPath({ from, to });
  return "";
}

/** One row's CRM list: that Bitrix field equals this value, inside the same date range. */
export function officeLeadRowPath({ from = "", to = "", by = "", value = "", label = "" } = {}) {
  const id = String(value || "").trim();
  if (!id || id === "empty" || by === "total") return "";
  if (by === "agent") return crmListPath("lead", { from, to, agentId: id });
  if (by === "purpose") {
    const clientType = PURPOSE_CLIENT_TYPE[id];
    if (!clientType) return "";
    return crmListPath("lead", { from, to, field: OFFICE_ROW_FIELD.purpose, fieldValues: [clientType], fieldLabel: label });
  }
  if (by === "community") {
    const name = String(label || "").trim();
    if (!name || /^empty\b/i.test(name)) return "";
    return crmListPath("lead", { from, to, field: COMMUNITY_TEXT_FIELD, fieldValues: [name] });
  }
  const field = OFFICE_ROW_FIELD[by];
  if (!field) return "";
  return crmListPath("lead", { from, to, field, fieldValues: [id], fieldLabel: label });
}

function officeRowSpec(rows) {
  const spec = {
    agentId: oneFilled(rows, "agentId"),
    agentName: oneFilled(rows, "agentName"),
    statuses: [],
    statusName: oneFilled(rows, "statusName"),
    clientIds: [],
    clientEmpty: false,
    clientName: oneFilled(rows, "clientType"),
    communityId: oneFilled(rows, "communityId"),
    communityText: "",
    communityIdEmpty: false,
    communityTextEmpty: false,
    clusterId: oneFilled(rows, "clusterId"),
    clusterName: oneFilled(rows, "cluster"),
    clusterEmpty: false,
    bedsId: oneFilled(rows, "bedsId"),
    bedsName: oneFilled(rows, "bedLabel"),
    bedsEmpty: false,
    typeIds: [],
    typeName: oneFilled(rows, "type"),
    typeEmpty: false,
  };
  const statusIds = uniqueText(rows.map((row) => row?.statusId));
  if (statusIds.length === 1 || (statusIds.length > 1 && statusIds.length <= 4 && rows.every((row) => statusIds.includes(String(row?.statusId || "").trim())))) {
    spec.statuses = statusIds;
  }
  const clientIds = uniqueText(rows.map((row) => row?.clientTypeId));
  if (clientIds.length >= 1 && clientIds.length <= 6 && rows.every((row) => clientIds.includes(String(row?.clientTypeId || "").trim()))) {
    spec.clientIds = clientIds;
  }
  const communityText = oneFilled(rows, "communityText");
  if (communityText && !/^empty\b/i.test(communityText)) spec.communityText = communityText;
  const communityId = oneFilled(rows, "communityId");
  if (communityId) spec.communityId = communityId;
  const communityName = oneFilled(rows, "communityTitle") || oneFilled(rows, "community");
  if (communityName && !/^empty\b/i.test(communityName) && communityName !== "—") spec.communityName = communityName;
  if (rows.every((row) => row?.unitKind === "shop")) spec.bedsId = "";
  const clusterId = oneFilled(rows, "clusterId");
  if (clusterId) spec.clusterId = clusterId;
  const typeIds = uniqueText(rows.map((row) => row?.typeId));
  if (typeIds.length >= 1 && typeIds.length <= 12 && rows.every((row) => typeIds.includes(String(row?.typeId || "").trim()))) spec.typeIds = typeIds;
  return spec;
}

function matchesOfficeSpec(row, spec) {
  if (spec.agentId && String(row?.agentId || "").trim() !== spec.agentId) return false;
  if (spec.statuses.length && !spec.statuses.includes(String(row?.statusId || "").trim())) return false;
  if (spec.clientEmpty && String(row?.clientTypeId || "").trim()) return false;
  if (spec.clientIds.length && !spec.clientIds.includes(String(row?.clientTypeId || "").trim())) return false;
  if (spec.communityId && String(row?.communityId || "").trim() !== spec.communityId) return false;
  if (spec.communityIdEmpty && String(row?.communityId || "").trim()) return false;
  if (spec.communityText && String(row?.communityText || "").trim() !== spec.communityText) return false;
  if (spec.communityTextEmpty && String(row?.communityText || "").trim()) return false;
  if (spec.clusterId && String(row?.clusterId || "").trim() !== spec.clusterId) return false;
  if (spec.clusterEmpty && String(row?.clusterId || "").trim()) return false;
  if (spec.bedsId && String(row?.bedsId || "").trim() !== spec.bedsId) return false;
  if (spec.bedsEmpty && String(row?.bedsId || "").trim()) return false;
  if (spec.typeIds.length && !spec.typeIds.includes(String(row?.typeId || "").trim())) return false;
  if (spec.typeEmpty && String(row?.typeId || "").trim()) return false;
  return true;
}

function specIsExact(rows, universe, spec) {
  if (!Array.isArray(universe)) return true;
  const wanted = new Set(rows.map((row) => leadKey(row)));
  const matched = universe.filter((row) => leadKey(row) && matchesOfficeSpec(row, spec));
  return matched.length === wanted.size && matched.every((row) => wanted.has(leadKey(row)));
}

function specHasFilter(spec) {
  return Boolean(
    spec.agentId
    || spec.statuses.length
    || spec.clientIds.length
    || spec.clientEmpty
    || spec.communityId
    || spec.communityText
    || spec.communityIdEmpty
    || spec.communityTextEmpty
    || spec.clusterId
    || spec.clusterEmpty
    || spec.bedsId
    || spec.bedsEmpty
    || spec.typeIds.length
    || spec.typeEmpty
  );
}

function relaxOfficeSpec(spec) {
  const next = { ...spec, statuses: [...spec.statuses], clientIds: [...spec.clientIds], typeIds: [...spec.typeIds] };
  next.clusterEmpty = false;
  next.bedsEmpty = false;
  next.typeEmpty = false;
  next.clientEmpty = false;
  next.communityIdEmpty = false;
  next.communityTextEmpty = false;
  return next;
}

function blankOfficeSpec() {
  return {
    agentId: "",
    agentName: "",
    statuses: [],
    statusName: "",
    clientIds: [],
    clientEmpty: false,
    clientName: "",
    communityId: "",
    communityText: "",
    communityName: "",
    communityIdEmpty: false,
    communityTextEmpty: false,
    clusterId: "",
    clusterName: "",
    clusterEmpty: false,
    bedsId: "",
    bedsName: "",
    bedsEmpty: false,
    typeIds: [],
    typeName: "",
    typeEmpty: false,
  };
}

function withOfficeBits(full, keys) {
  const next = blankOfficeSpec();
  for (const key of keys) {
    next[key] = Array.isArray(full[key]) ? [...full[key]] : full[key];
  }
  next.agentName = full.agentName;
  next.communityName = full.communityName;
  next.statusName = full.statusName;
  next.clientName = full.clientName;
  next.clusterName = full.clusterName;
  next.bedsName = full.bedsName;
  next.typeName = full.typeName;
  return next;
}

function pathFromOfficeSpec(spec, from, to) {
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  appendDateRange(params, from, to);
  function labeled(field, value, label) {
    const id = String(value || "").trim();
    if (!id) return;
    params.set(field, id);
    const name = String(label || "").trim();
    if (name && !/^empty\b/i.test(name)) params.set(`${field}_label`, name);
  }
  if (spec.agentId) labeled("ASSIGNED_BY_ID", spec.agentId, spec.agentName);
  if (spec.statuses.length === 1) labeled("STATUS_ID", spec.statuses[0], spec.statusName);
  else for (const id of spec.statuses) params.append("STATUS_ID[]", id);
  if (spec.clientEmpty) params.set(`${LEAD_CLIENT_TYPE_FIELD}_isEmpty`, "Y");
  else if (spec.clientIds.length === 1) labeled(LEAD_CLIENT_TYPE_FIELD, spec.clientIds[0], spec.clientName);
  else for (const id of spec.clientIds) params.append(`${LEAD_CLIENT_TYPE_FIELD}[]`, id);
  if (spec.communityId) labeled("UF_CRM_1763390140", spec.communityId, spec.communityName || spec.communityText);
  else if (spec.communityIdEmpty) params.set("UF_CRM_1763390140_isEmpty", "Y");
  if (spec.communityText) labeled(COMMUNITY_TEXT_FIELD, spec.communityText, spec.communityText);
  else if (spec.communityTextEmpty) params.set(`${COMMUNITY_TEXT_FIELD}_isEmpty`, "Y");
  if (spec.clusterId) labeled("UF_CRM_1763390179", spec.clusterId, spec.clusterName);
  else if (spec.clusterEmpty) params.set("UF_CRM_1763390179_isEmpty", "Y");
  if (spec.bedsId) labeled("UF_CRM_1731838126127", spec.bedsId, spec.bedsName);
  else if (spec.bedsEmpty) params.set("UF_CRM_1731838126127_isEmpty", "Y");
  if (spec.typeIds.length === 1) labeled("UF_CRM_1760707292", spec.typeIds[0], spec.typeName);
  else for (const id of spec.typeIds) params.append("UF_CRM_1760707292[]", id);
  if (spec.typeEmpty) params.set("UF_CRM_1760707292_isEmpty", "Y");
  return `/crm/lead/list/?${params.toString()}`;
}

function chooseOfficeSpec(rows, universe) {
  const full = officeRowSpec(rows);
  const relaxed = relaxOfficeSpec(full);
  const candidates = [
    full,
    relaxed,
    withOfficeBits(relaxed, ["bedsId", "typeIds", "clientIds", "statuses"]),
    withOfficeBits(relaxed, ["bedsId", "clientIds"]),
    withOfficeBits(relaxed, ["bedsId", "typeIds"]),
    withOfficeBits(relaxed, ["communityId", "communityText", "bedsId"]),
    withOfficeBits(relaxed, ["communityId", "communityText"]),
    withOfficeBits(relaxed, ["communityText"]),
    withOfficeBits(relaxed, ["communityId"]),
    withOfficeBits(relaxed, ["clusterId", "bedsId"]),
    withOfficeBits(relaxed, ["clusterId"]),
    withOfficeBits(relaxed, ["bedsId"]),
    withOfficeBits(relaxed, ["typeIds"]),
    withOfficeBits(relaxed, ["agentId", "clientIds"]),
    withOfficeBits(relaxed, ["agentId"]),
    withOfficeBits(relaxed, ["clientIds"]),
    withOfficeBits(relaxed, ["statuses", "bedsId", "clientIds"]),
    withOfficeBits(relaxed, ["statuses"]),
  ];
  if (rows.every((row) => !String(row?.clientTypeId || "").trim())) candidates.push(withOfficeBits({ ...relaxed, clientEmpty: true }, ["clientEmpty"]));
  if (rows.every((row) => !String(row?.communityText || "").trim() && !String(row?.communityId || "").trim())) {
    candidates.push(withOfficeBits({ ...relaxed, communityTextEmpty: true, communityIdEmpty: true }, ["communityTextEmpty", "communityIdEmpty"]));
  }
  if (rows.every((row) => !String(row?.clusterId || "").trim())) candidates.push(withOfficeBits({ ...relaxed, clusterEmpty: true }, ["clusterEmpty"]));
  if (rows.every((row) => row?.unitKind !== "shop" && !String(row?.bedsId || "").trim())) candidates.push(withOfficeBits({ ...relaxed, bedsEmpty: true }, ["bedsEmpty"]));
  if (rows.every((row) => row?.unitKind !== "shop" && !String(row?.typeId || "").trim())) candidates.push(withOfficeBits({ ...relaxed, typeEmpty: true }, ["typeEmpty"]));
  if (!Array.isArray(universe)) return candidates.find((spec) => specHasFilter(spec)) || full;
  return candidates.find((spec) => specHasFilter(spec) && specIsExact(rows, universe, spec)) || null;
}

function officeLeadIdPath(rows, from, to) {
  if (!rows.length || rows.length > 1200) return "";
  const params = new URLSearchParams();
  params.set("apply_filter", "Y");
  appendDateRange(params, from, to);
  if (rows.length === 1) {
    params.set("ID_numsel", "exact");
    params.set("ID_from", leadKey(rows[0]));
    params.set("ID_to", leadKey(rows[0]));
  } else {
    for (const row of rows) params.append("ID[]", leadKey(row));
  }
  return `/crm/lead/list/?${params.toString()}`;
}

/**
 * CRM list for one Office leads box or row.
 * Community, cluster, bedrooms, type, agent and client type are selected in the Bitrix filter.
 * When the loaded leads are passed as universe, the link is kept only if that filter selects this row and no other loaded lead.
 * A row that is not one Bitrix field still opens when its lead ids fit, so the CRM count stays that row.
 */
export function officeLeadRowsPath({ from = "", to = "", leads = [], universe = null, blank = false } = {}) {
  const rows = (Array.isArray(leads) ? leads : []).filter((row) => leadKey(row));
  if (!rows.length) return "";
  if (blank && rows.every((row) => row?.blank)) return officeLeadBlankPath({ from, to });
  const spec = chooseOfficeSpec(rows, universe);
  if (spec) return pathFromOfficeSpec(spec, from, to);
  if (Array.isArray(universe)) return officeLeadIdPath(rows, from, to);
  return "";
}
