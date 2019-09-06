import * as faunadb from "faunadb";

const secret = process.env.FAUNADB_SERVER_SECRET || "";

console.log("FAUNADB_SERVER_SECRET:", secret.replace(/\w/g, "*"));
if (!secret) {
  console.log("FAUNADB_SERVER_SECRET is not set.");
  process.exit(1);
}

import * as uuid from "uuid";
import {
  Decoder,
  object,
  optional,
  number,
  string,
  keywords,
  dict
} from "./decoder";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTION";
type Headers = { [key: string]: string };
interface Request {
  method: Method;
  headers: Headers;
  body: string;
}
interface Response {
  status: number;
  headers: Headers;
  body: string;
}
interface Endpoint {
  method: Method;
  response?: Response;
}
interface EndpointWithStatus {
  endpoint: Endpoint;
  results: Result[];
  expiredAt: number;
}
interface Result {
  request: Request;
  requestedAt: number;
}

const methodDecoder: Decoder<Method> = keywords([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTION"
]);
const responseDecoder: Decoder<Response> = object({
  status: optional(number, 200),
  headers: optional(dict(string), {}),
  body: optional(string)
});
export const endpointDecoder: Decoder<Endpoint> = object({
  method: methodDecoder,
  response: optional(responseDecoder)
});

export interface Data {
  addEndPoint(endpoint: Endpoint): Promise<string>;
  addRequest(key: string, request: Request): Promise<Result>;
  getEndpoint(key: string): Promise<Endpoint>;
  getResults(key: string, from: number): Promise<Result[]>;
}

export function getData(): Data {
  return new DataImpl();
}

class DataImpl implements Data {
  private q: any;
  private client: any;
  constructor() {
    this.q = faunadb.query;
    this.client = new faunadb.Client({ secret });
  }
  async addEndPoint(endpoint: Endpoint): Promise<string> {
    const { q } = this;
    const key: string = uuid.v4();
    const data = {
      key,
      endpoint
    };
    const res = await this.client.query(
      q.Create(q.Collection("endpoints"), {
        data,
        ttl: q.Epoch(Date.now() + 1 * 60 * 60 * 1000, "millisecond")
      })
    );
    console.log("addEndPoint:success", res);
    return key;
  }
  async addRequest(key: string, request: Request): Promise<Result> {
    const { q } = this;
    const result = {
      key,
      request,
      requestedAt: Date.now()
    };
    const res = await this.client.query(
      q.Create(q.Collection("results"), {
        data: result,
        ttl: q.Epoch(Date.now() + 1 * 60 * 60 * 1000, "millisecond")
      })
    );
    console.log("addRequest:success", res);
    return result;
  }
  async getEndpoint(key: string): Promise<Endpoint> {
    const { q } = this;
    const endpoint = await this.client.query(
      q.Let(
        { ref: q.Match("endpoints_by_key", key) },
        q.If(
          q.Exists(q.Var("ref")),
          q.Select(["data", "endpoint"], q.Get(q.Var("ref"))),
          null
        )
      )
    );
    console.log("getEndpoint:success", endpoint);
    return endpoint;
  }
  async getResults(key: string, from: number): Promise<Result[]> {
    if (!(await this.getEndpoint(key))) {
      return null;
    }
    const { client, q } = this;
    const items = await client.query(
      q.Select(
        "data",
        q.Filter(
          q.Map(
            q.Paginate(q.Match("results_by_key_order_by_requestedAt", key), {
              size: 100000
            }),
            q.Lambda(["_", "ref"], q.Select("data", q.Get(q.Var("ref"))))
          ),
          q.Lambda("x", q.GTE(q.Select("requestedAt", q.Var("x")), from || 0))
        )
      )
    );
    console.log("getResults:success", items);
    return items;
  }
}
