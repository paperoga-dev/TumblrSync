import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as path from "node:path";
import * as querystring from "node:querystring";

interface Token {
    access_token: string;
    token_type: string;
    requested: number;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

interface ArrayLink {
    href: string;
    method: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    query_params: {
        limit: string;
        offset: string;
    };
}

interface ArrayLinks {
    next?: ArrayLink;
    prev?: ArrayLink;
}

interface Response<T> {
    meta: {
        status: number;
        msg: string;
    };
    response: Partial<ArrayLinks> & T;
}


interface ArraySupport {
    totalKey: string;
    valuesKey: string;
    keyIndex?: string;
    progress?: (current: number, total: number) => void;
}

export interface Blog {
    followers: number;
    name: string;
    description: string;
    posts: number;
    title: string;
    updated: number;
    url: string;
}

export interface User {
    name: string;
    likes: number;
    following: number;
    blogs: Blog[];
}

export interface Info {
    user: User;
}

export interface Contact {
    name: string;
    url: string;
    updated: number;
}

type QueryParams = Record<PropertyKey, number | string>;
type ArrayQueryParams = QueryParams & {
    limit: number;
    offset: number;
};

export class Client {
    private readonly tokenPath: string;
    private token: Token | undefined = undefined;

    public constructor(appPath: string) {
        this.tokenPath = path.join(appPath, "token.json");
    }

    public async apiArrayCall<T>(
        api: string, support: ArraySupport, parameters?: ArrayQueryParams
    ): Promise<T[]> {
        const newParams = { ...parameters ?? {} as ArrayQueryParams };
        newParams.limit = 20;
        newParams.offset = 0;
        const res = await this.doApiArrayCall(api, [], support, newParams);
        return res;
    }

    public async apiCall<T>(api: string, parameters?: QueryParams): Promise<T> {
        await this.fetchToken();

        return new Promise<T>((resolve, reject) => {
            const params = querystring.stringify({
                api_key: process.env["CLIENT_ID"],
                ...(parameters ?? {})
            });

            let apiData = "";

            const apiReq = https.request({
                hostname: "api.tumblr.com",
                port: 443,
                path: `/v2/${api}?${params}`,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.token?.access_token}`,
                    "User-Agent": "TumblrSync/1.0.0"
                }
            }, (res) => {
                res.on("data", (chunk) => {
                    apiData += chunk;
                });

                res.on("end", () => {
                    switch (res.statusCode) {
                        case 200:
                            if (apiData === "") {
                                reject(new Error("No response"));
                                return;
                            }

                            const result = JSON.parse(apiData) as Response<T>;

                            switch (result.meta.status) {
                                case 200:
                                    resolve(result.response);
                                    break;

                                case 401:
                                    reject(new Error("Unauthorized"));
                                    break;

                                default:
                                    reject(new Error(`${result.meta.status} ${result.meta.msg}`));
                                    break;
                            }
                            break;

                        case 401:
                            reject(new Error("Unauthorized"));
                            break;

                        default:
                            reject(new Error(`${res.statusCode} ${res.statusMessage}`));
                            break;
                    }
                });
            });

            apiReq.on("error", (err) => {
                reject(err);
            });
            apiReq.end();
        });
    }

    private async doApiArrayCall<T>(
        api: string, prev: T[], support: ArraySupport, parameters: ArrayQueryParams
    ): Promise<T[]> {
        const data = await this.apiCall<Record<PropertyKey, unknown>>(api, parameters);

        const total = data[support.totalKey] as number;
        const values = data[support.valuesKey] as T[];

        const newValues = [
            ...prev,
            ...values
        ];

        let newData: T[] = [];

        if (support.keyIndex === undefined) {
            const filter = new Set(newValues);

            newData = Array.from(filter.values());
        } else {
            const filter = new Map<unknown, T>();
            for (const value of newValues) {
                /* eslint-disable @typescript-eslint/no-unsafe-member-access */
                /* eslint-disable @typescript-eslint/no-explicit-any */
                filter.set((value as any)[support.keyIndex], value);
            }

            newData = Array.from(filter.values());
        }

        if (support.progress) {
            support.progress(newData.length, total);
        }

        if (parameters.offset + 20 >= total) {
            return newData;
        }

        const newParams = { ...parameters };
        newParams.offset += 20;
        newParams.limit = 20;
        const res = await this.doApiArrayCall(api, newData, support, newParams);
        return res;
    }

    private async getNewToken(refreshToken?: string): Promise<Token> {
        return new Promise<Token>((resolve, reject) => {
            const tokenData = querystring.stringify({
                ...{
                    grant_type: refreshToken ? "refresh_token" : "authorization_code",
                    client_id: process.env["CLIENT_ID"],
                    client_secret: process.env["CLIENT_SECRET"]
                },
                ...(refreshToken
                    ? {
                        refresh_token: refreshToken
                    } : {
                        code: process.env["CODE"]
                    }
                )
            });

            let authData = "";

            const authReq = https.request({
                hostname: "api.tumblr.com",
                port: 443,
                path: "/v2/oauth2/token",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(tokenData)
                }
            }, (res) => {
                res.on("data", (chunk) => {
                    authData += chunk;
                });

                res.on("end", async () => {
                    const token = JSON.parse(authData) as Partial<Token>;
                    token.requested = Math.trunc(Date.now() / 1000);
                    await fs.writeFile(this.tokenPath, JSON.stringify(token), { encoding: "utf-8" });
                    resolve(token as Token);
                });
            });

            authReq.on("error", (err) => {
                reject(err);
            });

            authReq.write(tokenData);
            authReq.end();
        });
    }

    private async fetchToken(): Promise<void> {
        try {
            if (!this.token) {
                this.token = JSON.parse(await fs.readFile(this.tokenPath, { encoding: "utf-8" })) as Token;
            }

            if (this.token.requested + this.token.expires_in < (Math.trunc(Date.now() / 1000) - 30)) {
                this.token = await this.getNewToken(this.token?.refresh_token);
            }
        } catch (ignoreErr) {
            this.getNewToken();
            await this.fetchToken();
        }
    }
}
