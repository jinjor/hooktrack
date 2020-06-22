import * as faunadb from "faunadb";

const secret = process.env.FAUNADB_ADMIN_SECRET || "";
console.log("FAUNADB_ADMIN_SECRET:", secret.replace(/\w/g, "*"));
if (!secret) {
  console.log("FAUNADB_ADMIN_SECRET is not set.");
  process.exit(1);
}

const dbName = process.argv[2];
console.log("dbName:", dbName);
if (!dbName) {
  console.log("dbName is not set.");
  process.exit(1);
}

const q = faunadb.query as any;
const client = new faunadb.Client({ secret });

(async () => {
  await client.query(
    q.CreateDatabase({
      name: dbName,
      priority: 1,
    })
  );
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
