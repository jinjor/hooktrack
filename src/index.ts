import { getData, endpointDecoder, fromDecoder } from "./common/data";
import * as lambda from "aws-lambda";
import { Decoder } from "./common/decoder";
import { inspect, promisify } from "util";
import { gunzip, inflate } from "zlib";
import { utils } from "mocha";

const data = getData();

const handler: lambda.APIGatewayProxyHandler = async (
  event: lambda.APIGatewayProxyEvent,
  context: lambda.Context
) => {
  try {
    const method = event.httpMethod;
    const path = trimPath(event.path);
    const headers = event.headers;
    // prd only
    if (!event.path.includes("functions")) {
      event.body = await inflateIfNeeded(
        event.body,
        headers["content-encoding"]
      );
    }
    const body = parseJson(event.body);
    let matched = [];
    if (method === "POST" && path === "/endpoints") {
      const endpoint = decode(endpointDecoder, body);
      const key = await data.addEndPoint(endpoint);
      return sendJson(200, { key });
    } else if (
      method === "GET" &&
      (matched = /^\/endpoints\/([^/]+)\/results/.exec(path))
    ) {
      const key = matched[1];
      const from = decode(fromDecoder, event.queryStringParameters.from);
      const results = await data.getResults(key, from);
      if (!results) {
        throw new StatusError(404, "endpoint not found");
      }
      return sendJson(200, {
        items: results,
      });
    } else if ((matched = /^\/([^/]+)/.exec(path))) {
      const key = matched[1];
      const endpoint = await data.getEndpoint(key);
      if (endpoint && endpoint.method === method) {
        const request = {
          method,
          headers,
          body,
        };
        await data.addRequest(key, request);
        console.log("endpoint.response", endpoint.response);
        return {
          statusCode: endpoint.response.status,
          headers: endpoint.response.headers,
          body: endpoint.response.body,
        };
      }
      // fall through
    }
    throw new StatusError(404, "path not found");
  } catch (e) {
    if (e instanceof StatusError) {
      return sendJson(e.code, {
        message: e.message,
      });
    }
    console.log("unhandled", e);
    return sendJson(500, {
      message: "unexpected error",
    });
  }
};
async function inflateIfNeeded(
  source: string,
  contentEncoding: string
): Promise<string> {
  try {
    if (contentEncoding === "gzip") {
      return (
        await promisify(gunzip)(Buffer.from(source, "base64"))
      ).toString();
    } else if (contentEncoding === "deflate") {
      return (
        await promisify(inflate)(Buffer.from(source, "base64"))
      ).toString();
    }
    return source;
  } catch (e) {
    throw new StatusError(
      400,
      e.message + ": " + typeof source + ": " + source
    );
  }
}
function decode<T>(decoder: Decoder<T>, value: unknown): T {
  try {
    return decoder.run(value);
  } catch (e) {
    throw new StatusError(400, e.message);
  }
}
function trimPath(path: string): string {
  return path.replace(/(^\/\.netlify\/functions\/index|^\/api)/, "");
}
function parseJson(body: string): any {
  try {
    return body && typeof body === "string" ? JSON.parse(body) : null;
  } catch (e) {
    throw new StatusError(
      400,
      "Only JSON body is supported for now: " + inspect(body)
    );
  }
}
function sendJson(statusCode: number, body: any): lambda.APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
}
class StatusError {
  constructor(public code: number, public message: string) {}
}

exports.handler = handler;
