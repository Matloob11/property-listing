function stageName(row) {
  return String(row?.statusName || row?.statusId || "No stage").trim() || "No stage";
}

export function statusIsNotInterested(name) {
  return /^not interested$/i.test(String(name || "").trim());
}

export function statusIsJunk(name) {
  return /junk/i.test(String(name || ""));
}

export function statusIsBroker(name) {
  return /broker/i.test(String(name || ""));
}

export function statusIsOptionSent(name) {
  return /^option sent$/i.test(String(name || "").trim());
}

/** Stage and client-type counts for one Office leads click. Names come from Bitrix. */
export function officeLeadFacts(leads, statuses = []) {
  const order = new Map((statuses || []).map((row, index) => [String(row.id || ""), index]));
  const names = new Map((statuses || []).map((row) => [String(row.id || ""), String(row.name || row.id || "")]));
  const stages = new Map();
  const clients = new Map();
  for (const lead of leads || []) {
    const id = String(lead?.statusId || "");
    const name = names.get(id) || stageName(lead);
    const prev = stages.get(id || name) || { id, name, count: 0 };
    prev.count += 1;
    prev.name = name;
    stages.set(id || name, prev);
    const client = String(lead?.clientType || "").trim() || "No client type";
    clients.set(client, (clients.get(client) || 0) + 1);
  }
  const stageRows = [...stages.values()].sort((a, b) => {
    const ai = order.has(a.id) ? order.get(a.id) : 1000;
    const bi = order.has(b.id) ? order.get(b.id) : 1000;
    return ai - bi || b.count - a.count || a.name.localeCompare(b.name);
  });
  const sum = (test) => stageRows.filter((row) => test(row.name)).reduce((total, row) => total + row.count, 0);
  return {
    total: (leads || []).length,
    optionSent: sum(statusIsOptionSent),
    notInterested: sum(statusIsNotInterested),
    junk: sum(statusIsJunk),
    broker: sum(statusIsBroker),
    stages: stageRows,
    notInterestedStages: stageRows.filter((row) => statusIsNotInterested(row.name)),
    clients: [...clients.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}
