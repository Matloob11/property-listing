export const INFO_SLICE_LABELS = {
  sale: "Sales",
  rent: "Rent",
  pf: "Property Finder",
  bayut: "Bayut",
  dubizzle: "Dubizzle",
  houza: "JE",
  website: "Website",
};

export function infoSliceFilters(base, category, key) {
  const purpose = key === "sale" || key === "rent" ? key : "";
  const portal = purpose ? "" : key;
  const liveStock = key === "sale" || key === "rent" || key === "houza" || key === "website";
  return {
    ...base,
    ticket: liveStock ? "live" : "all",
    q: "",
    listing_id: "",
    category,
    purpose,
    portal,
    portal_agent: "",
    portal_side: "",
    portal_credit: "",
    portal_type: "",
    portal_beds: "",
    portal_community: "",
    portal_cluster: "",
    portal_live: "",
    page: 1,
  };
}

export function infoSliceTitle(category, key) {
  const side = category === "commercial" ? "Commercial" : "Residential";
  return `${side} · ${INFO_SLICE_LABELS[key] || key}`;
}
