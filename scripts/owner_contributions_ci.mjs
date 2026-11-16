#!/usr/bin/env node
/**
 * The DynamoDB side of the "Merge owner contributions" workflow (.github/workflows/merge-owner-contributions.yml),
 * through the AWS CLI the runner already has (no SDK in the repo). The workflow's OIDC role reads and writes only the
 * owner partition of the table (apps/web/src/lib/server/contributions.ts):
 *
 *   node scripts/owner_contributions_ci.mjs pull --table T --out contributions.json
 *       the pending contributions, as `pnpm data:apply-contributions` reads them; prints the count
 *   node scripts/owner_contributions_ci.mjs mark --table T --summary summary.json --commit SHA
 *       after the push: applied (and already merged) ones become `merged`, refused ones `rejected` with the reason;
 *       all of them leave the pending set. Contributions that arrived during the run stay pending.
 *
 * Nothing secret is read or printed: contributions never carry one (packages/core/src/owner.ts refuses them).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PREFIX = "owner#contrib#";
const INDEX = `${PREFIX}index`;
const MERGED_TTL_DAYS = 30;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (name) => {
  const v = opt(name);
  if (!v) {
    console.error(`--${name} is required`);
    process.exit(2);
  }
  return v;
};
const aws = (...a) => {
  const out = execFileSync("aws", ["dynamodb", ...a, "--output", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? JSON.parse(out) : {};
};
const key = (pk) => JSON.stringify({ pk: { S: pk } });
const ID = /^[A-Za-z0-9][\w.:-]{0,79}$/;

function pendingIds(table) {
  const r = aws("get-item", "--table-name", table, "--key", key(INDEX), "--consistent-read");
  const ids = r.Item?.pending?.SS ?? [];
  return ids.filter((id) => ID.test(id)).sort();
}

function pull() {
  const table = need("table");
  const out = need("out");
  const ids = pendingIds(table);
  const contributions = [];
  for (let i = 0; i < ids.length; i += 100) {
    let request = {
      [table]: {
        Keys: ids.slice(i, i + 100).map((id) => ({ pk: { S: PREFIX + id } })),
        ConsistentRead: true,
      },
    };
    for (let attempt = 0; attempt < 6 && request; attempt++) {
      const r = aws("batch-get-item", "--request-items", JSON.stringify(request));
      for (const it of r.Responses?.[table] ?? []) {
        if (it.status?.S !== "pending") continue;
        let items;
        try {
          items = JSON.parse(it.body?.S ?? "[]");
        } catch {
          items = null;
        }
        contributions.push({
          id: it.pk.S.slice(PREFIX.length),
          at: it.at?.S ?? "",
          source: it.source?.S ?? "web",
          items: Array.isArray(items) ? items : [],
        });
      }
      const left = r.UnprocessedKeys?.[table];
      request = left?.Keys?.length ? { [table]: left } : null;
    }
  }
  contributions.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  writeFileSync(out, `${JSON.stringify(contributions)}\n`);
  const items = contributions.reduce((n, c) => n + c.items.length, 0);
  console.log(JSON.stringify({ pending: ids.length, contributions: contributions.length, items }));
}

function mark() {
  const table = need("table");
  const summary = JSON.parse(readFileSync(need("summary"), "utf8"));
  const commit = need("commit");
  const now = new Date().toISOString();
  const ttl = String(Math.floor(Date.now() / 1000) + MERGED_TTL_DAYS * 86_400);
  const done = [];
  const set = (id, status, reason) => {
    const values = { ":s": { S: status }, ":t": { S: now }, ":c": { S: commit }, ":ttl": { N: ttl } };
    if (reason) values[":r"] = { S: String(reason).slice(0, 300) };
    aws(
      "update-item",
      "--table-name",
      table,
      "--key",
      key(PREFIX + id),
      "--update-expression",
      `SET #s = :s, mergedAt = :t, mergedCommit = :c, #ttl = :ttl${reason ? ", reason = :r" : ""}`,
      "--condition-expression",
      "attribute_exists(pk)",
      "--expression-attribute-names",
      JSON.stringify({ "#s": "status", "#ttl": "ttl" }),
      "--expression-attribute-values",
      JSON.stringify(values),
    );
    done.push(id);
  };
  for (const id of summary.applied ?? []) if (ID.test(id)) set(id, "merged");
  for (const s of summary.skipped ?? []) {
    if (!ID.test(s.id ?? "")) continue;
    if (s.why === "already merged") set(s.id, "merged");
    else set(s.id, "rejected", s.why);
  }
  for (let i = 0; i < done.length; i += 50)
    aws(
      "update-item",
      "--table-name",
      table,
      "--key",
      key(INDEX),
      "--update-expression",
      "DELETE #p :ids SET updatedAt = :t",
      "--expression-attribute-names",
      JSON.stringify({ "#p": "pending" }),
      "--expression-attribute-values",
      JSON.stringify({ ":ids": { SS: done.slice(i, i + 50) }, ":t": { S: now } }),
    );
  console.log(JSON.stringify({ marked: done.length }));
}

/** the run summary's lines (markdown) from the importer's summary file */
function report() {
  const s = JSON.parse(readFileSync(need("summary"), "utf8"));
  console.log(`Merged: ${s.applied?.length ?? 0}. Refused or skipped: ${s.skipped?.length ?? 0}.`);
  for (const k of s.skipped ?? []) console.log(`- \`${k.id}\`: ${k.why}`);
  if (s.unknown?.length) console.log(`Entries naming sides the index does not hold: ${s.unknown.length}`);
}

if (cmd === "pull") pull();
else if (cmd === "mark") mark();
else if (cmd === "report") report();
else {
  console.error(
    "usage: owner_contributions_ci.mjs pull --table T --out F | mark --table T --summary F --commit SHA | report --summary F",
  );
  process.exit(2);
}
