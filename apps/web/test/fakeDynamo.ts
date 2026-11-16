/**
 * An in-memory DynamoDB DocumentClient for the room store's tests: Get / Put / Update commands with the expression
 * subset the store uses — conditions joined by AND (`attribute_exists`, `attribute_not_exists`, `contains`,
 * `NOT contains`, `a = :v`), `SET a = :v, b = if_not_exists(b, :v)` and `ADD a :set` (string-set union, number add),
 * `ReturnValues: "UPDATED_NEW"`, and `ConditionalCheckFailedException` on a failed condition. Each command runs
 * atomically after a short random delay, so commands sent together interleave the way concurrent requests do.
 */
type Item = Record<string, unknown>;
type Input = {
  TableName?: string;
  Key?: { pk: string };
  Item?: Item;
  UpdateExpression?: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
  ReturnValues?: string;
};
abstract class Cmd {
  constructor(readonly input: Input) {}
}
export class Get extends Cmd {}
export class Put extends Cmd {}
export class Update extends Cmd {}

const fail = () =>
  Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });

/** split at top-level commas (not inside parentheses) */
function commas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function fakeDynamo(o: { maxDelayMs?: number } = {}) {
  const table = new Map<string, Item>();
  const log: Array<{ kind: string; input: Input }> = [];
  /** runs before a command executes (after its delay): tests use it to land another request in between */
  let before: ((cmd: Cmd) => Promise<void> | void) | null = null;
  const delay = () => new Promise((r) => setTimeout(r, Math.random() * (o.maxDelayMs ?? 4)));

  const nameOf = (tok: string, input: Input) => {
    const t = tok.trim();
    if (t.startsWith("#")) {
      const n = input.ExpressionAttributeNames?.[t];
      if (!n) throw new Error(`unknown attribute name ${t}`);
      return n;
    }
    return t;
  };
  const valueFor = (tok: string, input: Input) => {
    const t = tok.trim();
    if (!(t in (input.ExpressionAttributeValues ?? {}))) throw new Error(`unknown value ${t}`);
    return input.ExpressionAttributeValues![t];
  };
  const has = (v: unknown, x: unknown) =>
    v instanceof Set
      ? v.has(x)
      : Array.isArray(v)
        ? v.includes(x)
        : typeof v === "string"
          ? v.includes(String(x))
          : false;
  function holds(item: Item | undefined, cond: string | undefined, input: Input): boolean {
    if (!cond) return true;
    return cond.split(/\s+AND\s+/).every((term) => {
      let m = term.match(/^attribute_exists\((.+)\)$/);
      if (m) return !!item && nameOf(m[1]!, input) in item;
      m = term.match(/^attribute_not_exists\((.+)\)$/);
      if (m) return !item || !(nameOf(m[1]!, input) in item);
      m = term.match(/^(NOT\s+)?contains\(([^,]+),\s*(:\w+)\)$/);
      if (m) {
        const v = item?.[nameOf(m[2]!, input)];
        const yes = has(v, valueFor(m[3]!, input));
        return m[1] ? !yes : yes;
      }
      m = term.match(/^(\S+)\s*=\s*(:\w+)$/);
      if (m) return !!item && item[nameOf(m[1]!, input)] === valueFor(m[2]!, input);
      throw new Error(`fakeDynamo: unsupported condition ${term}`);
    });
  }
  function update(item: Item, expr: string, input: Input): string[] {
    const touched: string[] = [];
    for (const part of expr.split(/\s+(?=SET\s|ADD\s|REMOVE\s)/)) {
      const [, verb, body] = part.match(/^(SET|ADD|REMOVE)\s+(.*)$/s) ?? [];
      if (!verb || !body) throw new Error(`fakeDynamo: unsupported update ${part}`);
      for (const clause of commas(body)) {
        if (verb === "SET") {
          const [, lhs, rhs] = clause.match(/^(\S+)\s*=\s*(.+)$/) ?? [];
          const name = nameOf(lhs!, input);
          const ine = rhs!.match(/^if_not_exists\(([^,]+),\s*(:\w+)\)$/);
          item[name] = ine
            ? nameOf(ine[1]!, input) in item
              ? item[nameOf(ine[1]!, input)]
              : structuredClone(valueFor(ine[2]!, input))
            : structuredClone(valueFor(rhs!, input));
          touched.push(name);
        } else if (verb === "ADD") {
          const [, lhs, rhs] = clause.match(/^(\S+)\s+(:\w+)$/) ?? [];
          const name = nameOf(lhs!, input);
          const v = valueFor(rhs!, input);
          const cur = item[name];
          if (v instanceof Set) {
            if (cur !== undefined && !(cur instanceof Set)) throw new Error("ADD a set to a non-set");
            item[name] = new Set([...((cur as Set<unknown>) ?? []), ...v]);
          } else if (typeof v === "number") item[name] = (typeof cur === "number" ? cur : 0) + v;
          else throw new Error("ADD needs a set or a number");
          touched.push(name);
        } else {
          delete item[nameOf(clause, input)];
          touched.push(nameOf(clause, input));
        }
      }
    }
    return touched;
  }

  async function send(cmd: unknown): Promise<{ Item?: Item; Attributes?: Item }> {
    if (!(cmd instanceof Cmd)) throw new Error("fakeDynamo: not a command");
    await delay();
    if (before) await before(cmd);
    const input = cmd.input;
    log.push({ kind: cmd.constructor.name, input });
    if (cmd instanceof Get) {
      const it = table.get(input.Key!.pk);
      return it ? { Item: structuredClone(it) } : {};
    }
    if (cmd instanceof Put) {
      const pk = input.Item!.pk as string;
      if (!holds(table.get(pk), input.ConditionExpression, input)) throw fail();
      table.set(pk, structuredClone(input.Item!));
      return {};
    }
    const pk = input.Key!.pk;
    const cur = table.get(pk);
    if (!holds(cur, input.ConditionExpression, input)) throw fail();
    const next: Item = cur ? structuredClone(cur) : { pk };
    const touched = update(next, input.UpdateExpression ?? "", input);
    table.set(pk, next);
    return input.ReturnValues === "UPDATED_NEW"
      ? { Attributes: structuredClone(Object.fromEntries(touched.map((k) => [k, next[k]]))) }
      : {};
  }
  return {
    table,
    log,
    setBefore(f: typeof before) {
      before = f;
    },
    doc: { send, Get, Put, Update },
  };
}
