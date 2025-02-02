import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as path from "node:path";
import * as querystring from "node:querystring";
import * as timers from "node:timers";

interface Token {
    access_token: string;
    token_type: string;
    requested: number;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

interface Response<T> {
    meta: {
        status: number;
        msg: string;
    };
    response: T;
}


interface ArraySupport<T> {
    totalKey: string;
    valuesKey: string;
    keyIndex: string;
    keys: Set<string>;
    process?: (latest: T[]) => Promise<void>;
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

export interface ContentItem {
    type: string;
    [key: string]: unknown;
}

export interface MediaItem {
    [key: string]: unknown;
    url: string;
    type: string;
    width?: number;
    height?: number;
    original_dimensions_missing?: boolean;
    cropped?: boolean;
    has_original_dimensions?: boolean;
}

export interface ImageItem extends ContentItem {
    type: "image";
    media: MediaItem[];
}

export interface AudioItem extends ContentItem {
    type: "audio";
    media: MediaItem;
    provider: string;
}

export interface VideoItem extends ContentItem {
    type: "video";
    media: MediaItem;
    provider: string;
}

export type BackuppableItem = ImageItem | AudioItem | VideoItem;

interface TrailItem {
    content: BackuppableItem[];
}

export interface Post {
    [key: string]: unknown;
    id_string: string;
    timestamp: number;
    content: BackuppableItem[];
    trail: TrailItem[];
}

type QueryParams = Record<string, number | string | boolean>;
type ArrayQueryParams = QueryParams & {
    limit: number;
    offset: number;
};

export class Client {
    private readonly tokenPath: string;
    private token: Token | undefined = undefined;
    private lastCall: number | undefined = undefined;

    public constructor(appPath: string) {
        this.tokenPath = path.join(appPath, "token.json");
    }

    public async apiArrayCall<T extends Record<string, unknown>>(
        api: string, support: ArraySupport<T>, parameters?: QueryParams
    ): Promise<T[]> {
        const newParams = { ...parameters ?? {} };
        if (!Object.hasOwn(newParams, "limit")) {
            newParams["limit"] = -1;
        }

        if (!Object.hasOwn(newParams, "offset")) {
            newParams["offset"] = 0;
        }

        const localParams = { ...newParams } as ArrayQueryParams;
        localParams.limit = 20;

        const res = await this.doApiArrayCall(api, [], support, newParams as ArrayQueryParams, localParams);
        return res;
    }

    public async apiCall<T extends Record<string, unknown>>(api: string, parameters?: QueryParams): Promise<T> {
        await this.fetchToken();

        const current = Date.now();
        if (this.lastCall && (current - this.lastCall) < 2000) {
            await new Promise((resolve) => timers.setTimeout(resolve, current - this.lastCall!));
        }
        this.lastCall = current;

        return new Promise<T>((resolve, reject) => {
            const params = querystring.stringify({
                api_key: process.env["CLIENT_ID"],
                ...(parameters ?? {})
            });

            let apiData = "";

            console.debug(`calling API: /v2/${api}?${params}`);

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

                res.on("end", async () => {
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
                                    try {
                                        await this.fetchToken();
                                        timers.setImmediate(() => {
                                            console.debug(`\ttrying new token`);
                                            resolve(this.apiCall(api, parameters));
                                        });
                                    } catch (err) {
                                        reject(err);
                                    }
                                    break;

                                default:
                                    reject(new Error(`${result.meta.status} ${result.meta.msg}`));
                                    break;
                            }
                            break;

                        case 401:
                            try {
                                await this.fetchToken();
                                timers.setImmediate(() => {
                                    console.debug(`\ttrying new token`);
                                    resolve(this.apiCall(api, parameters));
                                });
                            } catch (err) {
                                reject(err);
                            }
                            break;

                        case 429:
                            timers.setTimeout(() => {
                                console.debug(`\trate limit reached, retrying in 10 seconds...`);
                                resolve(this.apiCall(api, parameters));
                            }, 10000);
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

            apiReq.on("timeout", () => {
                apiReq.destroy();

                timers.setTimeout(() => {
                    console.debug(`\ttimeout, retrying in 10 seconds...`);
                    resolve(this.apiCall(api, parameters));
                }, 10000);
            });

            apiReq.end();
        });
    }

    private async doApiArrayCall<T extends Record<string, unknown>>(
        api: string, prev: T[], support: ArraySupport<T>, globalParameters: ArrayQueryParams, localParameters: ArrayQueryParams
    ): Promise<T[]> {
        const data = await this.apiCall<Record<PropertyKey, unknown>>(api, localParameters);

        const total = data[support.totalKey] as number;
        const values = (data[support.valuesKey] as T[]).filter((value) => !support.keys.has(value[support.keyIndex] as string));
        for (const value of values) {
            support.keys.add(value[support.keyIndex] as string);
        }

        const newValues = [
            ...prev,
            ...values
        ];

        await support.process?.(values);

        switch (globalParameters.limit) {
            case -1:
                if (newValues.length >= total) {
                    return newValues.slice(0, total);
                }
                break;

            default:
                if (globalParameters.limit <= newValues.length) {
                    return newValues.slice(0, globalParameters.limit);
                }
                break;
        }

        const newParams = { ...localParameters };
        newParams.offset = globalParameters.offset + newValues.length;
        newParams.limit = 20;
        return values.length === 0 ? newValues : this.doApiArrayCall(api, newValues, support, globalParameters, newParams);
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
                        code: process.env["CODE"],
                        redirect_uri: process.env["REDIRECT_URI"]
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
                if (res.statusCode !== 200) {
                    reject(new Error(`${res.statusCode} ${res.statusMessage}`));
                    return;
                }

                res.setEncoding("utf8");

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

            authReq.on("timeout", () => {
                authReq.destroy();
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
            await this.getNewToken();
            await this.fetchToken();
        }
    }
}
