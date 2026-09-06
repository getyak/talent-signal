import { describe, expect, it, vi } from "vitest";

import { TikHubProvider } from "./tikHubProvider.js";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TikHubProvider", () => {
  it("normalizes the nested live envelopes used by Douyin v2, Weibo v2, and Threads GraphQL", async()=>{
    const envelopes=[
      {platform:"douyin" as const,data:{data:{user_list:[{user_id:"42",nick_name:"Example Person"}]}}},
      {platform:"weibo" as const,data:{parsed_data:{users:[{uid:"42",name:"Example Person",profile_url:"https://weibo.com/u/42"}]}}},
      {platform:"threads" as const,data:{xdt_api__v1__users__search_connection:{edges:[{node:{pk:"42",username:"example",full_name:"Example Person"}}]}}},
    ];
    for(const envelope of envelopes){
      const provider=new TikHubProvider({apiKey:"test-secret",fetcher:(async()=>response({code:200,request_id:"live-shape",data:envelope.data})) as typeof fetch});
      const result=await provider.searchProfiles({platform:envelope.platform,query:"Example Person",maximumResults:2},new AbortController().signal);
      expect(result).toHaveLength(1);expect(result[0]).toMatchObject({displayName:"Example Person",providerRequestID:"live-shape"});
    }
  });
  it("uses the bearer credential without returning it and normalizes Douyin profiles", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret-value" });
      expect(JSON.parse(String(init?.body))).toEqual({
        keyword: "周宇",
        cursor: 0,
      });
      return response({
        code: 200,
        request_id: "request-1",
        data: {
          user_list: [
            {
              user_info: {
                uid: "42",
                sec_uid: "secure-42",
                unique_id: "zhouyu",
                nickname: "周宇",
                signature: "公开简介",
                follower_count: 1200,
                is_verified: true,
                gender: 1,
                avatar_thumb: { url_list: ["https://cdn.example/avatar.jpg"] },
              },
            },
          ],
        },
      });
    });
    const provider = new TikHubProvider({
      apiKey: "secret-value",
      baseUrl: "https://api.tikhub.dev",
      fetcher: fetcher as typeof fetch,
    });

    const profiles = await provider.searchProfiles(
      { platform: "douyin", query: "周宇", maximumResults: 5 },
      new AbortController().signal,
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      platform: "douyin",
      providerID: "tikhub",
      providerRequestID: "request-1",
      profileID: "42",
      displayName: "周宇",
      handle: "zhouyu",
      biography: "公开简介",
      profileUrl: "https://www.douyin.com/user/secure-42",
      verified: true,
    });
    expect(profiles[0]).not.toHaveProperty("gender");
    expect(profiles[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(profiles)).not.toContain("secret-value");
  });

  it("normalizes Threads results and caps the returned result count", async () => {
    const provider = new TikHubProvider({
      apiKey: "secret-value",
      fetcher: (async () =>
        response({
          code: 200,
          request_id: "request-2",
          data: {
            users: [
              { pk: "1", username: "one", full_name: "One" },
              { pk: "2", username: "two", full_name: "Two" },
            ],
          },
        })) as typeof fetch,
    });

    const profiles = await provider.searchProfiles(
      { platform: "threads", query: "example", maximumResults: 1 },
      new AbortController().signal,
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.profileUrl).toBe("https://www.threads.net/@one");
  });

  it("checks liveness and credential envelopes without exposing account fields", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.headers).not.toHaveProperty("authorization");
        return response({ status: "ok" });
      })
      .mockResolvedValueOnce(
        response({
          code: 200,
          api_key_data: { api_key_status: 1 },
          user_data: { email: "private@example.com", balance: 100 },
        }),
      );
    const provider = new TikHubProvider({
      apiKey: "secret-value",
      fetcher: fetcher as typeof fetch,
    });

    await expect(provider.checkHealth()).resolves.toEqual({ status: "ok" });
    await expect(provider.checkCredential()).resolves.toEqual({ authorized: true });
  });

  it("rejects unsafe origins, sensitive queries, auth failures, and oversized limits", async () => {
    expect(
      () =>
        new TikHubProvider({
          apiKey: "secret-value",
          baseUrl: "https://attacker.example",
        }),
    ).toThrow("api.tikhub.dev or api.tikhub.io");

    const provider = new TikHubProvider({
      apiKey: "secret-value",
      fetcher: (async () => response({}, 401)) as typeof fetch,
    });
    await expect(
      provider.searchProfiles(
        { platform: "weibo", query: "alice@example.com email", maximumResults: 5 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "TIKHUB_SENSITIVE_QUERY_PROHIBITED",
    });
    await expect(provider.checkCredential()).rejects.toMatchObject({
      code: "TIKHUB_AUTH_FAILED",
    });
    await expect(
      provider.searchProfiles(
        { platform: "tiktok", query: "example", maximumResults: 11 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "TIKHUB_RESULT_LIMIT_INVALID",
    });
  });
});
