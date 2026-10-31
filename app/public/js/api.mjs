// One wrapper for every call to the local server. It adds the token header,
// turns the server's JSON errors into one error type, and tells a server that is
// gone (the request never got an answer) apart from a server that said no.
//
// A conflict (HTTP 409) and a refused write ({ok:false}) are answers, not
// failures, so they come back as data for the page to show.

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }
}

export function createApi({ token, fetchImpl = (...a) => fetch(...a), onNetworkError = () => {}, onAnswer = () => {} }) {
  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(path, {
        method,
        headers: { "x-app-token": token, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // fetch rejects only when no HTTP answer arrived at all.
      const e = new NetworkError(err?.message || "network error");
      onNetworkError(e);
      throw e;
    }
    onAnswer();
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok && res.status !== 409) {
      throw new ApiError(data?.error || `${method} ${path} failed (${res.status})`, res.status, data);
    }
    return { status: res.status, data };
  }
  return {
    request,
    async get(path) {
      return (await request("GET", path)).data;
    },
    // Resolves with {status, data}; a 409 conflict is a normal answer here.
    post: (path, body = {}) => request("POST", path, body),
  };
}
