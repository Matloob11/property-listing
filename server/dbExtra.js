// Extra tables shared by the three stores: settings (key/value), pf_locations, pf_users, leads.
export const LEAD_COLUMNS = [
  "id",
  "channel",
  "status",
  "created_at",
  "entity_type",
  "pf_listing_id",
  "reference",
  "listing_id",
  "sender_name",
  "sender_phone",
  "sender_email",
  "agent_pf_profile",
  "agent_name",
  "response_link",
  "call_talk_time",
  "call_wait_time",
  "call_record",
  "tags",
  "raw",
  "synced_at",
  "bitrix_id",
];
export const LEAD_JSON = new Set(["tags", "raw"]);

export const LOCATION_COLUMNS = ["id", "name", "type", "tree", "lat", "lng", "synced_at"];
export const LOCATION_JSON = new Set(["tree"]);

export const PF_USER_COLUMNS = [
  "pf_id",
  "profile_id",
  "name",
  "email",
  "phone",
  "whatsapp",
  "position",
  "role",
  "status",
  "photo",
  "verified",
  "super_agent",
  "created_at",
  "synced_at",
];

export function normalizeLead(input) {
  const out = {};
  for (const column of LEAD_COLUMNS) {
    const value = input[column];
    if (LEAD_JSON.has(column)) {
      if (typeof value === "string") {
        try {
          out[column] = JSON.parse(value || (column === "tags" ? "[]" : "{}"));
        } catch {
          out[column] = column === "tags" ? [] : {};
        }
      } else out[column] = value ?? (column === "tags" ? [] : {});
    } else if (column === "call_talk_time" || column === "call_wait_time") out[column] = Number(value || 0);
    else out[column] = String(value ?? "");
  }
  return out;
}

export function normalizeLocation(input) {
  let tree = input.tree;
  if (typeof tree === "string") {
    try {
      tree = JSON.parse(tree || "[]");
    } catch {
      tree = [];
    }
  }
  return {
    id: String(input.id || ""),
    name: String(input.name || ""),
    type: String(input.type || ""),
    tree: Array.isArray(tree) ? tree : [],
    lat: String(input.lat ?? input.coordinates?.lat ?? ""),
    lng: String(input.lng ?? input.coordinates?.lng ?? ""),
    synced_at: String(input.synced_at || new Date().toISOString()),
  };
}

export function normalizePfUser(input) {
  const out = {};
  for (const column of PF_USER_COLUMNS) out[column] = String(input[column] ?? "");
  if (!out.synced_at) out.synced_at = new Date().toISOString();
  return out;
}

export function sqlCreate(dialect) {
  const T = dialect === "mysql" ? "MEDIUMTEXT" : "TEXT";
  const V = (n) => (dialect === "mysql" ? `VARCHAR(${n})` : "TEXT");
  return [
    `CREATE TABLE IF NOT EXISTS settings (k ${V(64)} PRIMARY KEY, v ${T})`,
    `CREATE TABLE IF NOT EXISTS pf_locations (id ${V(32)} PRIMARY KEY, name ${V(255)} NOT NULL DEFAULT '', type ${V(32)} NOT NULL DEFAULT '', tree ${T}, lat ${V(32)} NOT NULL DEFAULT '', lng ${V(32)} NOT NULL DEFAULT '', synced_at ${V(40)} NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS pf_users (pf_id ${V(32)} PRIMARY KEY, profile_id ${V(32)} NOT NULL DEFAULT '', name ${V(255)} NOT NULL DEFAULT '', email ${V(255)} NOT NULL DEFAULT '', phone ${V(64)} NOT NULL DEFAULT '', whatsapp ${V(64)} NOT NULL DEFAULT '', position ${V(255)} NOT NULL DEFAULT '', role ${V(128)} NOT NULL DEFAULT '', status ${V(32)} NOT NULL DEFAULT '', photo ${T}, verified ${V(32)} NOT NULL DEFAULT '', super_agent ${V(4)} NOT NULL DEFAULT '', created_at ${V(40)} NOT NULL DEFAULT '', synced_at ${V(40)} NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS leads (id ${V(64)} PRIMARY KEY, channel ${V(32)} NOT NULL DEFAULT '', status ${V(32)} NOT NULL DEFAULT '', created_at ${V(40)} NOT NULL DEFAULT '', entity_type ${V(32)} NOT NULL DEFAULT '', pf_listing_id ${V(64)} NOT NULL DEFAULT '', reference ${V(64)} NOT NULL DEFAULT '', listing_id ${V(32)} NOT NULL DEFAULT '', sender_name ${V(255)} NOT NULL DEFAULT '', sender_phone ${V(64)} NOT NULL DEFAULT '', sender_email ${V(255)} NOT NULL DEFAULT '', agent_pf_profile ${V(32)} NOT NULL DEFAULT '', agent_name ${V(255)} NOT NULL DEFAULT '', response_link ${T}, call_talk_time INTEGER NOT NULL DEFAULT 0, call_wait_time INTEGER NOT NULL DEFAULT 0, call_record ${T}, tags ${T}, raw ${T}, synced_at ${V(40)} NOT NULL DEFAULT '', bitrix_id ${V(32)} NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS tenancy_photos (id ${V(40)} PRIMARY KEY, tenancy_id ${V(40)} NOT NULL DEFAULT '', file_name ${V(255)} NOT NULL DEFAULT '', file_path ${V(512)} NOT NULL DEFAULT '', mime ${V(64)} NOT NULL DEFAULT '', original_name ${V(255)} NOT NULL DEFAULT '', agent_id ${V(64)} NOT NULL DEFAULT '', agent_name ${V(255)} NOT NULL DEFAULT '', fields ${T}, created_at BIGINT NOT NULL DEFAULT 0)`,
  ];
}

export function sqlAlterLeads(dialect) {
  const type = dialect === "mysql" ? "VARCHAR(32)" : "TEXT";
  return [`ALTER TABLE leads ADD COLUMN bitrix_id ${type} NOT NULL DEFAULT ''`];
}

export const TENANCY_PHOTO_COLUMNS = [
  "id",
  "tenancy_id",
  "file_name",
  "file_path",
  "mime",
  "original_name",
  "agent_id",
  "agent_name",
  "fields",
  "created_at",
];

export function normalizeTenancyPhoto(input) {
  let fields = input?.fields;
  if (typeof fields === "string") {
    try {
      fields = JSON.parse(fields || "{}");
    } catch {
      fields = {};
    }
  }
  return {
    id: String(input?.id || ""),
    tenancy_id: String(input?.tenancy_id || ""),
    file_name: String(input?.file_name || ""),
    file_path: String(input?.file_path || ""),
    mime: String(input?.mime || "image/jpeg"),
    original_name: String(input?.original_name || ""),
    agent_id: String(input?.agent_id || ""),
    agent_name: String(input?.agent_name || ""),
    fields: fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {},
    created_at: Number(input?.created_at || 0),
  };
}

export function tenancyPhotoToParams(row) {
  const photo = normalizeTenancyPhoto(row);
  return TENANCY_PHOTO_COLUMNS.map((column) => (column === "fields" ? JSON.stringify(photo.fields) : photo[column]));
}
