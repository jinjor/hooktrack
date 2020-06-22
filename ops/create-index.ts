import * as faunadb from "faunadb";

const secret = process.env.FAUNADB_SERVER_SECRET || "";
console.log("FAUNADB_SERVER_SECRET:", secret.replace(/\w/g, "*"));
if (!secret) {
  console.log("FAUNADB_SERVER_SECRET is not set.");
  process.exit(1);
}

const q = faunadb.query as any;
const client = new faunadb.Client({ secret });

(async () => {
  await client.query(
    q.CreateCollection({
      name: "endpoints",
      history_days: 0,
      ttl_days: 1,
    })
  );
  await client.query(
    q.CreateCollection({
      name: "results",
      history_days: 0,
      ttl_days: 1,
    })
  );
  await client.query(
    q.CreateIndex({
      name: "endpoints_by_key",
      source: q.Collection("endpoints"),
      terms: [{ field: ["data", "key"] }],
      unique: true,
    })
  );
  await client.query(
    q.CreateIndex({
      name: "results_by_key_order_by_requestedAt",
      source: q.Collection("results"),
      terms: [{ field: ["data", "key"] }],
      values: [
        { field: ["data", "requestedAt"], reverse: true },
        { field: ["ref"] },
      ],
      unique: true,
    })
  );
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
