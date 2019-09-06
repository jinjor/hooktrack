import * as faunadb from "faunadb";

const secret = process.env.FAUNADB_SERVER_SECRET || "";
const testMode = !secret;

console.log("FAUNADB_SERVER_SECRET:", secret.replace(/\w/g, "*"));
if (testMode) {
  console.log(`data module will work with "test" mode.`);
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
    const setRef = await this.client.query(
      q.Match(q.Index("endpoints_by_key"), key)
    );
    console.log("getEndpoint:success", setRef);
    if (await this.client.query(q.Exists(setRef))) {
      const res = await this.client.query(q.Get(setRef));
      return res.data.endpoint;
    } else {
      return null;
    }
  }
  async getResults(key: string, from: number): Promise<Result[]> {
    if (!(await this.getEndpoint(key))) {
      return null;
    }
    const { client, q } = this;
    const res = await client.query(
      q.Map(
        q.Paginate(q.Match(q.Index("results_by_key"), key)),
        q.Lambda("r", q.Get(q.Var("r")))
      )
    );
    console.log("getEndpoint:success", res);
    const all = [];
    for (const result of res.data) {
      if (result.data.requestedAt > (from || 0)) {
        all.push(result.data);
      }
    }
    return all;
  }
}
