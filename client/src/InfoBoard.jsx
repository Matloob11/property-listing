const INFO_LEGEND = [
  { key: "sale", label: "Sales", color: "#f64e60" },
  { key: "rent", label: "Rent", color: "#3699ff" },
  { key: "pf", label: "Property Finder", color: "#e85d04" },
  { key: "bayut", label: "Bayut", color: "#8950fc" },
  { key: "dubizzle", label: "Dubizzle", color: "#e31c3d" },
  { key: "houza", label: "JE", color: "#ffa800" },
  { key: "website", label: "Website", color: "#1bc5bd" },
];

function infoValue(bucket, key) {
  if (key === "sale" || key === "rent") return Number(bucket?.[key] || 0);
  return Number(bucket?.portals?.[key] || 0);
}

function Donut({ segments, onSelect }) {
  const size = 132;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circ = 2 * Math.PI * radius;
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <svg className="donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Sale and rent mix">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
      {total > 0 &&
        segments.map((item) => {
          if (!item.value) return null;
          const len = (item.value / total) * circ;
          const dash = -offset;
          offset += len;
          return (
            <circle
              key={item.key}
              className="donut-slice"
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={dash}
              transform={`rotate(-90 ${center} ${center})`}
              role="button"
              tabIndex={0}
              aria-label={`${item.label || item.key}, ${item.value}`}
              onClick={() => onSelect?.(item.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(item.key);
                }
              }}
            />
          );
        })}
    </svg>
  );
}

function InfoColumn({ title, bucket, onOpen }) {
  const rows = INFO_LEGEND.map((item) => ({
    ...item,
    value: infoValue(bucket, item.key),
  }));
  return (
    <article className="info-col">
      <h3>{title}</h3>
      <div className="info-split">
        <Donut
          segments={rows
            .filter((item) => item.key === "sale" || item.key === "rent")
            .map((item) => ({
              key: item.key,
              label: item.label,
              color: item.color,
              value: item.value,
            }))}
          onSelect={onOpen}
        />
        <ul className="info-legend">
          {rows.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="info-legend-btn"
                disabled={!item.value}
                onClick={() => onOpen?.(item.key)}
              >
                <span className="legend-left">
                  <i style={{ background: item.color }} />
                  {item.label}
                </span>
                <b>{item.value}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** Commercial / Residential portal mix — click Sales, Rent, or a portal to open that listing list. */
export function InfoBoard({ info, onOpenSlice }) {
  if (!info) {
    return <p className="muted">Loading commercial / residential mix…</p>;
  }
  return (
    <div className="info-board">
      <InfoColumn
        title="Commercial"
        bucket={info.byCategory?.commercial}
        onOpen={(key) => onOpenSlice?.("commercial", key)}
      />
      <InfoColumn
        title="Residential"
        bucket={info.byCategory?.residential}
        onOpen={(key) => onOpenSlice?.("residential", key)}
      />
    </div>
  );
}
